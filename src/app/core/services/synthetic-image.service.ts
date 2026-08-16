import { Injectable } from '@angular/core';

/** Degradaciones controladas para estresar a los motores de OCR. */
export interface SyntheticImageOptions {
  text: string;
  fontSize: number;
  /** Rotación del texto, en grados. */
  rotationDeg: number;
  /** Desenfoque gaussiano, en píxeles. */
  blurPx: number;
  /** Ruido monocromático, 0–1. */
  noise: number;
  /** Contraste texto/fondo, 0–1 (1 = negro sobre blanco). */
  contrast: number;
  /** Calidad JPEG, 0–1. Simula la compresión de una foto real. */
  jpegQuality: number;
  width: number;
  height: number;
}

export const DEFAULT_SYNTHETIC: SyntheticImageOptions = {
  text: [
    'BOLETA ELECTRÓNICA N° 0084512',
    'Ferretería El Roble SpA',
    'RUT: 76.543.210-K',
    'Av. Providencia 2340, Santiago',
    '',
    '3 x Tornillo autoperforante 8x1"    $ 4.470',
    '1 x Taladro percutor 650W          $ 39.990',
    '2 x Broca widia 6mm                $ 3.980',
    '',
    'Neto     $ 40.706',
    'IVA 19%  $  7.734',
    'TOTAL    $ 48.440',
  ].join('\n'),
  fontSize: 30,
  rotationDeg: 0,
  blurPx: 0,
  noise: 0,
  contrast: 1,
  jpegQuality: 0.92,
  width: 1000,
  height: 1400,
};

/**
 * Genera imágenes de prueba con texto conocido.
 *
 * Su valor está en que el texto de referencia es exacto por construcción: se
 * puede medir precisión sin transcribir a mano, y se puede variar una sola
 * degradación a la vez (rotación, desenfoque, ruido, compresión) para ver
 * cuál rompe antes a cada motor. Las fotos reales siguen siendo necesarias,
 * pero esto da una línea base reproducible entre dispositivos.
 */
@Injectable({ providedIn: 'root' })
export class SyntheticImageService {
  async render(options: SyntheticImageOptions): Promise<{ dataUrl: string; text: string }> {
    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = options.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // El contraste se aplica como gris del texto: 1 → negro, 0 → blanco.
    const shade = Math.round(255 * (1 - options.contrast));
    ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    ctx.textBaseline = 'top';
    ctx.font = `${options.fontSize}px "Helvetica Neue", Arial, sans-serif`;
    if (options.blurPx > 0) {
      ctx.filter = `blur(${options.blurPx}px)`;
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((options.rotationDeg * Math.PI) / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    const lines = options.text.split('\n');
    const lineHeight = options.fontSize * 1.45;
    const marginX = Math.round(canvas.width * 0.08);
    let y = Math.round(canvas.height * 0.08);
    for (const line of lines) {
      ctx.fillText(line, marginX, y);
      y += lineHeight;
    }
    ctx.restore();
    ctx.filter = 'none';

    if (options.noise > 0) {
      this.applyNoise(ctx, canvas.width, canvas.height, options.noise);
    }

    return {
      dataUrl: canvas.toDataURL('image/jpeg', options.jpegQuality),
      text: options.text,
    };
  }

  private applyNoise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
    const image = ctx.getImageData(0, 0, w, h);
    const data = image.data;
    const magnitude = amount * 255;
    for (let i = 0; i < data.length; i += 4) {
      const delta = (Math.random() - 0.5) * magnitude;
      data[i] = clamp(data[i] + delta);
      data[i + 1] = clamp(data[i + 1] + delta);
      data[i + 2] = clamp(data[i + 2] + delta);
    }
    ctx.putImageData(image, 0, 0);
  }
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
