import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { DocumentScanner } from '@capacitor-mlkit/document-scanner';
import { LabImage, LabSample } from '../models/lab.models';

const CACHE_DIR = 'ocr-lab';

/**
 * Obtiene la imagen a analizar y la deja siempre en el mismo formato.
 *
 * Punto clave para que el benchmark sea honesto: venga de donde venga, la
 * imagen se escribe **una vez** en un archivo de caché y todos los motores
 * reciben exactamente los mismos bytes. Si cada adaptador convirtiera por su
 * cuenta, estaríamos midiendo conversiones y no OCR.
 */
@Injectable({ providedIn: 'root' })
export class ImageSourceService {
  async fromCamera(): Promise<LabImage> {
    return this.fromCameraSource(CameraSource.Camera, 'camera');
  }

  async fromGallery(): Promise<LabImage> {
    return this.fromCameraSource(CameraSource.Photos, 'gallery');
  }

  async fromSynthetic(dataUrl: string, knownText: string): Promise<LabImage> {
    return this.materialize(dataUrl, 'synthetic', knownText);
  }

  async fromSample(dataUrl: string, sample: LabSample): Promise<LabImage> {
    return this.materialize(dataUrl, 'sample', sample.groundTruth, sample.keyFields);
  }

  /** ¿Está disponible el escáner de documentos de ML Kit? (sólo Android) */
  async isDocumentScannerAvailable(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      const { available } = await DocumentScanner.isGoogleDocumentScannerModuleAvailable();
      return available;
    } catch {
      return false;
    }
  }

  /** Instala el módulo del escáner desde Play Services (sólo Android). */
  async installDocumentScanner(): Promise<void> {
    await DocumentScanner.installGoogleDocumentScannerModule();
  }

  /**
   * Captura con recorte, enderezado y realce automáticos.
   *
   * Es un preprocesamiento, no un motor de OCR: sirve para medir cuánto mejora
   * cada motor cuando recibe un documento ya rectificado en vez de una foto
   * tomada en ángulo.
   */
  async fromDocumentScanner(): Promise<LabImage> {
    const result = await DocumentScanner.scanDocument({
      resultFormats: 'JPEG',
      pageLimit: 1,
      scannerMode: 'FULL',
      galleryImportAllowed: true,
    });

    const uri = result.scannedImages?.[0];
    if (!uri) throw new Error('El escáner no devolvió ninguna página.');

    const dataUrl = await this.readAsDataUrl(uri);
    return this.materialize(dataUrl, 'document-scanner');
  }

  private async fromCameraSource(
    source: CameraSource,
    label: LabImage['source'],
  ): Promise<LabImage> {
    const photo = await Camera.getPhoto({
      source,
      resultType: CameraResultType.Uri,
      // Sin `allowEditing` ni recompresión: queremos evaluar los motores sobre
      // la foto tal como sale de la cámara.
      quality: 100,
      correctOrientation: true,
    });

    const origin = photo.path ?? photo.webPath;
    if (!origin) throw new Error('La cámara no devolvió una ruta de imagen.');

    const dataUrl = await this.readAsDataUrl(origin);
    return this.materialize(dataUrl, label);
  }

  /** Lee una ruta nativa o una URL del WebView y devuelve su data-URL. */
  private async readAsDataUrl(pathOrUrl: string): Promise<string> {
    const isNativePath = pathOrUrl.startsWith('file://') || pathOrUrl.startsWith('/');

    if (Capacitor.isNativePlatform() && isNativePath) {
      const { data } = await Filesystem.readFile({ path: pathOrUrl });
      const base64 = typeof data === 'string' ? data : await blobToBase64(data);
      return `data:${guessMime(pathOrUrl)};base64,${base64}`;
    }

    const response = await fetch(Capacitor.convertFileSrc(pathOrUrl));
    const blob = await response.blob();
    return `data:${blob.type || 'image/jpeg'};base64,${await blobToBase64(blob)}`;
  }

  /** Escribe la imagen canónica en caché y completa las medidas. */
  private async materialize(
    dataUrl: string,
    source: LabImage['source'],
    knownText?: string,
    keyFields?: string[],
  ): Promise<LabImage> {
    const [header, base64] = splitDataUrl(dataUrl);
    const mimeType = header;
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const relativePath = `${CACHE_DIR}/input-${Date.now()}.${extension}`;

    await Filesystem.writeFile({
      path: relativePath,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({ path: relativePath, directory: Directory.Cache });
    const { width, height } = await measure(dataUrl);

    return {
      fileUri: uri,
      webPath: Capacitor.convertFileSrc(uri),
      base64,
      dataUrl,
      mimeType,
      width,
      height,
      byteLength: Math.round((base64.length * 3) / 4),
      source,
      knownText,
      keyFields,
    };
  }

  /** Borra las imágenes de trabajo acumuladas en caché. */
  async clearCache(): Promise<void> {
    try {
      await Filesystem.rmdir({ path: CACHE_DIR, directory: Directory.Cache, recursive: true });
    } catch {
      // El directorio puede no existir todavía; no es un error.
    }
  }
}

function splitDataUrl(dataUrl: string): [string, string] {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('La imagen no está en formato data-URL base64.');
  return [match[1], match[2]];
}

function guessMime(path: string): string {
  return /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function measure(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}
