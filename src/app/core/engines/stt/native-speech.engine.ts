import { Injectable } from '@angular/core';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import {
  EngineSupport,
  Platform,
  SttEngine,
  SttEvent,
  SttOptions,
} from '../../models/lab.models';

/**
 * Reconocimiento de voz nativo del sistema operativo.
 *
 * Android usa `android.speech.SpeechRecognizer` e iOS `SFSpeechRecognizer`
 * (o el pipeline `SpeechAnalyzer` de iOS 26+ cuando se pide modo on-device).
 * Igual que en OCR, no hay microservicio: todo es capacidad del sistema.
 *
 * Ojo con `onDevice`: apagado, el motor puede enviar audio a los servidores
 * del fabricante. Encendido, el reconocimiento es 100 % local pero exige que
 * el idioma esté descargado en el dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class NativeSpeechEngine implements SttEngine {
  readonly id = 'native-speech';
  readonly label = 'Reconocimiento nativo del SO';
  readonly vendor = 'Google + Apple · Capgo';
  readonly pkg = '@capgo/capacitor-speech-recognition';
  readonly backend: Record<Platform, string> = {
    android: 'android.speech.SpeechRecognizer',
    ios: 'SFSpeechRecognizer / SpeechAnalyzer (iOS 26+)',
    web: 'no soportado',
  };
  readonly notes =
    'Resultados parciales en vivo, modo on-device opcional y sesiones segmentadas por silencio. Requiere permiso de micrófono (y de reconocimiento de voz en iOS).';

  private listeners: PluginListenerHandle[] = [];
  private startedAt = 0;

  async isSupported(): Promise<EngineSupport> {
    if (Capacitor.getPlatform() === 'web') {
      return {
        available: false,
        native: false,
        reason: 'El plugin no implementa la plataforma web. Use el motor Web Speech API.',
      };
    }
    const { available } = await SpeechRecognition.available();
    return {
      available,
      native: true,
      reason: available ? undefined : 'El dispositivo no expone un reconocedor de voz.',
    };
  }

  async requestPermissions(): Promise<boolean> {
    const status = await SpeechRecognition.requestPermissions();
    return status.speechRecognition === 'granted';
  }

  async getSupportedLanguages(): Promise<string[]> {
    try {
      const { languages } = await SpeechRecognition.getSupportedLanguages();
      return languages ?? [];
    } catch {
      // Varios fabricantes Android no implementan la consulta de idiomas.
      return [];
    }
  }

  async start(options: SttOptions, onEvent: (e: SttEvent) => void): Promise<void> {
    await this.detach();
    this.startedAt = performance.now();
    const at = () => Math.round(performance.now() - this.startedAt);

    this.listeners.push(
      await SpeechRecognition.addListener('partialResults', (event) => {
        const text = event.accumulatedText ?? event.matches?.[0] ?? '';
        if (text.length > 0) {
          onEvent({ kind: 'partial', text, matches: event.matches, atMs: at() });
        }
      }),
    );

    this.listeners.push(
      await SpeechRecognition.addListener('listeningState', (event) => {
        const state = event.status ?? (event.state === 'started' ? 'started' : 'stopped');
        onEvent({ kind: 'state', state, atMs: at() });
      }),
    );

    this.listeners.push(
      await SpeechRecognition.addListener('error', (event) => {
        onEvent({ kind: 'error', message: `${event.code}: ${event.message}`, atMs: at() });
      }),
    );

    // `start()` resuelve con las coincidencias finales en Android; en iOS
    // resuelve al iniciar. Tratamos el resultado como opcional y dejamos que
    // `stop()` sea la fuente de verdad del texto final.
    const result = await SpeechRecognition.start({
      language: options.language,
      maxResults: options.maxResults,
      partialResults: options.partialResults,
      popup: false,
      useOnDeviceRecognition: options.onDevice,
    });

    if (result?.matches?.length) {
      onEvent({
        kind: 'final',
        text: result.matches[0],
        matches: result.matches,
        atMs: at(),
      });
    }
  }

  async stop(): Promise<string[]> {
    try {
      await SpeechRecognition.stop();
      const last = await SpeechRecognition.getLastPartialResult();
      return last.matches ?? (last.text ? [last.text] : []);
    } finally {
      await this.detach();
    }
  }

  async isListening(): Promise<boolean> {
    const { listening } = await SpeechRecognition.isListening();
    return listening;
  }

  private async detach(): Promise<void> {
    for (const handle of this.listeners) {
      await handle.remove();
    }
    this.listeners = [];
  }
}
