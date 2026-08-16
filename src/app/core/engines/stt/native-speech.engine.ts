import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import {
  EngineSupport,
  LanguagePackStatus,
  Platform,
  SttEngine,
  SttEvent,
  SttOptions,
} from '../../models/lab.models';

/**
 * `downloadOnDeviceModel` lo agrega nuestro parche al plugin (ver `patches/`).
 * El plugin ya disparaba la descarga por dentro cuando `start()` encontraba el
 * modelo ausente, pero sólo abriendo el micrófono; el parche la expone como
 * acción propia para poder preparar el idioma antes de pedir que hablen.
 */
type PatchedSpeechRecognition = typeof SpeechRecognition & {
  downloadOnDeviceModel(options: { language: string }): Promise<LanguagePackStatus>;
};

/**
 * Configuración fija de un motor de voz.
 *
 * En Android **todos los plugins terminan en la misma API del sistema**
 * (`android.speech.SpeechRecognizer`), igual que los tres plugins de OCR
 * resultaron ser el mismo ML Kit. Lo que sí son motores distintos son estas
 * configuraciones, y por eso cada una se expone como un motor separado en vez
 * de esconderse tras un interruptor.
 */
export interface NativeSpeechConfig {
  id: string;
  label: string;
  notes: string;
  androidBackend: string;
  iosBackend: string;
  /** Fuerza el reconocedor local del sistema. */
  onDevice: boolean;
  /** Usa el diálogo del sistema en vez del reconocimiento en línea. */
  popup: boolean;
}

export class NativeSpeechEngine implements SttEngine {
  readonly id: string;
  readonly label: string;
  readonly vendor = 'Google + Apple · Capgo';
  readonly pkg = '@capgo/capacitor-speech-recognition';
  readonly backend: Record<Platform, string>;
  readonly notes: string;
  readonly needsLanguagePack: boolean;

  private listeners: PluginListenerHandle[] = [];
  private startedAt = 0;

  constructor(private readonly config: NativeSpeechConfig) {
    this.id = config.id;
    this.label = config.label;
    this.notes = config.notes;
    this.needsLanguagePack = config.onDevice;
    this.backend = {
      android: config.androidBackend,
      ios: config.iosBackend,
      web: 'no soportado',
    };
  }

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
      reason: available ? undefined : 'El dispositivo no expone un reconocedor.',
    };
  }

  /**
   * Estado del modelo local **para el idioma que se va a usar**.
   *
   * Se consulta con el idioma seleccionado y no con uno fijo: Google publica
   * los modelos por variante regional, así que `es-US` puede estar disponible
   * mientras `es-CL` no existe en la lista.
   */
  async checkLanguagePack(language: string): Promise<LanguagePackStatus> {
    if (!this.config.onDevice) {
      return { state: 'not-applicable', message: 'Esta configuración no usa modelo local.' };
    }
    try {
      const { available } = await SpeechRecognition.isOnDeviceRecognitionAvailable({ language });
      return available
        ? { state: 'installed', message: `El modelo de ${language} está disponible.` }
        : {
            state: 'missing',
            message: `El modelo de ${language} no está descargado en este dispositivo.`,
          };
    } catch (error) {
      return {
        state: 'unsupported',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async downloadLanguagePack(language: string): Promise<LanguagePackStatus> {
    if (!this.config.onDevice) {
      return { state: 'not-applicable', message: 'Esta configuración no usa modelo local.' };
    }
    try {
      return await (SpeechRecognition as PatchedSpeechRecognition).downloadOnDeviceModel({
        language,
      });
    } catch (error) {
      return {
        state: 'unsupported',
        message: error instanceof Error ? error.message : String(error),
      };
    }
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
      // Varias capas de Android no implementan la consulta de idiomas.
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

    // En Android `start()` resuelve con las coincidencias finales; en iOS
    // resuelve al iniciar. Se trata el resultado como opcional y `stop()`
    // queda como fuente de verdad del texto final.
    const result = await SpeechRecognition.start({
      language: options.language,
      maxResults: options.maxResults,
      partialResults: options.partialResults && !this.config.popup,
      popup: this.config.popup,
      useOnDeviceRecognition: this.config.onDevice,
    });

    if (result?.matches?.length) {
      onEvent({ kind: 'final', text: result.matches[0], matches: result.matches, atMs: at() });
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

/**
 * Las tres configuraciones que sí son motores distintos en Android.
 *
 * Ordenadas por preferencia para el caso de uso: el audio de alguien diciendo
 * en qué gastó no debería salir del teléfono si el modo local alcanza.
 */
export const NATIVE_SPEECH_CONFIGS: readonly NativeSpeechConfig[] = [
  {
    id: 'speech-ondevice',
    label: 'Google on-device (local)',
    onDevice: true,
    popup: false,
    androidBackend: 'SpeechRecognizer.createOnDeviceSpeechRecognizer (API 31+)',
    iosBackend: 'SFSpeechRecognizer / SpeechAnalyzer con requiresOnDeviceRecognition',
    notes:
      'El audio nunca sale del teléfono. Exige que el paquete de idioma esté descargado; si no lo está, el sistema cae a red sin avisar.',
  },
  {
    id: 'speech-network',
    label: 'Google en red',
    onDevice: false,
    popup: false,
    androidBackend: 'SpeechRecognizer con el servicio por defecto (app de Google)',
    iosBackend: 'SFSpeechRecognizer con reconocimiento en servidor',
    notes:
      'Normalmente el más preciso, sobre todo con nombres propios. El audio se envía a servidores de Google: hay que declararlo en la política de privacidad.',
  },
  {
    id: 'speech-dialog',
    label: 'Diálogo del sistema',
    onDevice: false,
    popup: true,
    androidBackend: 'RecognizerIntent.ACTION_RECOGNIZE_SPEECH',
    iosBackend: 'no aplica (opción sólo de Android)',
    notes:
      'Abre la interfaz de Google. No entrega resultados parciales ni permite personalizar la pantalla, pero es la ruta con menos código y la que el usuario ya reconoce.',
  },
];
