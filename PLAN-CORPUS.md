# Plan: corpus de imágenes por nivel de dificultad

**Estado: propuesto, no ejecutado.** Queda anotado para una fase posterior.

La idea es dejar de depender de un puñado de fotos propias y armar un corpus con
gradiente de dificultad controlado, para que la tabla comparativa diga no sólo *qué motor
gana* sino **a partir de qué nivel de degradación cada uno se rompe**.

---

## Por qué no basta con descargar imágenes de Google

Vale la pena decirlo antes de invertir tiempo: bajar boletas de un buscador tiene tres
problemas que dañarían la medición.

1. **Licencia.** Casi ninguna imagen indexada es libre de redistribuir. Meterlas en un
   repositorio público es un problema legal, no un detalle.
2. **Datos de terceros.** Las boletas reales que circulan traen RUT, nombres y montos de
   personas que no dieron permiso — el mismo problema que ya nos obligó a excluir
   `public/samples/` de este repo.
3. **Sesgo de selección.** Las imágenes que aparecen en un buscador son las que alguien
   consideró dignas de publicar: están bien encuadradas y bien iluminadas. Justo lo
   contrario del caso que nos importa.

## Enfoque recomendado: degradación sintética a partir de originales propios

En vez de buscar imágenes ya degradadas, tomar **una sola foto buena** de cada documento y
generar la escala de dificultad aplicándole degradaciones medidas. Así:

- la referencia es idéntica en todos los niveles, así que la caída de precisión es
  atribuible **sólo** a la degradación;
- el corpus es reproducible: otro desarrollador aplica los mismos parámetros y obtiene las
  mismas imágenes;
- no hay problema de licencia ni de datos de terceros si los originales son propios y
  están censurados.

El generador de imágenes sintéticas de la app ya hace esto para texto dibujado. Faltaría
extender el mismo pipeline a **fotos reales**:

| Eje | Rango sugerido | Qué mide |
| --- | --- | --- |
| Desenfoque gaussiano | 0 → 8 px | Pulso al tomar la foto |
| Calidad JPEG | 100 % → 15 % | Recompresión de WhatsApp y similares |
| Rotación | 0° → 30° | Foto tomada en ángulo |
| Perspectiva | 0 → 25° de inclinación | Documento no paralelo al sensor |
| Iluminación | Gradiente 0 → 70 % | Sombra del propio cuerpo sobre el papel |
| Resolución | 100 % → 25 % | Cámaras de gama baja |
| Ruido | 0 → 40 % | Fotos con poca luz, ISO alto |

Un barrido de un eje a la vez, dejando los demás fijos, entrega la curva de degradación de
cada motor. El punto donde la curva cae bajo el umbral aceptable **es** el criterio de
decisión.

## Fuentes legítimas si se quiere ampliar

Si además se busca variedad de formatos de boleta, hay corpus con licencia explícita:

- **SROIE** (ICDAR 2019, Scanned Receipt OCR and Information Extraction) — ~1000 boletas
  escaneadas con anotación de campos clave. Es exactamente el problema de esta app.
- **CORD** (Consolidated Receipt Dataset) — ~11.000 boletas indonesias con campos
  etiquetados.
- **FUNSD** — formularios escaneados, útil para documentos que no son boletas.

Ojo con los dos primeros: son boletas asiáticas, con tipografías y formatos que no
representan al mercado chileno. Sirven para volumen, no para decidir.

## Pasos concretos

1. Extender `SyntheticImageService` para aceptar una foto de entrada y aplicarle los ejes
   de degradación, en vez de dibujar texto.
2. Agregar al manifiesto de muestras un campo `variants` que declare el barrido.
3. Extender el modo de lote para correr `muestra × variante × motor`.
4. Graficar la curva precisión-vs-degradación por motor.
5. Reunir de 15 a 20 boletas propias (no de terceros) que cubran los emisores frecuentes:
   supermercado, farmacia, restaurante, bencinera, comercio pequeño con impresora térmica
   gastada.
