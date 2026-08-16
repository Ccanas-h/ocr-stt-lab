import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorPluginMlKitTextRecognition } from '@pantrist/capacitor-plugin-ml-kit-text-recognition';
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
 * ML Kit Text Recognition v2 **servido por Google Play Services**.
 *
 * Es el mismo motor que `mlkit-bundled`, pero el modelo lo entrega Play
 * Services en vez de viajar dentro del APK. Se compara justamente para medir
 * dos cosas que sí difieren: el peso del binario y la latencia de arranque en
 * frío la primera vez (si el modelo aún no está en el dispositivo).
 */
@Injectable({ providedIn: 'root' })
export class MlkitUnbundledEngine implements OcrEngine {
  readonly id = 'mlkit-unbundled';
  readonly label = 'ML Kit v2 (vía Play Services)';
  readonly vendor = 'Google · Pantrist';
  readonly pkg = '@pantrist/capacitor-plugin-ml-kit-text-recognition';
  readonly backend: Record<Platform, string> = {
    android: 'com.google.android.gms:play-services-mlkit-text-recognition',
    ios: 'GoogleMLKit/TextRecognition (pod)',
    web: 'no soportado',
  };
  readonly notes =
    'APK liviano: el modelo lo entrega Play Services. Requiere Play Services presente y, la primera vez, descarga del modelo. Sólo escritura latina.';

  async isSupported(): Promise<EngineSupport> {
    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      return { available: false, native: false, reason: 'ML Kit no tiene implementación web.' };
    }
    return { available: true, native: true };
  }

  async recognize(image: LabImage, _options: OcrOptions): Promise<OcrOutput> {
    const result = await CapacitorPluginMlKitTextRecognition.detectText({
      base64Image: image.base64,
      rotation: 0,
    });

    const blocks: OcrBlock[] = (result.blocks ?? []).map((block) => ({
      text: block.text,
      boundingBox: block.boundingBox
        ? {
            left: block.boundingBox.left,
            top: block.boundingBox.top,
            right: block.boundingBox.right,
            bottom: block.boundingBox.bottom,
          }
        : undefined,
    }));

    return { text: result.text ?? '', blocks };
  }
}
