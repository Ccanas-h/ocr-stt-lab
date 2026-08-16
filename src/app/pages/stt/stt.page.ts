import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
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
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRadio,
  IonRadioGroup,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';

import { EngineRegistry } from '../../core/engines/engine-registry';
import {
  DEFAULT_NORMALIZATION,
  EngineSupport,
  LanguagePackStatus,
  Platform,
  SttEvent,
} from '../../core/models/lab.models';
import { LabPhrase, PHRASE_BANK } from '../../core/services/phrase-bank';
import { percent } from '../../core/text/accuracy';
import { normalizeSpanishNumbers } from '../../core/text/spanish-numbers';
import { scoreDictation, SttScore } from '../../core/text/stt-scoring';

/** Una toma: una frase, dictada con un motor, una vez. */
interface Take {
  at: string;
  phraseId: string;
  phraseText: string;
  level: number;
  engineId: string;
  engineLabel: string;
  language: string;
  heard: string;
  firstPartialMs?: number;
  totalMs?: number;
  expectedAmount: number;
  score: SttScore;
}

@Component({
  selector: 'app-stt',
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
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonRadio,
    IonRadioGroup,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: './stt.page.html',
  styleUrl: './stt.page.scss',
})
export class SttPage implements OnDestroy {
  private readonly registry = inject(EngineRegistry);
  private readonly toasts = inject(ToastController);

  readonly platform = Capacitor.getPlatform() as Platform;
  readonly engines = this.registry.stt;
  readonly phrases = PHRASE_BANK;

  readonly support = signal<Record<string, EngineSupport>>({});
  readonly engineId = signal<string>(this.engines[0]?.id ?? '');
  readonly language = signal('es-CL');
  readonly level = signal<1 | 2 | 3>(1);
  readonly phraseId = signal<string>(PHRASE_BANK[0].id);

  readonly listening = signal(false);
  readonly liveText = signal('');
  readonly finalText = signal('');
  readonly log = signal<SttEvent[]>([]);
  readonly takes = signal<Take[]>([]);

  readonly firstPartialMs = signal<number | undefined>(undefined);
  readonly totalMs = signal<number | undefined>(undefined);

  readonly languagePack = signal<LanguagePackStatus | undefined>(undefined);
  readonly preparing = signal(false);

  /**
   * Lo que la app realmente recibiría: el texto tal cual, pero con los números
   * convertidos a dígitos. «cinco mil pesos» → «5000 pesos».
   */
  readonly appOutput = computed(() => {
    const heard = this.finalText() || this.liveText();
    return heard ? normalizeSpanishNumbers(heard) : '';
  });

  readonly engine = computed(() => this.registry.sttById(this.engineId()));
  readonly currentSupport = computed(() => this.support()[this.engineId()]);
  readonly canListen = computed(() => this.currentSupport()?.available === true);

  readonly visiblePhrases = computed(() => this.phrases.filter((p) => p.level === this.level()));
  readonly phrase = computed<LabPhrase>(
    () => this.phrases.find((p) => p.id === this.phraseId()) ?? this.phrases[0],
  );

  /** Puntaje de la toma en curso, en vivo. */
  readonly currentScore = computed(() => {
    const heard = this.finalText() || this.liveText();
    if (!heard) return undefined;
    return scoreDictation(this.phrase(), heard, DEFAULT_NORMALIZATION);
  });

  /** Resumen acumulado por motor: es la tabla que decide. */
  readonly summary = computed(() => {
    const byEngine = new Map<string, Take[]>();
    for (const take of this.takes()) {
      const list = byEngine.get(take.engineId) ?? [];
      list.push(take);
      byEngine.set(take.engineId, list);
    }

    return [...byEngine.entries()]
      .map(([engineId, list]) => ({
        engineId,
        engineLabel: list[0].engineLabel,
        takes: list.length,
        amountAccuracy: list.filter((t) => t.score.amountCorrect).length / list.length,
        termAccuracy: list.reduce((sum, t) => sum + t.score.keyTermScore, 0) / list.length,
        similarity: list.reduce((sum, t) => sum + t.score.similarity, 0) / list.length,
        medianFirstPartial: medianOf(
          list.map((t) => t.firstPartialMs).filter((v): v is number => v !== undefined),
        ),
      }))
      .sort((a, b) => b.amountAccuracy - a.amountAccuracy);
  });

