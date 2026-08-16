import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { OcrEngine, Platform, SttEngine } from '../models/lab.models';
import { MlkitBundledEngine } from './ocr/mlkit-bundled.engine';
import { MlkitUnbundledEngine } from './ocr/mlkit-unbundled.engine';
import { TesseractEngine } from './ocr/tesseract.engine';
import { VisionMlkitEngine } from './ocr/vision-mlkit.engine';
import { NATIVE_SPEECH_CONFIGS, NativeSpeechEngine } from './stt/native-speech.engine';
import { WebSpeechEngine } from './stt/web-speech.engine';

/**
 * Punto único donde se declaran los motores a comparar.
 *
 * Para sumar un candidato: escribir el adaptador que implemente `OcrEngine`
 * (o `SttEngine`) y agregarlo a la lista. Ni la UI ni el benchmark cambian.
 */
@Injectable({ providedIn: 'root' })
export class EngineRegistry {
  readonly ocr: readonly OcrEngine[] = [
    inject(MlkitBundledEngine),
    inject(MlkitUnbundledEngine),
    inject(VisionMlkitEngine),
    inject(TesseractEngine),
  ];

  // Las configuraciones nativas no necesitan inyección: son el mismo plugin
  // con parámetros distintos, y cada una compite como motor propio.
  //
  // Se filtran por plataforma porque las rutas de Android y de Apple no son
  // comparables entre sí: son APIs distintas de sistemas distintos. Lo que se
  // compara es cada una contra las de su propia plataforma.
  readonly stt: readonly SttEngine[] = [
    ...NATIVE_SPEECH_CONFIGS.filter((config) =>
      config.platforms.includes(Capacitor.getPlatform() as Platform),
    ).map((config) => new NativeSpeechEngine(config)),
    inject(WebSpeechEngine),
  ];

  ocrById(id: string): OcrEngine | undefined {
    return this.ocr.find((e) => e.id === id);
  }

  sttById(id: string): SttEngine | undefined {
    return this.stt.find((e) => e.id === id);
  }
}
