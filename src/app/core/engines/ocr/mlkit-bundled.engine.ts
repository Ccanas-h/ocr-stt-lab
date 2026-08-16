import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Script, TextRecognition } from '@capacitor-mlkit/text-recognition';
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
 * ML Kit Text Recognition v2 con los modelos **empaquetados en el APK/IPA**.
 *
 * Al venir embebido, funciona sin Google Play Services y sin descarga previa:
 * el primer reconocimiento no falla por "modelo no disponible". El costo es
 * tamaño de binario (los 5 modelos de escritura suman varios MB).
 */
@Injectable({ providedIn: 'root' })
export class MlkitBundledEngine implements OcrEngine {
  readonly id = 'mlkit-bundled';
  readonly label = 'ML Kit v2 (modelos embebidos)';
  readonly vendor = 'Google · Capawesome';
  readonly pkg = '@capacitor-mlkit/text-recognition';
  readonly backend: Record<Platform, string> = {
    android: 'com.google.mlkit:text-recognition (bundled)',
    ios: 'GoogleMLKit/TextRecognition (pod)',
    web: 'no soportado',
  };
  readonly notes =
    'Modelos dentro del binario: no requiere Play Services ni descarga. Único que soporta chino, devanagari, japonés y coreano. Aumenta el peso del APK/IPA. No expone la confianza que ML Kit sí calcula.';

  async isSupported(): Promise<EngineSupport> {
    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      return { available: false, native: false, reason: 'ML Kit no tiene implementación web.' };
    }
    return { available: true, native: true };
  }

  async recognize(image: LabImage, options: OcrOptions): Promise<OcrOutput> {
    const { text, blocks } = await TextRecognition.processImage({
      path: image.fileUri,
      script: options.script as Script,
    });

    const flat: OcrBlock[] = (blocks ?? []).map((b) => ({
      text: b.text,
      boundingBox: b.boundingBox
        ? {
            left: b.boundingBox.left,
            top: b.boundingBox.top,
            right: b.boundingBox.right,
            bottom: b.boundingBox.bottom,
          }
        : undefined,
    }));

    return { text: text ?? '', blocks: flat };
  }
}