  constructor() {
    void this.probe();
  }

  // -- Preparación del modelo local ------------------------------------------

  /**
   * Estado del modelo local para el idioma elegido.
   *
   * Sin este chequeo la app parecería funcionar sin conexión y fallaría justo
   * cuando el usuario no tiene señal.
   */
  async refreshLanguagePack(): Promise<void> {
    const engine = this.engine();
    if (!engine?.needsLanguagePack) {
      this.languagePack.set(undefined);
      return;
    }
    this.languagePack.set(await engine.checkLanguagePack(this.language()));
  }

  /** Pide al sistema que baje el modelo, sin sacar al usuario de la app. */
  async prepareLanguagePack(): Promise<void> {
    const engine = this.engine();
    if (!engine?.needsLanguagePack) return;

    this.preparing.set(true);
    try {
      const status = await engine.downloadLanguagePack(this.language());
      this.languagePack.set(status);
      await this.notify(status.message, status.state === 'unsupported' ? 'danger' : 'success');
    } finally {
      this.preparing.set(false);
    }
  }

  languagePackColor(state: LanguagePackStatus['state']): string {
    switch (state) {
      case 'installed':
        return 'success';
      case 'downloading':
        return 'warning';
      case 'missing':
        return 'danger';
      default:
        return 'medium';
    }
  }

  ngOnDestroy(): void {
    if (this.listening()) void this.engine()?.stop();
  }

  private async probe(): Promise<void> {
    const map: Record<string, EngineSupport> = {};
    for (const engine of this.engines) {
      map[engine.id] = await engine.isSupported();
    }
    this.support.set(map);

    const firstAvailable = this.engines.find((e) => map[e.id]?.available);
    if (firstAvailable) this.engineId.set(firstAvailable.id);
    await this.refreshLanguagePack();
  }

  supportOf(id: string): EngineSupport | undefined {
    return this.support()[id];
  }

  onEngineChange(id: string): void {
    this.engineId.set(id);
    this.reset();
    void this.refreshLanguagePack();
  }

  onLanguageChange(language: string): void {
    this.language.set(language);
    void this.refreshLanguagePack();
  }

  onLevelChange(level: 1 | 2 | 3): void {
    this.level.set(level);
    const first = this.visiblePhrases()[0];
    if (first) this.selectPhrase(first.id);
  }

  selectPhrase(id: string): void {
    this.phraseId.set(id);
    this.reset();
  }

  /** Pasa a la frase siguiente del nivel, para encadenar tomas sin buscar. */
  nextPhrase(): void {
    const list = this.visiblePhrases();
    const index = list.findIndex((p) => p.id === this.phraseId());
    const next = list[(index + 1) % list.length];
    if (next) this.selectPhrase(next.id);
  }

  async toggleListening(): Promise<void> {
    if (this.listening()) await this.stop();
    else await this.start();
  }

  private async start(): Promise<void> {
    const engine = this.engine();
    if (!engine) return;

    if (!(await engine.requestPermissions())) {
      await this.notify('Permiso de micrófono denegado.', 'danger');
      return;
    }

    this.reset();
    this.listening.set(true);

    try {
      await engine.start(
        {
          language: this.language(),
          partialResults: true,
          onDevice: false, // lo fija la configuración del motor, no la pantalla
          maxResults: 5,
        },
        (event) => this.onEvent(event),
      );
    } catch (error) {
      this.listening.set(false);
      await this.notify(this.describe(error), 'danger');
    }
  }

  private async stop(): Promise<void> {
    const engine = this.engine();
    if (!engine) return;
    try {
      const matches = await engine.stop();
      if (matches.length > 0) this.finalText.set(matches[0]);
      else if (this.liveText()) this.finalText.set(this.liveText());
    } catch (error) {
      await this.notify(this.describe(error), 'danger');
    } finally {
      this.listening.set(false);
    }
  }

