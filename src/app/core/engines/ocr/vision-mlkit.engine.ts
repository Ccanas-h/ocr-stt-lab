import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Ocr } from '@jcesarmobile/capacitor-ocr';
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
 * Motor híbrido: **Apple Vision** en iOS y **ML Kit v2** en Android.
 *
 * Es exactamente la estrategia "mejor motor por plataforma" que queremos para
 * producción, ya resuelta por el plugin. Sirve como referencia de cuánto gana
 * iOS con Vision frente a ML Kit, sin que la app tenga que enterarse.
 *
 * Es el único motor de la batería que reporta confianza por fragmento.
 */
@Injectable({ providedIn: 'root' })
export class VisionMlkitEngine implements OcrEngine {
  readonly id = 'vision-mlkit';
  readonly label = 'Apple Vision (iOS) / ML Kit (Android)';
  readonly vendor = 'Apple + Google · jcesarmobile';
  readonly pkg = '@jcesarmobile/capacitor-ocr';
  readonly backend: Record<Platform, string> = {
    android: 'com.google.mlkit:text-recognition (bundled)',
    ios: 'Vision.VNRecognizeTextRequest (framework del sistema)',
    web: 'no soportado',
  };
  readonly notes =
    'Único de la batería que entrega confianza en ambas plataformas: Text.Line.getConfidence() en Android y VNRecognizedText.confidence en iOS. En iOS usa el framework Vision del sistema, sin peso adicional.';

  async isSupported(): Promise<EngineSupport> {
    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      return {
        available: false,
        native: false,
        reason: 'Ni Vision ni ML Kit tienen implementación web.',
      };
    }
    return { available: true, native: true };
  }

  /**
   * Idiomas que se le declaran a Vision.
   *
   * No es opcional: sin `recognitionLanguages`, Vision reconoce **en inglés**,
   * que es su valor por omisión. Sobre un documento en español eso ataca las
   * tildes, la `ñ` y empuja la corrección lingüística hacia palabras inglesas.
   * El plugin no exponía la opción; la agrega nuestro parche.
   *
   * En Android el parámetro se ignora: ML Kit resuelve el alfabeto latino
   * completo con un solo modelo.
   */
  private languagesFor(options: OcrOptions): string[] {
    const language = options.language ?? 'es';
    return language.startsWith('es') ? ['es-ES', 'en-US'] : [language];
  }

  async recognize(image: LabImage, options: OcrOptions): Promise<OcrOutput> {
    const { results } = await Ocr.process({
      image: image.fileUri,
      languages: this.languagesFor(options),
      level: 'accurate',
      usesLanguageCorrection: true,
    });

    const blocks: OcrBlock[] = (results ?? []).map((r) => ({
      text: r.text,
      confidence: r.confidence,
    }));

    // El plugin devuelve fragmentos sueltos, no un texto agregado: lo armamos
    // en el mismo orden en que llegan (Vision y ML Kit ya los entregan
    // ordenados de arriba hacia abajo).
    const text = blocks
      .map((b) => b.text)
      .filter((t) => t.length > 0)
      .join('\n');

    const withConfidence = blocks.filter((b) => typeof b.confidence === 'number');
    const confidence =
      withConfidence.length > 0
        ? withConfidence.reduce((sum, b) => sum + (b.confidence ?? 0), 0) / withConfidence.length
        : undefined;

    return { text, blocks, confidence };
  }
}
