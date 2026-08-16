# OCR/STT Lab

Banco de pruebas para decidir **con qué librería nos quedamos** para extraer texto de
imágenes (OCR) y transcribir voz a texto (STT) en Android e iOS, usando únicamente
capacidades del propio sistema operativo: sin microservicios, sin exponer nada a la red.

No es un demo. Es un instrumento de medición: cada motor se ejecuta sobre **los mismos
píxeles**, se cronometra igual y se puntúa contra un texto de referencia, para poder
comparar peras con peras.

## Resultados

Cuatro boletas y documentos fotografiados con celular, medidos en dos dispositivos reales.
Detalle completo en [BITACORA.md](BITACORA.md).

| Motor | Campos clave | Tiempo (S20+) | Tiempo (S25) |
| --- | --- | --- | --- |
| ML Kit v2 — los 3 plugins | **83.1 %** | 140–444 ms | 57–223 ms |
| Tesseract 5 (WASM) | 36.6 % | 887–3785 ms | 377–1570 ms |

Tres cosas que costaría caro descubrir tarde:

**1. Medir con el caso feliz lleva a la decisión equivocada.** Con una imagen sintética
limpia Tesseract ganaba con 98.4 %. Con fotos reales cae a 36.6 % y en un caso no recupera
ni un campo. Fue entrenado para documentos escaneados, no para fotos de celular.

**2. Hardware más nuevo no mejora la precisión — ni un punto.** Las 16 celdas de precisión
son idénticas entre un Galaxy S20+ (2020) y un S25 (2025). Mismo modelo, misma salida; la
NPU sólo acelera (~2.3×). El techo de ~83 % no se sube comprando teléfonos mejores: hay
que mejorar la imagen que entra, no el motor.

**3. Sólo un plugin expone la confianza que ML Kit sí calcula.** `Text.Line.getConfidence()`
existe en Android, pero de los cuatro plugins únicamente `@jcesarmobile/capacitor-ocr` la
entrega — y también en iOS, vía Vision. Es lo que permite que una app diga "esta foto no me
convence" en vez de devolver texto malo en silencio.

---

## Documentos

| Documento | Para qué |
| --- | --- |
| [BITACORA.md](BITACORA.md) | Las mediciones. Qué librería gana y con qué números. |
| [GUIA-IMPLEMENTACION.md](GUIA-IMPLEMENTACION.md) | **Cómo implementarlo bien.** Lo aprendido midiendo en dispositivos reales: bugs de plugins, trampas de API, normalización de montos, ventana de arranque del micrófono. |
| [PLAN-IOS.md](PLAN-IOS.md) | **Plan de pruebas en iPhone.** Qué tiene el Mac, qué falta firmar, y los tres hallazgos que ya cambian el plan antes de compilar. |
| [PLAN-VOZ.md](PLAN-VOZ.md) | Plan de pruebas de voz y alternativas del mercado. |
| [PLAN-CORPUS.md](PLAN-CORPUS.md) | Cómo ampliar el corpus de imágenes sin problemas de licencia ni datos de terceros. |

## Decisiones de stack y por qué

| Pieza | Versión | Por qué esta |
| --- | --- | --- |
| Angular | **20.3** | Ionic 8 declara soporte oficial hasta Angular 20.x, y `@ionic/angular-toolkit` depende de `@schematics/angular@^20`. Angular 21 y 22 ya existen, pero quedarían fuera de la matriz soportada por Ionic. |
| Ionic | **8.8** | Versión activa. Da los componentes móviles nativos y la integración con Capacitor. |
| Capacitor | **8.5** | Requisito de todos los plugins elegidos (`@capacitor/core >= 8`). |
| TypeScript | 5.9 | Lo que arrastra Angular 20. |
| Node | **22.23.1** | Fijado en `.node-version`. Angular 20 acepta 20.19+, pero 22 LTS deja margen y es lo que pide Capacitor 8. |
| JDK | 21 (JBR de Android Studio) | Requisito de AGP 8.13. |
| Android | compileSdk 36 · minSdk 24 | Valores por defecto de Capacitor 8. |
| iOS | deployment target **16.0** | ML Kit 8.x no acepta menos. Subido desde el 15.0 por defecto de Capacitor. |

**Ionic en vez de Angular a secas**: el objetivo final es una app para tienda en ambos
sistemas. Ionic aporta los componentes móviles y, sobre todo, Capacitor, que es el
puente hacia el código nativo donde viven ML Kit y Vision. Con Angular puro habría que
construir ese puente a mano.

---

## Los motores en competencia

### Imagen → texto

