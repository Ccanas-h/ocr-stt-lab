import { Injectable } from '@angular/core';
import {
  EngineSupport,
  Platform,
  SttEngine,
  SttEvent,
  SttOptions,
} from '../../models/lab.models';

/** Tipos mínimos de la Web Speech API: TypeScript no los trae en `lib.dom`. */
interface WebSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: WebSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
}

interface WebSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { isFinal: boolean; length: number; [i: number]: { transcript: string } };
  };
}

type RecognitionCtor = new () => WebSpeechRecognition;

function getCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Web Speech API dentro del WebView.
 *
 * Existe para poder desarrollar la pantalla en `ionic serve` sin dispositivo.
 * En el WebView de Android **no** está disponible (sólo en Chrome de
 * escritorio y Safari), y donde sí lo está suele enviar el audio a un servidor
 * remoto, así que no es candidato a producción: es andamiaje de desarrollo.
 */
@Injectable({ providedIn: 'root' })
export class WebSpeechEngine implements SttEngine {
  readonly id = 'web-speech';
  readonly label = 'Web Speech API (sólo desarrollo)';
  readonly vendor = 'Navegador';
  readonly pkg = '—';
  readonly backend: Record<Platform, string> = {
    android: 'no disponible en el WebView de Capacitor',
    ios: 'no disponible en el WebView de Capacitor',
    web: 'window.SpeechRecognition',
  };
  readonly notes =
    'Andamiaje para probar la pantalla en el navegador. No corre en el WebView nativo y normalmente transcribe en la nube.';

  private recognition?: WebSpeechRecognition;
  private startedAt = 0;
  private finalText = '';
  private listening = false;

  async isSupported(): Promise<EngineSupport> {
    const ctor = getCtor();
    return ctor
      ? { available: true, native: false }
      : { available: false, native: false, reason: 'Este WebView no expone SpeechRecognition.' };
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  async getSupportedLanguages(): Promise<string[]> {
    // La API no permite enumerar idiomas; ofrecemos los relevantes para el caso.
    return ['es-CL', 'es-ES', 'es-MX', 'en-US'];
  }

  async start(options: SttOptions, onEvent: (e: SttEvent) => void): Promise<void> {
    const ctor = getCtor();
    if (!ctor) throw new Error('SpeechRecognition no está disponible en este WebView.');

    this.startedAt = performance.now();
    this.finalText = '';
    const at = () => Math.round(performance.now() - this.startedAt);

    const recognition = new ctor();
    this.recognition = recognition;
    recognition.lang = options.language;
    recognition.continuous = true;
    recognition.interimResults = options.partialResults;
    recognition.maxAlternatives = options.maxResults;

    recognition.onstart = () => {
      this.listening = true;
      onEvent({ kind: 'state', state: 'started', atMs: at() });
    };

    recognition.onend = () => {
      this.listening = false;
      onEvent({ kind: 'state', state: 'stopped', atMs: at() });
    };

    recognition.onerror = (event) => {
      onEvent({ kind: 'error', message: event.error, atMs: at() });
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          this.finalText = `${this.finalText} ${transcript}`.trim();
        } else {
          interim += transcript;
        }
      }
      const text = `${this.finalText} ${interim}`.trim();
      onEvent({ kind: 'partial', text, matches: [text], atMs: at() });
    };

    recognition.start();
  }

  async stop(): Promise<string[]> {
    this.recognition?.stop();
    this.listening = false;
    return this.finalText ? [this.finalText] : [];
  }

  async isListening(): Promise<boolean> {
    return this.listening;
  }
}