  private onEvent(event: SttEvent): void {
    this.log.update((entries) => [...entries, event]);

    switch (event.kind) {
      case 'partial':
        if (this.firstPartialMs() === undefined) this.firstPartialMs.set(event.atMs);
        this.liveText.set(event.text ?? '');
        this.totalMs.set(event.atMs);
        break;
      case 'final':
        this.finalText.set(event.text ?? '');
        this.totalMs.set(event.atMs);
        break;
      case 'state':
        if (event.state === 'stopped') this.listening.set(false);
        break;
      case 'error':
        this.listening.set(false);
        void this.notify(event.message ?? 'Error de reconocimiento.', 'danger');
        break;
    }
  }

  /** Guarda la toma actual en el registro y avanza a la frase siguiente. */
  async saveTake(): Promise<void> {
    const heard = this.finalText() || this.liveText();
    const engine = this.engine();
    if (!heard || !engine) return;

    const phrase = this.phrase();
    this.takes.update((list) => [
      ...list,
      {
        at: new Date().toISOString(),
        phraseId: phrase.id,
        phraseText: phrase.text,
        level: phrase.level,
        engineId: engine.id,
        engineLabel: engine.label,
        language: this.language(),
        heard,
        firstPartialMs: this.firstPartialMs(),
        totalMs: this.totalMs(),
        expectedAmount: phrase.amount,
        score: scoreDictation(phrase, heard, DEFAULT_NORMALIZATION),
      },
    ]);

    await this.notify(`Toma guardada (${this.takes().length} en total).`, 'success');
    this.nextPhrase();
  }

  discardTakes(): void {
    this.takes.set([]);
  }

  reset(): void {
    this.liveText.set('');
    this.finalText.set('');
    this.log.set([]);
    this.firstPartialMs.set(undefined);
    this.totalMs.set(undefined);
  }

  // -- Exportación ------------------------------------------------------------

  async exportMarkdown(): Promise<void> {
    if (this.takes().length === 0) return;
    const info = await Device.getInfo();
    const markdown = this.toMarkdown(`${info.manufacturer ?? ''} ${info.model}`.trim(),
      `${info.operatingSystem} ${info.osVersion}`);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'Resultados de voz', text: markdown });
      } else {
        await navigator.clipboard.writeText(markdown);
        await this.notify('Tabla copiada.', 'success');
      }
    } catch (error) {
      await this.notify(this.describe(error), 'danger');
    }
  }

  private toMarkdown(device: string, os: string): string {
    const lines: string[] = [];
    lines.push(`### ${device} · ${os}`);
    lines.push('');
    lines.push(`${this.takes().length} tomas · idioma ${this.language()}`);
    lines.push('');
    lines.push('| Motor | Tomas | Monto correcto | Términos clave | Similitud | 1.er parcial |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const row of this.summary()) {
      lines.push(
        `| ${row.engineLabel} | ${row.takes} | ${percent(row.amountAccuracy)} | ` +
          `${percent(row.termAccuracy)} | ${percent(row.similarity)} | ${row.medianFirstPartial} ms |`,
      );
    }
    lines.push('');
    lines.push('<details><summary>Detalle por toma</summary>');
    lines.push('');
    lines.push('| Frase | Motor | Esperado | Entendido | Transcripción |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const take of this.takes()) {
      const heardAmount = take.score.heardAmount ?? '—';
      const mark = take.score.amountCorrect ? '✅' : '❌';
      lines.push(
        `| ${take.phraseId} | ${take.engineLabel} | ${take.expectedAmount} | ` +
          `${mark} ${heardAmount} | ${take.heard.replace(/\|/g, '\\|')} |`,
      );
    }
    lines.push('');
    lines.push('</details>');
    return lines.join('\n');
  }

  // -- Presentación -----------------------------------------------------------

  pct(value: number | undefined): string {
    return value === undefined ? '—' : percent(value);
  }

  backendFor(backend: Record<Platform, string>): string {
    return backend[this.platform];
  }

  takesFor(engineId: string): number {
    return this.takes().filter((t) => t.engineId === engineId).length;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async notify(message: string, color: string): Promise<void> {
    const toast = await this.toasts.create({ message, color, duration: 2200, position: 'top' });
    await toast.present();
  }
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
  );
}
