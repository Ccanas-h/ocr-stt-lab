import { Injectable } from '@angular/core';
import { createWorker, type Worker } from 'tesseract.js';
import {
  EngineSupport,
  LabImage,
  OcrBlock,
  OcrEngine,
  OcrOptions,
  OcrOutput,
  Platform,
} from '../../models/lab.models';

/**
 * Tesseract 5 compilado a WebAssembly, ejecutándose dentro del WebView.
 *
 * No es candidato a producción móvil (es el más lento y el más pesado en RAM),
 * pero es el **control** del experimento: es el único motor idéntico en las
 * tres plataformas, así que cualquier diferencia que veamos entre Android e
 * iOS en este motor viene del WebView, no del OCR. Además es el único que
 * funciona en `ionic serve`, lo que permite probar la pantalla sin dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class TesseractEngine implements OcrEngine {
  readonly id = 'tesseract-wasm';
  readonly label = 'Tesseract 5 (WASM, control)';
  readonly vendor = 'Tesseract OCR';
  readonly pkg = 'tesseract.js';
  readonly backend: Record<Platform, string> = {
    android: 'WebAssembly dentro del WebView',
    ios: 'WebAssembly dentro del WebView',
    web: 'WebAssembly',
  };
  readonly notes =
    'Referencia de comparación, no candidato a producción: descarga modelos (~15 MB por idioma) y es varias veces más lento. Único motor que corre también en el navegador.';

  private worker?: Worker;
  private workerLang?: string;

  async isSupported(): Promise<EngineSupport> {
    if (typeof WebAssembly === 'undefined') {
      return { available: false, native: false, reason: 'El WebView no soporta WebAssembly.' };
    }
    return { available: true, native: false };
  }

  async recognize(image: LabImage, options: OcrOptions): Promise<OcrOutput> {
    const worker = await this.getWorker(options.tesseractLang);
    const { data } = await worker.recognize(image.dataUrl);

    const blocks: OcrBlock[] = (data.blocks ?? []).map((b) => ({
      text: b.text,
      confidence: b.confidence / 100,
      boundingBox: b.bbox
        ? { left: b.bbox.x0, top: b.bbox.y0, right: b.bbox.x1, bottom: b.bbox.y1 }
        : undefined,
    }));

    return {
      text: data.text ?? '',
      blocks,
      confidence: typeof data.confidence === 'number' ? data.confidence / 100 : undefined,
    };
  }

  /**
   * Reutiliza el worker entre corridas y sólo lo recrea al cambiar de idioma.
   * Crear el worker implica descargar y cargar el modelo, así que hacerlo en
   * cada repetición falsearía por completo la medición de tiempos.
   */
  private async getWorker(lang: string): Promise<Worker> {
    if (this.worker && this.workerLang === lang) {
      return this.worker;
    }
    await this.terminate();

    // El worker y el núcleo WASM viajan dentro de la app (ver `assets` en
    // angular.json). Por defecto tesseract.js los descargaría de un CDN, lo
    // que en el WebView de Capacitor falla por origen cruzado y además
    // metería la latencia de red dentro de la medición.
    this.worker = await createWorker(lang, undefined, {
      workerPath: 'tesseract/worker.min.js',
      corePath: 'tesseract-core',
      // El modelo de idioma (~15 MB) sí se descarga la primera vez y queda
      // cacheado en IndexedDB. Es una diferencia real frente a ML Kit y hay
      // que tenerla presente al leer el tiempo de arranque en frío.
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      cacheMethod: 'write',
    });
    this.workerLang = lang;
    return this.worker;
  }

  /** Libera el worker y su modelo. La pantalla la llama al destruirse. */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = undefined;
      this.workerLang = undefined;
    }
  }
}
