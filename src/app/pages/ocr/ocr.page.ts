import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';

import { EngineRegistry } from '../../core/engines/engine-registry';
import { TesseractEngine } from '../../core/engines/ocr/tesseract.engine';
import {
  BenchmarkReport,
  DEFAULT_NORMALIZATION,
  EngineRun,
  EngineSupport,
  LabImage,
  LabSample,
  NormalizationOptions,
  OcrScript,
  Platform,
} from '../../core/models/lab.models';
import { BenchmarkService } from '../../core/services/benchmark.service';
import { ImageSourceService } from '../../core/services/image-source.service';
import { SampleLibraryService } from '../../core/services/sample-library.service';
import { SuiteReport, SuiteRunnerService } from '../../core/services/suite-runner.service';
import {
  DEFAULT_SYNTHETIC,
  SyntheticImageOptions,
  SyntheticImageService,
} from '../../core/services/synthetic-image.service';
import { percent } from '../../core/text/accuracy';

@Component({
  selector: 'app-ocr',
  imports: [
    FormsModule,
    IonAccordion,
    IonAccordionGroup,
    IonBadge,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonCheckbox,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonProgressBar,
    IonRange,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: './ocr.page.html',
  styleUrl: './ocr.page.scss',
})
export class OcrPage implements OnDestroy {
  private readonly registry = inject(EngineRegistry);
  private readonly images = inject(ImageSourceService);
  private readonly synthetic = inject(SyntheticImageService);
  private readonly samples = inject(SampleLibraryService);
  private readonly suiteRunner = inject(SuiteRunnerService);
  private readonly benchmark = inject(BenchmarkService);
  private readonly tesseract = inject(TesseractEngine);
  private readonly toasts = inject(ToastController);

  readonly platform = Capacitor.getPlatform() as Platform;
  readonly engines = this.registry.ocr;

  /** Disponibilidad real de cada motor en este dispositivo. */
  readonly support = signal<Record<string, EngineSupport>>({});
  readonly selected = signal<Set<string>>(new Set(this.engines.map((e) => e.id)));

  readonly image = signal<LabImage | undefined>(undefined);
  readonly groundTruth = signal('');
  readonly script = signal<OcrScript>('LATIN');
  readonly tesseractLang = signal('spa');
  readonly runsPerEngine = signal(3);
  readonly normalization = signal<NormalizationOptions>({ ...DEFAULT_NORMALIZATION });

  readonly scannerAvailable = signal(false);
  readonly busy = signal(false);
  readonly busyLabel = signal('');
  readonly report = signal<BenchmarkReport | undefined>(undefined);

  readonly syntheticOptions = signal<SyntheticImageOptions>({ ...DEFAULT_SYNTHETIC });
  readonly sourceMode = signal<'samples' | 'capture' | 'synthetic'>('samples');

  readonly sampleList = signal<LabSample[]>([]);
  readonly activeSample = signal<LabSample | undefined>(undefined);
  /** Campos clave editables: se autocompletan desde la muestra elegida. */
  readonly keyFields = signal<string[]>([]);
  readonly suite = signal<SuiteReport | undefined>(undefined);

  readonly selectedCount = computed(() => this.selected().size);
  readonly canRun = computed(
    () => !this.busy() && this.image() !== undefined && this.selectedCount() > 0,
  );

  /** Mejor corrida por precisión: se usa para resaltarla en la tabla. */
  readonly bestRunId = computed(() => {
    const runs = this.report()?.runs.filter((r) => r.status === 'ok' && r.accuracy) ?? [];
    if (runs.length === 0) return undefined;
    return runs.reduce((best, r) =>
      (r.accuracy?.similarity ?? 0) > (best.accuracy?.similarity ?? 0) ? r : best,
    ).engineId;
  });

  constructor() {
    void this.probeEngines();
    void this.probeScanner();
    void this.loadSamples();
  }

  private async loadSamples(): Promise<void> {
    const list = await this.samples.list();
    this.sampleList.set(list);
    // Sin galería preparada, la pestaña útil por defecto es la de captura.
    if (list.length === 0) this.sourceMode.set('capture');
  }

  async pickSample(sample: LabSample): Promise<void> {
    await this.capture(async () => {
      const dataUrl = await this.samples.load(sample);
      return this.images.fromSample(dataUrl, sample);
    });
    this.activeSample.set(sample);
  }

  ngOnDestroy(): void {
    // El worker de Tesseract mantiene el modelo (~15 MB) en memoria.
    void this.tesseract.terminate();
  }

  // -- Motores ---------------------------------------------------------------

  private async probeEngines(): Promise<void> {
    const map: Record<string, EngineSupport> = {};
    for (const engine of this.engines) {
      map[engine.id] = await engine.isSupported();
    }
    this.support.set(map);

    // Preseleccionamos sólo lo que realmente puede correr aquí.
    this.selected.set(new Set(this.engines.filter((e) => map[e.id]?.available).map((e) => e.id)));
  }

  private async probeScanner(): Promise<void> {
    this.scannerAvailable.set(await this.images.isDocumentScannerAvailable());
  }

  supportOf(id: string): EngineSupport | undefined {
    return this.support()[id];
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  toggleEngine(id: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(id);
    else next.delete(id);
    this.selected.set(next);
  }

  // -- Origen de la imagen ---------------------------------------------------

  async pickCamera(): Promise<void> {
    await this.capture(() => this.images.fromCamera());
  }

  async pickGallery(): Promise<void> {
    await this.capture(() => this.images.fromGallery());
  }

  async pickDocumentScanner(): Promise<void> {
    await this.capture(() => this.images.fromDocumentScanner());
  }

  async generateSynthetic(): Promise<void> {
    await this.capture(async () => {
      const { dataUrl, text } = await this.synthetic.render(this.syntheticOptions());
      return this.images.fromSynthetic(dataUrl, text);
    });
  }

  private async capture(factory: () => Promise<LabImage>): Promise<void> {
    this.busy.set(true);
    this.busyLabel.set('Preparando imagen…');
    try {
      const image = await factory();
      this.image.set(image);
      this.report.set(undefined);
      this.activeSample.set(undefined);
      this.keyFields.set(image.keyFields ?? []);
      // Las imágenes sintéticas traen su texto exacto: se autocompleta la
      // referencia para poder medir precisión sin transcribir a mano.
      if (image.knownText) {
        this.groundTruth.set(image.knownText);
      }
    } catch (error) {
      await this.notify(this.describe(error), 'danger');
    } finally {
      this.busy.set(false);
      this.busyLabel.set('');
    }
  }

  async installScanner(): Promise<void> {
    try {
      await this.images.installDocumentScanner();
      await this.notify('Instalación del escáner solicitada a Play Services.', 'medium');
    } catch (error) {
      await this.notify(this.describe(error), 'danger');
    }
  }

  // -- Ejecución -------------------------------------------------------------

  async run(): Promise<void> {
    const image = this.image();
    if (!image) return;

    const engines = this.engines.filter((e) => this.selected().has(e.id));
    this.busy.set(true);
    this.report.set(undefined);

    try {
      const report = await this.benchmark.run(
        {
          engines,
          image,
          options: { script: this.script(), tesseractLang: this.tesseractLang(), language: 'es-ES' },
          groundTruth: this.groundTruth(),
          normalization: this.normalization(),
          runsPerEngine: this.runsPerEngine(),
          keyFields: this.keyFields(),
          sampleId: this.activeSample()?.id,
        },
        (p) => this.busyLabel.set(`${p.engineLabel} · pasada ${p.run}/${p.totalRuns}`),
      );
      this.report.set(report);
    } catch (error) {
      await this.notify(this.describe(error), 'danger');
    } finally {
      this.busy.set(false);
      this.busyLabel.set('');
    }
  }

  /** Recalcula precisión sin volver a ejecutar los motores. */
  rescore(): void {
    const report = this.report();
    if (!report) return;
    this.report.set(
      this.benchmark.rescore(
        report,
        this.groundTruth(),
        this.normalization(),
        this.keyFields(),
      ),
    );
  }

  setNormalization(key: keyof NormalizationOptions, value: boolean): void {
    this.normalization.set({ ...this.normalization(), [key]: value });
    this.rescore();
  }

  setSynthetic<K extends keyof SyntheticImageOptions>(
    key: K,
    value: SyntheticImageOptions[K],
  ): void {
    this.syntheticOptions.set({ ...this.syntheticOptions(), [key]: value });
  }

  /** Corre la galería entera: cada muestra contra cada motor seleccionado. */
  async runSuite(): Promise<void> {
    const samples = this.sampleList();
    if (samples.length === 0) return;

    const engines = this.engines.filter((e) => this.selected().has(e.id));
    if (engines.length === 0) return;

    this.busy.set(true);
    this.suite.set(undefined);
    this.report.set(undefined);

    try {
      const suite = await this.suiteRunner.run(
        samples,
        engines,
        { script: this.script(), tesseractLang: this.tesseractLang(), language: 'es-ES' },
        this.normalization(),
        this.runsPerEngine(),
        (p) =>
          this.busyLabel.set(
            `${p.sampleIndex}/${p.sampleCount} · ${p.sampleLabel} · ${p.engineLabel}`,
          ),
      );
      this.suite.set(suite);
    } catch (error) {
      await this.notify(this.describe(error), 'danger');
    } finally {
      this.busy.set(false);
      this.busyLabel.set('');
    }
  }

  /** Copia la tabla en Markdown, lista para pegar en la bitácora. */
  async shareSuiteMarkdown(): Promise<void> {
    const suite = this.suite();
    if (!suite) return;
    const markdown = this.suiteRunner.toMarkdown(suite);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'Tabla comparativa', text: markdown });
      } else {
        await navigator.clipboard.writeText(markdown);
        await this.notify('Tabla Markdown copiada.', 'success');
      }
    } catch (error) {
      await this.notify(this.describe(error), 'danger');
    }
  }

  async shareSuiteJson(): Promise<void> {
    const suite = this.suite();
    if (!suite) return;
    const json = JSON.stringify(suite, null, 2);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'Informe completo', text: json });
      } else {
        await navigator.clipboard.writeText(json);
        await this.notify('Informe JSON copiado.', 'success');
      }
    } catch (error) {
      await this.notify(this.describe(error), 'danger');
    }
  }

  suiteCell(entry: { report: { runs: EngineRun[] } }, engineId: string): EngineRun | undefined {
    return entry.report.runs.find((r) => r.engineId === engineId);
  }

  /** Motores presentes en el informe de lote, en orden estable. */
  suiteEngineIds(): string[] {
    const suite = this.suite();
    if (!suite) return [];
    return [...new Set(suite.entries.flatMap((e) => e.report.runs.map((r) => r.engineId)))];
  }

  suiteEngineLabel(engineId: string): string {
    return this.registry.ocrById(engineId)?.label ?? engineId;
  }

  // -- Salida ----------------------------------------------------------------

  async copyText(run: EngineRun): Promise<void> {
    await navigator.clipboard.writeText(run.text);
    await this.notify(`Texto de ${run.engineLabel} copiado.`, 'success');
  }

  async shareReport(): Promise<void> {
    const report = this.report();
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'Informe OCR', text: json, dialogTitle: 'Exportar informe' });
      } else {
        await navigator.clipboard.writeText(json);
        await this.notify('Informe JSON copiado al portapapeles.', 'success');
      }
    } catch (error) {
      await this.notify(this.describe(error), 'danger');
    }
  }

  clear(): void {
    this.image.set(undefined);
    this.report.set(undefined);
    this.suite.set(undefined);
    this.groundTruth.set('');
    this.keyFields.set([]);
    this.activeSample.set(undefined);
    void this.images.clearCache();
  }

  /** Los campos clave se editan como texto, uno por línea. */
  keyFieldsText(): string {
    return this.keyFields().join('\n');
  }

  setKeyFieldsText(value: string): void {
    this.keyFields.set(
      value
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );
  }

  keyFieldHits(run: EngineRun): string {
    if (!run.keyFields) return '—';
    return `${run.keyFields.filter((f) => f.found).length}/${run.keyFields.length}`;
  }

  difficultyColor(difficulty: string): string {
    switch (difficulty) {
      case 'baja':
        return 'success';
      case 'media':
        return 'warning';
      default:
        return 'danger';
    }
  }

  // -- Presentación ----------------------------------------------------------

  pct(value: number | undefined): string {
    return value === undefined ? '—' : percent(value);
  }

  kb(bytes: number): string {
    return `${(bytes / 1024).toFixed(0)} kB`;
  }

  statusColor(run: EngineRun): string {
    if (run.status === 'ok') return 'success';
    return run.status === 'unsupported' ? 'medium' : 'danger';
  }

  statusIcon(run: EngineRun): string {
    if (run.status === 'ok') return 'checkmark-circle';
    return run.status === 'unsupported' ? 'alert-circle' : 'close-circle';
  }

  backendFor(backend: Record<Platform, string>): string {
    return backend[this.platform];
  }

  private describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    // Cancelar la cámara o el escáner no es un fallo que valga la pena gritar.
    return /cancel/i.test(message) ? 'Operación cancelada.' : message;
  }

  private async notify(message: string, color: string): Promise<void> {
    const toast = await this.toasts.create({ message, color, duration: 2600, position: 'bottom' });
    await toast.present();
  }
}