| Motor | Paquete | Android | iOS |
| --- | --- | --- | --- |
| **ML Kit v2 embebido** | `@capacitor-mlkit/text-recognition@8.2` | `com.google.mlkit:text-recognition` (modelos en el APK) | pod `GoogleMLKit/TextRecognition` |
| **ML Kit v2 vía Play Services** | `@pantrist/capacitor-plugin-ml-kit-text-recognition@8.0` | `play-services-mlkit-text-recognition` (modelo lo sirve Play) | pod `GoogleMLKit/TextRecognition` |
| **Vision / ML Kit** | `@jcesarmobile/capacitor-ocr@0.3` | ML Kit v2 | **`VNRecognizeTextRequest`** (framework del sistema) |
| **Tesseract 5** (control) | `tesseract.js@7` | WASM en el WebView | WASM en el WebView |

Los tres primeros usan **el mismo motor en Android** (ML Kit v2). Eso es intencional y no
es redundancia: lo que se mide entre ellos es *cómo se entrega* ese motor —peso del
binario, dependencia de Play Services, latencia de arranque en frío— mientras que la
diferencia de calidad real aparece **en iOS**, donde `vision-mlkit` usa Vision de Apple y
los otros dos usan ML Kit.

Tesseract es el **control del experimento**: es el único idéntico en las tres plataformas,
así que cualquier diferencia Android/iOS que muestre viene del WebView y no del OCR.
No es candidato a producción (más lento, y descarga el modelo de idioma de un CDN).

También está instalado `@capacitor-mlkit/document-scanner`, que **no es un motor de OCR**
sino un preprocesamiento: recorta, endereza y realza el documento antes de reconocerlo.
Sirve para medir cuánto gana cada motor con una imagen ya rectificada. Sólo Android.

### Voz → texto

| Motor | Paquete | Android | iOS |
| --- | --- | --- | --- |
| **Nativo del SO** | `@capgo/capacitor-speech-recognition@8.1` | `android.speech.SpeechRecognizer` | `SFSpeechRecognizer` / `SpeechAnalyzer` (iOS 26+) |
| **Web Speech API** | — | no disponible en el WebView | no disponible en el WebView |

El segundo existe sólo para poder desarrollar la pantalla en el navegador; no compite.

---

## Qué se descartó, y por qué

- **`@capacitor-community/image-to-text`** — En iOS usa Vision y en Android ML Kit, o sea
  la misma cobertura que `@jcesarmobile/capacitor-ocr`, pero arrastra
  `com.google.firebase:firebase-ml-vision:24.0.1` (SDK descontinuado por Google) y
  `firebase-analytics:17.2.3`, y exige crear un proyecto Firebase con `google-services.json`.
  Más fricción y dependencias muertas a cambio de cero cobertura adicional.

- **`@capacitor-community/speech-recognition`** — Registra el plugin nativo con el mismo
  nombre (`SpeechRecognition`) que el de Capgo. Con ambos instalados, Capacitor resuelve
  uno solo y el otro queda inalcanzable desde JS: la comparación sería una ilusión.
  Son **mutuamente excluyentes**; para cambiar de uno a otro, ver abajo.

- **Cualquier OCR de nube** (Cloud Vision, Textract, Azure) — fuera de alcance por
  requisito explícito: nada que obligue a levantar y exponer un microservicio.

---

## Cómo se mide

### Campos clave — la métrica que decide

Para una app que digitaliza boletas, la pregunta real no es "¿transcribió el texto
completo?" sino **"¿puedo sacar el RUT, el folio y el total?"**. Cada muestra declara sus
campos clave y el motor acierta si ese dato aparece en su salida, **sin importar el
orden**.

Esto importa porque los motores modernos agrupan por bloques visuales: en una boleta con
columnas (`descripción … monto`), ML Kit reordena respecto a la lectura por renglón. El
CER lo castiga duramente aunque no haya leído mal ni una letra. Los campos clave no.

### Precisión de texto completo

Contra un texto de referencia se calculan:
- **CER** (Character Error Rate): Levenshtein por carácter ÷ caracteres de referencia.
- **WER** (Word Error Rate): lo mismo a nivel de palabra.
- **Similitud**: `1 − CER`.

Sin texto de referencia sólo se comparan tiempos — un 0 % sería engañoso, así que no se
muestra nada.

Las **reglas de comparación** (ignorar mayúsculas, tildes, puntuación, espacios) son
ajustables y se recalculan **sin volver a ejecutar los motores**: los tiempos ya medidos
siguen siendo válidos y repetirlos sólo los ensuciaría.

### Tiempo

Los motores corren **en serie**, nunca en paralelo: comparten CPU/GPU/NPU del mismo
teléfono. Se reportan dos números distintos:
- `mediana` de N pasadas → el costo real en régimen.
- `en frío` → la primera pasada, que incluye cargar el modelo.

### De dónde salen las imágenes

