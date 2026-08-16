/**
 * Normalización de números en español para comparar transcripciones.
 *
 * El reconocedor puede devolver el mismo monto de muchas formas —«cinco mil»,
 * «5 mil», «5.000», «$5.000»— y todas son correctas. Comparar el texto crudo
 * contaría esas variantes como error y la medición no diría nada útil.
 *
 * Es el equivalente, para voz, de lo que fueron los campos clave en OCR.
 */

const UNITS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const HUNDREDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

/**
 * Palabras que unen partes de un número sin aportar valor.
 *
 * Sólo «y», que en español sí une un número («cuarenta y cinco»). «con» queda
 * fuera a propósito: es una preposición, y tratarla como unión convertía
 * «tres mil quinientos con cincuenta» en 3550 en vez de dejar 3500 y 50 como
 * dos cantidades distintas.
 */
const CONNECTORS = new Set(['y']);

/**
 * Normaliza un número ya escrito con dígitos a su forma canónica.
 *
 * Convención chilena y europea: el punto (o el espacio) separa miles y la coma
 * separa decimales. Confundirlas cuesta caro — `3.500,50` mal interpretado da
 * 350050, cien veces el valor real.
 *
 * Devuelve `undefined` si el token no es un número.
 */
function canonicalNumeric(token: string): string | undefined {
  const digitsOnly = token.replace(/[^\d.,\u00a0\u202f ]/g, '');
  if (!/^\d/.test(digitsOnly)) return undefined;

  // Punto o espacio fino sólo separan miles cuando les siguen exactamente
  // tres dígitos. En cualquier otro caso se dejan como están.
  const withoutThousands = digitsOnly.replace(/[.\u00a0\u202f ](?=\d{3}(?!\d))/g, '');
  const canonical = withoutThousands.replace(',', '.');

  return /^\d+(\.\d+)?$/.test(canonical) ? canonical : undefined;
}

const THOUSAND = 'mil';
const MILLION = new Set(['millon', 'millones']);

/**
 * Jerga monetaria chilena, tratada como multiplicador.
 *
 * No es un adorno: medido en el S25, «cinco lucas» se transcribe como
 * «5 Lucas» —con mayúscula, como si fuera el nombre— y sin esta tabla el monto
 * extraído era **5** en vez de 5000. Un error de mil veces, en la frase más
 * cotidiana que puede decir un usuario chileno.
 *
 * Ojo con `palo`: significa millón, y equivocarlo cuesta seis órdenes de
 * magnitud.
 */
const SLANG_MULTIPLIERS: Record<string, number> = {
  luca: 1000,
  lucas: 1000,
  gamba: 100,
  gambas: 100,
  palo: 1_000_000,
  palos: 1_000_000,
};

function deaccent(word: string): string {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isNumberWord(word: string): boolean {
  return (
    word in UNITS ||
    word in HUNDREDS ||
    word === THOUSAND ||
    MILLION.has(word) ||
    word in SLANG_MULTIPLIERS ||
    /^\d+(\.\d+)?$/.test(word)
  );
}

/**
 * Convierte una secuencia de palabras que forman **un solo** número.
 *
 * Acumula por escalas: lo que viene antes de «mil» se multiplica por mil y se
 * arrastra, igual con «millón». Así «dos millones trescientos mil quinientos»
 * se resuelve en una pasada.
 */
function wordsToNumber(words: readonly string[]): number {
  let total = 0;
  let current = 0;

  for (const word of words) {
    if (CONNECTORS.has(word)) continue;

    if (/^\d+(\.\d+)?$/.test(word)) {
      current += Number(word);
      continue;
    }

    if (word in UNITS) {
      current += UNITS[word];
    } else if (word in HUNDREDS) {
      current += HUNDREDS[word];
    } else if (word === THOUSAND) {
      // «mil» solo, sin cantidad delante, vale 1000.
      current = (current === 0 ? 1 : current) * 1000;
      total += current;
      current = 0;
    } else if (MILLION.has(word)) {
      current = (current === 0 ? 1 : current) * 1_000_000;
      total += current;
      current = 0;
    } else if (word in SLANG_MULTIPLIERS) {
      current = (current === 0 ? 1 : current) * SLANG_MULTIPLIERS[word];
      total += current;
      current = 0;
    }
  }

  return total + current;
}

/**
 * Reemplaza en el texto toda secuencia de números escritos con su valor en
 * dígitos, y limpia los separadores de miles de los números ya numéricos.
 *
 * `«Gasté cinco mil pesos»` → `«Gasté 5000 pesos»`
 * `«Gasté $45.990»`         → `«Gasté 45990»`
 */
export function normalizeSpanishNumbers(text: string): string {
  // «45 990» viene partido en dos tokens por el espacio, así que el separador
  // de miles escrito con espacio se une antes de tokenizar.
  const out = text.replace(/(\d)[\u00a0\u202f ](?=\d{3}(?!\d))/g, '$1');

  const tokens = out.split(/(\s+)/);
  const result: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const value = wordsToNumber(buffer);
    result.push(String(value));
    buffer = [];
  };

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      // Un espacio dentro de un número en curso no lo corta.
      if (buffer.length === 0) result.push(token);
      continue;
    }

    // Los números con dígitos se canonizan aparte: quitarles la puntuación a
    // ciegas convertiría «3.500,50» en 350050.
    const numeric = canonicalNumeric(token);
    if (numeric !== undefined) {
      buffer.push(numeric);
      continue;
    }

    const clean = deaccent(token.toLowerCase()).replace(/[^a-z0-9]/g, '');

    if (isNumberWord(clean)) {
      buffer.push(clean);
      continue;
    }

    // Un conector sólo continúa el número si ya veníamos armando uno.
    if (CONNECTORS.has(clean) && buffer.length > 0) {
      buffer.push(clean);
      continue;
    }

    flush();
    result.push(token);
  }
  flush();

  return result.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extrae el monto de una frase de gasto.
 *
 * Toma el número más grande de la frase: en «gasté 5000 pesos en el super»
 * no hay ambigüedad, y en frases con varios números el monto suele ser el
 * mayor. Cuando haya que manejar boletas con varios ítems, esto necesitará
 * anclarse a la palabra «pesos» o al símbolo de moneda.
 */
export function extractAmount(text: string): number | undefined {
  const normalized = normalizeSpanishNumbers(text);
  const matches = normalized.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return undefined;
  return Math.max(...matches.map(Number));
}
