/**
 * Banco de frases para el dictado guiado.
 *
 * Fijo y versionado: el audio de un teléfono real no se puede repetir, así que
 * lo único que podemos mantener constante entre corridas es **el texto que se
 * dicta**. Cambiarlo invalida la comparación con corridas anteriores.
 *
 * Las frases salen del caso de uso declarado: alguien diciendo en qué gastó,
 * en 3 a 40 segundos. Se incluyen nombres de comercios chilenos a propósito —
 * los nombres propios son donde más falla el reconocimiento y son justo los
 * que la app necesita.
 */

export interface LabPhrase {
  id: string;
  /** Lo que hay que leer en voz alta. */
  text: string;
  level: 1 | 2 | 3 | 4;
  /** Duración aproximada al dictarla, en segundos. */
  seconds: number;
  /** Monto correcto, para validar la extracción numérica. */
  amount: number;
  /** Palabras que deben sobrevivir a la transcripción. */
  keyTerms: string[];
}

export const PHRASE_BANK: readonly LabPhrase[] = [
  // -- Nivel 1: lo típico ---------------------------------------------------
  {
    id: 'n1-super',
    level: 1,
    seconds: 4,
    text: 'Gasté cinco mil pesos en el supermercado',
    amount: 5000,
    keyTerms: ['supermercado'],
  },
  {
    id: 'n1-farmacia',
    level: 1,
    seconds: 5,
    text: 'Pagué doce mil quinientos en la farmacia',
    amount: 12500,
    keyTerms: ['farmacia'],
  },
  {
    id: 'n1-falabella',
    level: 1,
    seconds: 5,
    text: 'Gasté cuarenta y cinco mil novecientos noventa pesos en Falabella',
    amount: 45990,
    keyTerms: ['Falabella'],
  },

  // -- Nivel 2: con categoría ----------------------------------------------
  {
    id: 'n2-carnes',
    level: 2,
    seconds: 7,
    text: 'Gasté cinco mil pesos en el supermercado, en la subcategoría de carnes',
    amount: 5000,
    keyTerms: ['supermercado', 'carnes'],
  },
  {
    id: 'n2-almuerzo',
    level: 2,
    seconds: 8,
    text: 'Pagué tres mil doscientos en el almuerzo de hoy, categoría comida',
    amount: 3200,
    keyTerms: ['almuerzo', 'comida'],
  },
  {
    id: 'n2-lider',
    level: 2,
    seconds: 10,
    text: 'Gasté ochenta y nueve mil novecientos noventa pesos en Líder con tarjeta de crédito, categoría despensa',
    amount: 89990,
    keyTerms: ['Líder', 'crédito', 'despensa'],
  },
  {
    id: 'n2-copec',
    level: 2,
    seconds: 8,
    text: 'Cargué treinta y dos mil pesos de bencina en Copec, categoría transporte',
    amount: 32000,
    keyTerms: ['bencina', 'Copec', 'transporte'],
  },
  {
    id: 'n2-cruzverde',
    level: 2,
    seconds: 9,
    text: 'Compré remedios en Cruz Verde por siete mil ochocientos noventa pesos, categoría salud',
    amount: 7890,
    keyTerms: ['remedios', 'Cruz Verde', 'salud'],
  },

  // -- Nivel 3: el límite declarado ----------------------------------------
  {
    id: 'n3-boleta',
    level: 3,
    seconds: 38,
    text: 'Fui al supermercado Jumbo y gasté en total cuarenta y ocho mil cuatrocientos cuarenta pesos. Compré dos leches a mil cuatrocientos treinta cada una, un taladro percutor a treinta y nueve mil novecientos noventa, dos brocas a tres mil novecientos ochenta, y pagué con tarjeta de débito. La categoría es hogar y ferretería.',
    amount: 48440,
    keyTerms: ['Jumbo', 'leches', 'taladro', 'brocas', 'débito', 'ferretería'],
  },

  // -- Nivel 4: el monto bajo lupa ------------------------------------------
  // Frases cortas y casi idénticas, para que la única variable sea el número.
  // Es donde se ve qué formas de monto rompen el reconocimiento.
  {
    id: 'n4-mil',
    level: 4,
    seconds: 3,
    text: 'Gasté mil pesos',
    amount: 1000,
    keyTerms: [],
  },
  {
    id: 'n4-990',
    level: 4,
    seconds: 3,
    text: 'Gasté novecientos noventa pesos',
    amount: 990,
    keyTerms: [],
  },
  {
    id: 'n4-2350',
    level: 4,
    seconds: 4,
    text: 'Gasté dos mil trescientos cincuenta pesos',
    amount: 2350,
    keyTerms: [],
  },
  {
    id: 'n4-7234',
    level: 4,
    seconds: 5,
    text: 'Gasté siete mil doscientos treinta y cuatro pesos',
    amount: 7234,
    keyTerms: [],
  },
  {
    id: 'n4-15750',
    level: 4,
    seconds: 5,
    text: 'Gasté quince mil setecientos cincuenta pesos',
    amount: 15750,
    keyTerms: [],
  },
  {
    id: 'n4-105000',
    level: 4,
    seconds: 4,
    text: 'Gasté ciento cinco mil pesos',
    amount: 105000,
    keyTerms: [],
  },
  {
    id: 'n4-99999',
    level: 4,
    seconds: 6,
    text: 'Gasté noventa y nueve mil novecientos noventa y nueve pesos',
    amount: 99999,
    keyTerms: [],
  },
  {
    id: 'n4-millon',
    level: 4,
    seconds: 5,
    text: 'Gasté un millón doscientos cincuenta mil pesos',
    amount: 1250000,
    keyTerms: [],
  },
  {
    id: 'n4-decimal',
    level: 4,
    seconds: 5,
    // El peso chileno no usa centavos, pero conviene saber qué pasa si alguien
    // lo dice igual: es la forma que más caro sale si se interpreta mal.
    text: 'Gasté tres mil quinientos con cincuenta',
    amount: 3500,
    keyTerms: [],
  },
  {
    id: 'n4-luca',
    level: 4,
    seconds: 3,
    // Chilenismo cotidiano: una luca son mil pesos. Si el reconocedor lo
    // transcribe literal, la app tendrá que traducirlo.
    text: 'Gasté cinco lucas en el almuerzo',
    amount: 5000,
    keyTerms: ['almuerzo'],
  },
];

export function phrasesByLevel(level: 1 | 2 | 3 | 4): LabPhrase[] {
  return PHRASE_BANK.filter((p) => p.level === level);
}
