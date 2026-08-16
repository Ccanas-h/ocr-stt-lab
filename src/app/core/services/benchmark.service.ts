import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  BenchmarkReport,
  EngineRun,
  LabImage,
  NormalizationOptions,
  OcrEngine,
  OcrOptions,
  OcrOutput,
  Platform,
} from '../models/lab.models';
import { matchKeyFields, median, score } from '../text/accuracy';

export interface BenchmarkProgress {
  engineId: string;
  engineLabel: string;
  run: number;
  totalRuns: number;
}

export interface BenchmarkRequest {
  engines: readonly OcrEngine[];
  image: LabImage;
  options: OcrOptions;
  groundTruth: string;
  normalization: NormalizationOptions;
  runsPerEngine: number;
  /** Datos que la app real debe extraer. Vacío = no se evalúa. */
  keyFields: readonly string[];
  sampleId?: string;
}

/**
 * Ejecuta la batería de OCR y arma el informe comparativo.
 *
 * Los motores corren **en serie**, nunca en paralelo: compiten por CPU, GPU y
 * NPU del mismo teléfono, así que en paralelo los tiempos no significarían
 * nada.
 */
@Injectable({ providedIn: 'root' })
export class BenchmarkService {
  async run(
    request: BenchmarkRequest,
    onProgress?: (p: BenchmarkProgress) => void,
  ): Promise<BenchmarkReport> {
    const runs: EngineRun[] = [];

    for (const engine of request.engines) {
      runs.push(await this.runEngine(engine, request, onProgress));
    }

    // Orden de lectura: primero lo que funcionó, y dentro de eso lo más preciso;
    // a igual precisión (o sin texto de referencia), lo más rápido.
    runs.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ok' ? -1 : 1;
      // Los campos clave mandan sobre la similitud: es la métrica que decide
      // si la app puede hacer su trabajo con este motor.
      const keyA = a.keyFieldScore ?? -1;
      const keyB = b.keyFieldScore ?? -1;
      if (keyA !== keyB) return keyB - keyA;
      const accA = a.accuracy?.similarity ?? -1;
      const accB = b.accuracy?.similarity ?? -1;
      if (accA !== accB) return accB - accA;
      return a.medianMs - b.medianMs;
    });

    return {
      createdAt: new Date().toISOString(),
      platform: Capacitor.getPlatform() as Platform,
      runsPerEngine: request.runsPerEngine,
      image: {
        source: request.image.source,
        width: request.image.width,
        height: request.image.height,
        byteLength: request.image.byteLength,
        mimeType: request.image.mimeType,
      },
      options: request.options,
      normalization: request.normalization,
      groundTruth: request.groundTruth,
      sampleId: request.sampleId,
      runs,
    };
  }

  /**
   * Recalcula la precisión de un informe ya ejecutado.
   *
   * Ajustar el texto de referencia o las reglas de normalización no debería
   * obligar a volver a pasar las imágenes por los motores: los tiempos ya
   * medidos siguen siendo válidos y repetir sólo los ensuciaría.
   */
  rescore(
    report: BenchmarkReport,
    groundTruth: string,
    normalization: NormalizationOptions,
    keyFields: readonly string[],
  ): BenchmarkReport {
    return {
      ...report,
      groundTruth,
      normalization,
      runs: report.runs.map((run) =>
        run.status === 'ok'
          ? {
              ...run,
              accuracy: score(groundTruth, run.text, normalization),
              ...scoreKeyFields(keyFields, run.text),
            }
          : run,
      ),
    };
  }

  private async runEngine(
    engine: OcrEngine,
    request: BenchmarkRequest,
    onProgress?: (p: BenchmarkProgress) => void,
  ): Promise<EngineRun> {
    const base: EngineRun = {
      engineId: engine.id,
      engineLabel: engine.label,
      status: 'ok',
      timingsMs: [],
      medianMs: 0,
      coldMs: 0,
      text: '',
      blocks: [],
    };

    const support = await engine.isSupported();
    if (!support.available) {
      return { ...base, status: 'unsupported', error: support.reason ?? 'No disponible.' };
    }

    const timings: number[] = [];
    let lastOutput: OcrOutput = { text: '', blocks: base.blocks };

    try {
      for (let i = 0; i < request.runsPerEngine; i++) {
        onProgress?.({
          engineId: engine.id,
          engineLabel: engine.label,
          run: i + 1,
          totalRuns: request.runsPerEngine,
        });

        const startedAt = performance.now();
        const output = await engine.recognize(request.image, request.options);
        timings.push(performance.now() - startedAt);
        lastOutput = output;
      }
    } catch (error) {
      return {
        ...base,
        status: 'error',
        timingsMs: timings,
        medianMs: median(timings),
        coldMs: timings[0] ?? 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      ...base,
      timingsMs: timings.map((t) => Math.round(t)),
      medianMs: Math.round(median(timings)),
      coldMs: Math.round(timings[0] ?? 0),
      text: lastOutput.text,
      blocks: lastOutput.blocks,
      confidence: lastOutput.confidence,
      accuracy: score(request.groundTruth, lastOutput.text, request.normalization),
      ...scoreKeyFields(request.keyFields, lastOutput.text),
    };
  }
}

/** Evalúa los campos clave. Devuelve un objeto vacío si no hay ninguno definido. */
function scoreKeyFields(
  fields: readonly string[],
  text: string,
): Pick<EngineRun, 'keyFields' | 'keyFieldScore'> {
  if (fields.length === 0) return {};
  const results = matchKeyFields(fields, text);
  const hits = results.filter((r) => r.found).length;
  return { keyFields: results, keyFieldScore: hits / results.length };
}
