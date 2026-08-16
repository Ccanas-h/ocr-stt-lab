import { Component, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { EngineRegistry } from '../../core/engines/engine-registry';
import { EngineSupport, Platform } from '../../core/models/lab.models';

interface DeviceRow {
  label: string;
  value: string;
}

@Component({
  selector: 'app-info',
  imports: [
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: './info.page.html',
  styleUrl: './info.page.scss',
})
export class InfoPage {
  private readonly registry = inject(EngineRegistry);

  readonly platform = Capacitor.getPlatform() as Platform;
  readonly device = signal<DeviceRow[]>([]);
  readonly ocrSupport = signal<Record<string, EngineSupport>>({});
  readonly sttSupport = signal<Record<string, EngineSupport>>({});

  readonly ocrEngines = this.registry.ocr;
  readonly sttEngines = this.registry.stt;

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const info = await Device.getInfo();
    this.device.set([
      { label: 'Plataforma', value: this.platform },
      { label: 'Modelo', value: `${info.manufacturer ?? ''} ${info.model}`.trim() },
      { label: 'Sistema', value: `${info.operatingSystem} ${info.osVersion}` },
      { label: 'WebView', value: info.webViewVersion },
      { label: 'Entorno', value: Capacitor.isNativePlatform() ? 'nativo' : 'navegador' },
    ]);

    const ocr: Record<string, EngineSupport> = {};
    for (const engine of this.ocrEngines) ocr[engine.id] = await engine.isSupported();
    this.ocrSupport.set(ocr);

    const stt: Record<string, EngineSupport> = {};
    for (const engine of this.sttEngines) stt[engine.id] = await engine.isSupported();
    this.sttSupport.set(stt);
  }

  ocrSupportOf(id: string): EngineSupport | undefined {
    return this.ocrSupport()[id];
  }

  sttSupportOf(id: string): EngineSupport | undefined {
    return this.sttSupport()[id];
  }

  backendFor(backend: Record<Platform, string>): string {
    return backend[this.platform];
  }
}
