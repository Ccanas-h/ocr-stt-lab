import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import {
  BenchmarkReport,
  LabSample,
  NormalizationOptions,
  OcrEngine,
  OcrOptions,
  Platform,
} from '../models/lab.models';
import { percent } from '../text/accuracy';
import { BenchmarkService } from './benchmark.service';
import { ImageSourceService } from './image-source.service';
import { SampleLibraryService } from './sample-library.service';

export interface SuiteEntry {
  sampleId: string;
  label: string;
  difficulty: string;
  conditions: string;
  report: BenchmarkReport;
}

export interface SuiteReport {
  createdAt: string;
  platform: Platform;
  /** Modelo real, no sólo la plataforma: un S20 y un S25 no son comparables. */
  device: string;
  os: string;
  runsPerEngine: number;
  entries: SuiteEntry[];
}

export interface SuiteProgress {
  sampleLabel: string;
  sampleIndex: number;
  sampleCount: number;
  engineLabel: string;
}

/**
 * Corre la galería completa: cada muestra contra cada motor.
 *
 * Es lo que produce la tabla comparativa. Hacerlo a mano por la interfaz es
 * lento y propenso a saltarse una combinación; en lote se garantiza que todos
 * los motores vieron exactamente las mismas imágenes en la misma sesión, con
 * el teléfono en el mismo estado térmico.
 */
@Injectable({ providedIn: 'root' })
export class SuiteRunnerService {
  private readonly samples = inject(SampleLibraryService);
  private readonly images = inject(ImageSourceService);
  private readonly benchmark = inject(BenchmarkService);

  async run(
    samples: readonly LabSample[],
    engines: readonly OcrEngine[],
    options: OcrOptions,
    normalization: NormalizationOptions,
    runsPerEngine: number,
    onProgress?: (p: SuiteProgress) => void,
  ): Promise<SuiteReport> {
    const info = await Device.getInfo();
    const entries: SuiteEntry[] = [];

    for (const [index, sample] of samples.entries()) {
      const dataUrl = await this.samples.load(sample);
      const image = await this.images.fromSample(dataUrl, sample);

      const report = await this.benchmark.run(
        {
          engines,
          image,
          options,
          groundTruth: sample.groundTruth,
          normalization,
          runsPerEngine,
          keyFields: sample.keyFields,
          sampleId: sample.id,
        },
        (p) =>
          onProgress?.({
            sampleLabel: sample.label,
            sampleIndex: index + 1,
            sampleCount: samples.length,
            engineLabel: p.engineLabel,
          }),
      );

      entries.push({
        sampleId: sample.id,
        label: sample.label,
        difficulty: sample.difficulty,
        conditions: sample.conditions,
        report,
      });
    }

    return {
      createdAt: new Date().toISOString(),
      platform: Capacitor.getPlatform() as Platform,
      device: `${info.manufacturer ?? ''} ${info.model}`.trim(),
      os: `${info.operatingSystem} ${info.osVersion}`,
      runsPerEngine,
      entries,
    };
  }

  /**
   * Convierte el informe a Markdown, listo para pegar en la bitácora.
   *
   * Es el formato de salida que importa: el valor de este laboratorio no es la
   * app, es la tabla que produce.
   */
  toMarkdown(suite: SuiteReport): string {
    const engineIds = [
      ...new Set(suite.entries.flatMap((e) => e.report.runs.map((r) => r.engineId))),
    ];
    const engineLabels = new Map<string, string>();
    for (const entry of suite.entries) {
      for (const run of entry.report.runs) engineLabels.set(run.engineId, run.engineLabel);
    }

    const lines: string[] = [];
    lines.push(`### ${suite.device} · ${suite.os}`);
    lines.push('');
    lines.push(
      `Corrida ${suite.createdAt} · ${suite.runsPerEngine} pasada(s) por motor · ${suite.entries.length} muestras.`,
    );
    lines.push('');

    // Tabla 1: campos clave — la métrica que decide.
    lines.push('**Campos clave recuperados** (lo que la app necesita extraer de verdad)');
    lines.push('');
    lines.push(`| Muestra | Dificultad | ${engineIds.map((id) => engineLabels.get(id)).join(' | ')} |`);
    lines.push(`| --- | --- | ${engineIds.map(() => '---').join(' | ')} |`);
    for (const entry of suite.entries) {
      const cells = engineIds.map((id) => {
        const run = entry.report.runs.find((r) => r.engineId === id);
        if (!run || run.status !== 'ok') return run?.status === 'unsupported' ? 'n/d' : 'error';
        if (!run.keyFields) return '—';
        const hits = run.keyFields.filter((f) => f.found).length;
        return `${hits}/${run.keyFields.length} (${percent(run.keyFieldScore ?? 0)})`;
      });
      lines.push(`| ${entry.label} | ${entry.difficulty} | ${cells.join(' | ')} |`);
    }
    lines.push('');

    // Tabla 2: similitud de texto completo.
    lines.push('**Similitud de texto completo** (`1 − CER`)');
    lines.push('');
    lines.push(`| Muestra | ${engineIds.map((id) => engineLabels.get(id)).join(' | ')} |`);
    lines.push(`| --- | ${engineIds.map(() => '---').join(' | ')} |`);
    for (const entry of suite.entries) {
      const cells = engineIds.map((id) => {
        const run = entry.report.runs.find((r) => r.engineId === id);
        if (!run || run.status !== 'ok') return run?.status === 'unsupported' ? 'n/d' : 'error';
        return run.accuracy ? percent(run.accuracy.similarity) : '—';
      });
      lines.push(`| ${entry.label} | ${cells.join(' | ')} |`);
    }
    lines.push('');

    // Tabla 3: tiempo.
    lines.push('**Tiempo** (mediana, ms)');
    lines.push('');
    lines.push(`| Muestra | ${engineIds.map((id) => engineLabels.get(id)).join(' | ')} |`);
    lines.push(`| --- | ${engineIds.map(() => '---').join(' | ')} |`);
    for (const entry of suite.entries) {
      const cells = engineIds.map((id) => {
        const run = entry.report.runs.find((r) => r.engineId === id);
        if (!run || run.status !== 'ok') return run?.status === 'unsupported' ? 'n/d' : 'error';
        return String(run.medianMs);
      });
      lines.push(`| ${entry.label} | ${cells.join(' | ')} |`);
    }

    return lines.join('\n');
  }
}
