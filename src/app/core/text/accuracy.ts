import { AccuracyScore, KeyFieldResult, NormalizationOptions } from '../models/lab.models';

const PUNCTUATION = /[.,;:!?¡¿"'`´()\[\]{}<>«»…—–\-_/\\|@#$%^&*+=~]/g;

/** Aplica las normalizaciones activas antes de comparar dos textos. */
export function normalize(text: string, opts: NormalizationOptions): string {
  let out = text ?? '';
  if (opts.stripAccents) {
    out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  if (opts.lowercase) {
    out = out.toLowerCase();
  }
  if (opts.stripPunctuation) {
    out = out.replace(PUNCTUATION, ' ');
  }
  if (opts.collapseWhitespace) {
    out = out.replace(/\s+/g, ' ');
  }
  return out.trim();
}

/**
 * Distancia de Levenshtein sobre secuencias arbitrarias.
 *
 * Usa dos filas en lugar de la matriz completa: para una página de texto
 * (~3.000 caracteres) la matriz completa serían ~9M celdas, y con dos filas
 * el costo en memoria es lineal.
 */
export function levenshtein<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ai = a[i - 1];
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // borrado
        curr[j - 1] + 1, // inserción
        prev[j - 1] + cost, // sustitución
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

function words(text: string): string[] {
  return text.length === 0 ? [] : text.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Compara la transcripción de un motor (`hypothesis`) contra el texto real
 * (`reference`) y devuelve CER, WER y similitud.
 *
 * Devuelve `undefined` si no hay texto de referencia: sin referencia no hay
 * medida de precisión posible, y un 0 % sería engañoso.
 */
export function score(
  reference: string,
  hypothesis: string,
  opts: NormalizationOptions,
): AccuracyScore | undefined {
  const ref = normalize(reference, opts);
  const hyp = normalize(hypothesis, opts);
  if (ref.length === 0) return undefined;

  const refChars = [...ref];
  const hypChars = [...hyp];
  const refWords = words(ref);
  const hypWords = words(hyp);

  const charDistance = levenshtein(refChars, hypChars);
  const wordDistance = levenshtein(refWords, hypWords);

  const cer = charDistance / refChars.length;
  const wer = refWords.length > 0 ? wordDistance / refWords.length : 0;

  return {
    cer,
    wer,
    similarity: Math.max(0, Math.min(1, 1 - cer)),
    refChars: refChars.length,
    hypChars: hypChars.length,
    refWords: refWords.length,
    hypWords: hypWords.length,
  };
}

/**
 * Comprueba qué campos clave aparecen en el texto reconocido.
 *
 * La búsqueda es deliberadamente tolerante —ignora mayúsculas y colapsa
 * espacios— porque lo que se quiere saber es si el dato **está**, no si el
 * motor respetó el espaciado original. Los separadores internos de un RUT o de
 * un número de cuenta sí importan y se mantienen.
 */
export function matchKeyFields(fields: readonly string[], text: string): KeyFieldResult[] {
  const haystack = normalize(text, {
    lowercase: true,
    stripAccents: true,
    stripPunctuation: false,
    collapseWhitespace: true,
  });

  return fields.map((value) => ({
    value,
    found: haystack.includes(
      normalize(value, {
        lowercase: true,
        stripAccents: true,
        stripPunctuation: false,
        collapseWhitespace: true,
      }),
    ),
  }));
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
