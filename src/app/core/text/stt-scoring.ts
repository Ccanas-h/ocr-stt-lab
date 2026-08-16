import { KeyFieldResult, NormalizationOptions } from '../models/lab.models';
import { LabPhrase } from '../services/phrase-bank';
import { matchKeyFields, normalize, score } from './accuracy';
import { extractAmount, normalizeSpanishNumbers } from './spanish-numbers';

/** Resultado de evaluar un dictado contra la frase que se pidió leer. */
export interface SttScore {
  /** Monto que se entendió, ya normalizado a entero. */
  heardAmount?: number;
  /** El monto es el dato que no se puede equivocar. */
  amountCorrect: boolean;
  /** Comercios y categorías que sobrevivieron. */
  keyTerms: KeyFieldResult[];
  keyTermScore: number;
  /** WER y similitud sobre texto con los números ya normalizados. */
  wer: number;
  similarity: number;
}

/**
 * Normalización específica de voz: además de lo habitual, convierte los
 * números escritos con palabras a dígitos.
 *
 * Sin esto, «cinco mil» contra «5.000» cuenta como dos palabras erradas de
 * dos, y la medición diría que el motor falló cuando acertó.
 */
export function normalizeForSpeech(text: string, opts: NormalizationOptions): string {
  return normalize(normalizeSpanishNumbers(text), opts);
}

export function scoreDictation(
  phrase: LabPhrase,
  heard: string,
  opts: NormalizationOptions,
): SttScore {
  const heardAmount = extractAmount(heard);

  const reference = normalizeSpanishNumbers(phrase.text);
  const hypothesis = normalizeSpanishNumbers(heard);
  const textScore = score(reference, hypothesis, opts);

  const keyTerms = matchKeyFields(phrase.keyTerms, heard);
  const hits = keyTerms.filter((t) => t.found).length;

  return {
    heardAmount,
    amountCorrect: heardAmount === phrase.amount,
    keyTerms,
    keyTermScore: keyTerms.length > 0 ? hits / keyTerms.length : 1,
    wer: textScore?.wer ?? 1,
    similarity: textScore?.similarity ?? 0,
  };
}
