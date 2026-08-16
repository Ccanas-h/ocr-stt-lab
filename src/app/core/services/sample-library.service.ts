import { Injectable } from '@angular/core';
import { LabSample } from '../models/lab.models';

/**
 * Galería de imágenes reales con su transcripción y campos clave ya preparados.
 *
 * Las muestras viven en `public/samples/` y **no se versionan**: las boletas
 * reales traen datos personales. El repositorio sólo lleva
 * `manifest.example.json` como plantilla. Si no hay manifiesto, la galería
 * aparece vacía con instrucciones en vez de romperse.
 */
@Injectable({ providedIn: 'root' })
export class SampleLibraryService {
  private cache?: LabSample[];

  async list(): Promise<LabSample[]> {
    if (this.cache) return this.cache;

    try {
      const response = await fetch('samples/manifest.json', { cache: 'no-cache' });
      if (!response.ok) {
        this.cache = [];
        return this.cache;
      }
      const parsed = (await response.json()) as { samples?: LabSample[] };
      this.cache = parsed.samples ?? [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  /** Data-URL de la imagen de una muestra, lista para procesar. */
  async load(sample: LabSample): Promise<string> {
    const response = await fetch(`samples/${sample.file}`);
    if (!response.ok) {
      throw new Error(`No se encontró la imagen de muestra "${sample.file}".`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la muestra.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }
}