1. **Muestras** — galería de fotos reales con transcripción y campos clave ya preparados.
   Siempre los mismos bytes, así que los resultados se comparan entre dispositivos. Viven
   en `public/samples/` y **no se versionan** (ver más abajo).
2. **Capturar** — cámara, galería o escáner de documentos.
3. **Generar** — dibuja texto conocido sobre un canvas, con rotación, desenfoque, ruido,
   contraste y calidad JPEG regulables uno a uno. La referencia se completa sola. Sirve
   para encontrar *dónde se rompe* cada motor variando una sola cosa a la vez.

### Modo de lote

El botón **Ejecutar galería completa** corre cada muestra contra cada motor en una sola
sesión —mismo estado térmico, mismas imágenes— y produce la tabla comparativa. Se exporta
como Markdown listo para pegar en [BITACORA.md](BITACORA.md), o como JSON completo.

---

## Las imágenes de prueba no están en este repositorio

`public/samples/` y `images-test/` están en `.gitignore` **a propósito**. Las boletas
reales traen nombres, RUT, números de cuenta y correos de terceros que no dieron permiso
para publicarlos. Lo que sí se versiona es
[`manifest.example.json`](public/samples/manifest.example.json), la plantilla, y las
métricas agregadas en la bitácora — que es lo que tiene valor para otros desarrolladores.

Para armar tu propia galería: copia tus imágenes a `public/samples/`, duplica
`manifest.example.json` como `manifest.json` y descríbelas.

---

## Puesta en marcha

```bash
cd ocr-stt-lab
fnm use                 # lee .node-version → 22.23.1
npm install
```

Variables de entorno necesarias para Android (esta máquina no las tiene en el perfil):

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
```

### Android

```bash
npm run build:android          # ng build + cap copy + assembleDebug
npm run install:android        # adb install -r
```

O abrir en Android Studio: `npx cap open android`.

### iOS

```bash
npm run build:ios
npx cap open ios               # firmar y correr desde Xcode
```

> El plugin de ML Kit **sólo soporta CocoaPods**, no Swift Package Manager. Por eso la
> plataforma iOS se creó con `npx cap add ios --packagemanager CocoaPods`. No migrar a SPM.

### Navegador (sólo para maquetar)

```bash
npm start
```

En el navegador únicamente corre Tesseract; los motores nativos aparecen marcados como no
disponibles, que es la respuesta correcta.

---

## Cambiar el plugin de voz

Los dos plugins de STT no pueden convivir. Para evaluar el de la comunidad:

```bash
npm run stt:use-community      # desinstala el de Capgo, instala el community
npm run stt:use-capgo          # vuelve atrás
```

Después de cambiar hay que reimplementar el adaptador en
`src/app/core/engines/stt/native-speech.engine.ts` (las APIs difieren) y recompilar el
nativo. El contrato `SttEngine` no cambia, así que la pantalla no se toca.

---

## Arquitectura

```
src/app/core/
  models/lab.models.ts          Contratos OcrEngine y SttEngine ← la fachada única
  text/accuracy.ts              Levenshtein, CER, WER, normalización
  engines/
    engine-registry.ts          Único lugar donde se declaran los candidatos
    ocr/*.engine.ts             Un adaptador por librería
    stt/*.engine.ts
  services/
    image-source.service.ts     Cámara/galería/escáner/sintética → misma LabImage
    synthetic-image.service.ts  Generador de imágenes con texto conocido
    benchmark.service.ts        Ejecuta en serie, cronometra, puntúa, ordena
src/app/pages/
  ocr/   voz/   info/   tabs/
```

**Lo importante para lo que viene.** `OcrEngine` y `SttEngine` ya son la interfaz que
consumirá la app definitiva. Cuando la medición diga, por ejemplo, "Vision gana en iOS y
ML Kit en Android", ese resultado se implementa como **un motor más** que enruta por
plataforma:

```ts
async recognize(image: LabImage, options: OcrOptions): Promise<OcrOutput> {
  return Capacitor.getPlatform() === 'ios'
    ? this.vision.recognize(image, options)
    : this.mlkit.recognize(image, options);
}
```

Ni la pantalla ni el resto de la app se enteran: siempre llaman al mismo método. Ese es el
plugin encapsulado que se pidió, y la forma de la interfaz ya está preparada para él.

Para **agregar un candidato nuevo**: crear el adaptador que implemente `OcrEngine` y
sumarlo a la lista de `EngineRegistry`. Nada más cambia.

---

## Exportar resultados

El botón de compartir de la pantalla de OCR emite el informe completo en JSON: plataforma,
metadatos de la imagen, opciones, y por cada motor todas las pasadas, el texto reconocido
y las métricas. Sirve para comparar dispositivos entre sí fuera de la app.
