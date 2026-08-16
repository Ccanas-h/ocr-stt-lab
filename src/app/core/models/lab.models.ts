/**
 * Contratos comunes del laboratorio.
 *
 * IMPORTANTE (decisión de arquitectura):
 * `OcrEngine` y `SttEngine` son la *fachada única* que la aplicación final va a
 * consumir. Hoy cada motor es un adaptador sobre un plugin distinto; mañana,
 * cuando decidamos "librería X para Android / librería Y para iOS", basta con
 * escribir un único motor que enrute por plataforma sin tocar la UI.
 */

export type Platform = 'android' | 'ios' | 'web';

/** Disponibilidad de un motor en la plataforma actual. */
export interface EngineSupport {
  /** `true` si el motor puede ejecutarse aquí y ahora. */
  available: boolean;
  /** Motivo legible cuando `available === false`. */
  reason?: string;
  /** `true` si corre como código nativo; `false` si corre dentro del WebView. */
  native: boolean;
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

/** Escritura/alfabeto a reconocer. Sólo ML Kit expone esta opción. */
export type OcrScript = 'LATIN' | 'CHINESE' | 'DEVANAGARI' | 'JAPANESE' | 'KOREAN';

/**
 * Imagen normalizada. Cada plugin pide un formato distinto (ruta nativa,
 * base64 crudo o data-URL), así que el laboratorio siempre entrega las tres
 * representaciones y cada adaptador toma la que necesita.
 */
export interface LabImage {
  /** Ruta nativa del archivo, p. ej. `file:///data/user/0/.../input.jpg`. */
  fileUri: string;
  /** Ruta utilizable por el WebView (`capacitor://`, `blob:` o `data:`). */
  webPath: string;
  /** Base64 **sin** el prefijo `data:image/...;base64,`. */
  base64: string;
  /** Data-URL completa. */
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  byteLength: number;
  /** De dónde salió: cámara, galería, escáner de documentos, sintética o muestra. */
  source: 'camera' | 'gallery' | 'document-scanner' | 'synthetic' | 'sample';
  /**
   * Texto exacto que contiene la imagen, cuando lo conocemos con certeza
   * (imágenes sintéticas o muestras ya transcritas).
   */
  knownText?: string;
  /** Datos que la app real necesita extraer. Ver `KeyFieldResult`. */
  keyFields?: string[];
}

/**
 * Una muestra de la galería: imagen real con su transcripción y sus campos
 * clave ya preparados.
 */
export interface LabSample {
  id: string;
  file: string;
  label: string;
  difficulty: string;
  /** Qué hace difícil esta imagen. Es lo que explica por qué un motor falló. */
  conditions: string;
  keyFields: string[];
  groundTruth: string;
}

/** Si un dato concreto sobrevivió al reconocimiento. */
export interface KeyFieldResult {
  value: string;
  found: boolean;
}

export interface OcrOptions {
  script: OcrScript;
  /** Código de idioma para Tesseract (p. ej. `spa`, `eng`, `spa+eng`). */
  tesseractLang: string;
}

/** Bloque/línea reconocida, aplanado a un formato común entre plugins. */
export interface OcrBlock {
  text: string;
  confidence?: number;
  boundingBox?: { left: number; top: number; right: number; bottom: number };
}

export interface OcrOutput {
  text: string;
  blocks: OcrBlock[];
  /** Confianza media reportada por el motor, si la entrega. */
  confidence?: number;
}

export interface OcrEngine {
  readonly id: string;
  readonly label: string;
  readonly vendor: string;
  /** Plugin npm que lo respalda (se muestra en la ficha del motor). */
  readonly pkg: string;
  /** Motor real detrás de cada plataforma. */
  readonly backend: Record<Platform, string>;
  /** Notas relevantes para decidir: tamaño de APK, requisitos, etc. */
  readonly notes: string;

