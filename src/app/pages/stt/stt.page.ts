import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
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
  IonRadio,
  IonRadioGroup,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';

import { EngineRegistry } from '../../core/engines/engine-registry';
import {
  AccuracyScore,
  DEFAULT_NORMALIZATION,
  EngineSupport,
  NormalizationOptions,
  Platform,
  SttEvent,
} from '../../core/models/lab.models';
import { percent, score } from '../../core/text/accuracy';

interface TranscriptEntry {
  atMs: number;
  kind: SttEvent['kind'];
  text: string;
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
    IonCheckbox,
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
    IonSelect,
    IonSelectOption,
    IonTextarea,
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

  readonly support = signal<Record<string, EngineSupport>>({});
  readonly engineId = signal<string>(this.engines[0]?.id ?? '');
  readonly languages = signal<string[]>([]);
  readonly language = signal('es-CL');
  readonly onDevice = signal(true);
  readonly partialResults = signal(true);

  readonly listening = signal(false);
  readonly liveText = signal('');
  readonly finalText = signal('');
  readonly log = signal<TranscriptEntry[]>([]);
  readonly groundTruth = signal('');
  readonly normalization = signal<NormalizationOptions>({ ...DEFAULT_NORMALIZATION });

  /** ms hasta el primer resultado parcial: la métrica de "sensación de rapidez". */
  readonly firstPartialMs = signal<number | undefined>(undefined);
  readonly totalMs = signal<number | undefined>(undefined);

  readonly engine = computed(() => this.registry.sttById(this.engineId()));
  readonly currentSupport = computed(() => this.support()[this.engineId()]);
  readonly canListen = computed(() => this.currentSupport()?.available === true);

  readonly accuracy = computed<AccuracyScore | undefined>(() =>
    score(this.groundTruth(), this.finalText() || this.liveText(), this.normalization()),
  );

  constructor() {
    void this.probe();
  }

  ngOnDestroy(): void {
    if (this.listening()) {
      void this.engine()?.stop();
    }
  }

  private async probe(): Promise<void> {
    const map: Record<string, EngineSupport> = {};
    for (const engine of this.engines) {
      map[engine.id] = await engine.isSupported();
    }
    this.support.set(map);

    const firstAvailable = this.engines.find((e) => map[e.id]?.available);
    if (firstAvailable) {
      this.engineId.set(firstAvailable.id);
      await this.loadLanguages();
    }
  }

  async onEngineChange(id: string): Promise<void> {
    this.engineId.set(id);
    this.reset();
    await this.loadLanguages();
  }

  private async loadLanguages(): Promise<void> {
    const engine = this.engine();
    if (!engine) return;
    const langs = await engine.getSupportedLanguages();
    this.languages.set(langs);
    // Si el dispositivo no declara nuestro idioma preferido, caemos al primero
    // que sí ofrezca en vez de fallar al iniciar la sesión.
    if (langs.length > 0 && !langs.includes(this.language())) {
      const spanish = langs.find((l) => l.startsWith('es'));
      this.language.set(spanish ?? langs[0]);
    }
  }

  supportOf(id: string): EngineSupport | undefined {
    return this.support()[id];
  }

  async toggleListening(): Promise<void> {
    if (this.listening()) {
      await this.stop();
    } else {
      await this.start();
    }
  }

  private async start(): Promise<void> {
    const engine = this.engine();
    if (!engine) return;

    const granted = await engine.requestPermissions();
    if (!granted) {
      await this.notify('Permiso de micrófono denegado.', 'danger');
      return;
    }

    this.reset();
    this.listening.set(true);

    try {
      await engine.start(
        {
          language: this.language(),
          partialResults: this.partialResults(),
          onDevice: this.onDevice(),
          maxResults: 5,
        },
        (event) => this.onEvent(event),
      );
    } catch (error) {
      this.listening.set(false);
      await this.notify(error instanceof Error ? error.message : String(error), 'danger');
    }
  }

  private async stop(): Promise<void> {
    const engine = this.engine();
    if (!engine) return;
    try {
      const matches = await engine.stop();
      if (matches.length > 0) {
        this.finalText.set(matches[0]);
      } else if (this.liveText()) {
        // Algunos reconocedores no reemiten el texto al detener: conservamos
        // el último parcial en vez de mostrar la pantalla vacía.
        this.finalText.set(this.liveText());
      }
    } catch (error) {
      await this.notify(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      this.listening.set(false);
    }
  }

  private onEvent(event: SttEvent): void {
    this.log.update((entries) => [
      ...entries,
      { atMs: event.atMs, kind: event.kind, text: event.text ?? event.state ?? event.message ?? '' },
    ]);

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

  reset(): void {
    this.liveText.set('');
    this.finalText.set('');
    this.log.set([]);
    this.firstPartialMs.set(undefined);
    this.totalMs.set(undefined);
  }

  setNormalization(key: keyof NormalizationOptions, value: boolean): void {
    this.normalization.set({ ...this.normalization(), [key]: value });
  }

  async copyTranscript(): Promise<void> {
    await navigator.clipboard.writeText(this.finalText() || this.liveText());
    await this.notify('Transcripción copiada.', 'success');
  }

  pct(value: number | undefined): string {
    return value === undefined ? '—' : percent(value);
  }

  backendFor(backend: Record<Platform, string>): string {
    return backend[this.platform];
  }

  private async notify(message: string, color: string): Promise<void> {
    const toast = await this.toasts.create({ message, color, duration: 2600, position: 'bottom' });
    await toast.present();
  }
}