  isSupported(): Promise<EngineSupport>;
  recognize(image: LabImage, options: OcrOptions): Promise<OcrOutput>;
}

// ---------------------------------------------------------------------------
// Voz a texto
// ---------------------------------------------------------------------------

export interface SttOptions {
  /** BCP-47, p. ej. `es-CL`. */
  language: string;
  /** Emitir resultados parciales mientras se habla. */
  partialResults: boolean;
  /** Forzar el motor 100 % on-device cuando la plataforma lo permita. */
  onDevice: boolean;
  maxResults: number;
}

export interface SttEvent {
  kind: 'partial' | 'final' | 'state' | 'error';
  text?: string;
  matches?: string[];
  state?: 'started' | 'stopped';
  message?: string;
  /** ms transcurridos desde `start()`. */
  atMs: number;
}

/**
 * Estado del modelo de reconocimiento local para un idioma.
 *
 * `missing` es el estado peligroso: el idioma existe pero no está bajado. Sin
 * detectarlo, la app parecería funcionar sin conexión y fallaría justo cuando
 * el usuario no tiene señal.
 */
export type LanguagePackState =
  | 'installed'
  | 'missing'
  | 'downloading'
  | 'unsupported'
  | 'not-applicable';

export interface LanguagePackStatus {
  state: LanguagePackState;
  message: string;
}

export interface SttEngine {
  readonly id: string;
  readonly label: string;
  readonly vendor: string;
  readonly pkg: string;
  readonly backend: Record<Platform, string>;
  readonly notes: string;
  /** `true` si este motor depende de un modelo descargado en el dispositivo. */
  readonly needsLanguagePack: boolean;

  isSupported(): Promise<EngineSupport>;
  /** Estado del modelo local para el idioma indicado. */
  checkLanguagePack(language: string): Promise<LanguagePackStatus>;
  /** Pide al sistema que descargue el modelo local. */
  downloadLanguagePack(language: string): Promise<LanguagePackStatus>;
  requestPermissions(): Promise<boolean>;
  getSupportedLanguages(): Promise<string[]>;
  /** Comienza a escuchar. Cada evento se entrega por `onEvent`. */
  start(options: SttOptions, onEvent: (e: SttEvent) => void): Promise<void>;
  stop(): Promise<string[]>;
  isListening(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Resultados de una corrida
// ---------------------------------------------------------------------------

export interface AccuracyScore {
  /** Character Error Rate (0 = perfecto). */
  cer: number;
  /** Word Error Rate (0 = perfecto). */
  wer: number;
  /** Similitud a nivel de carácter, `1 - cer` acotado a [0, 1]. */
  similarity: number;
  refChars: number;
  hypChars: number;
  refWords: number;
  hypWords: number;
}

export interface EngineRun {
  engineId: string;
  engineLabel: string;
  status: 'ok' | 'error' | 'unsupported';
  /** Duración de cada repetición, en ms. */
  timingsMs: number[];
  /** Mediana de `timingsMs`. */
  medianMs: number;
  /** Primera repetición: incluye la inicialización del modelo (arranque en frío). */
  coldMs: number;
  text: string;
  blocks: OcrBlock[];
  confidence?: number;
  accuracy?: AccuracyScore;
  /**
   * Qué campos clave sobrevivieron.
   *
   * Es la métrica que de verdad decide: a una app que digitaliza boletas no le
   * importa si el motor reordenó las columnas, le importa si el RUT y el total
   * están ahí. CER y WER castigan el reordenamiento; esto no.
   */
  keyFields?: KeyFieldResult[];
  /** Fracción de campos clave encontrados, 0–1. */
  keyFieldScore?: number;
  error?: string;
}

export interface BenchmarkReport {
  createdAt: string;
  platform: Platform;
  runsPerEngine: number;
  image: {
    source: LabImage['source'];
    width: number;
    height: number;
    byteLength: number;
    mimeType: string;
  };
  options: OcrOptions;
  normalization: NormalizationOptions;
  groundTruth: string;
  /** Identificador de la muestra, cuando la imagen vino de la galería. */
  sampleId?: string;
  runs: EngineRun[];
}

export interface NormalizationOptions {
  lowercase: boolean;
  /** Quitar tildes/diacríticos antes de comparar. */
  stripAccents: boolean;
  stripPunctuation: boolean;
  /** Colapsar espacios y saltos de línea a un único espacio. */
  collapseWhitespace: boolean;
}

export const DEFAULT_NORMALIZATION: NormalizationOptions = {
  lowercase: true,
  stripAccents: false,
  stripPunctuation: false,
  collapseWhitespace: true,
};
