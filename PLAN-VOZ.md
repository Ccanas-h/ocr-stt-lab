# Plan de pruebas: voz → texto en Android

Objetivo: decidir con qué configuración de reconocimiento de voz se queda la app, para el
caso de uso real — que alguien diga **en qué gastó**, en frases cortas (3 a 40 segundos):

> «Gasté cinco mil pesos en el supermercado, en la subcategoría de carnes»

---

## Tres hechos que condicionan todo el diseño

Antes de escribir código conviene fijar tres cosas descubiertas en el S20+, porque cambian
qué tiene sentido medir.

### 1. En Android no hay varias librerías. Hay una API y varias configuraciones.

Igual que en OCR —donde tres plugins resultaron ser el mismo ML Kit— todos los plugins de
voz de Capacitor terminan en `android.speech.SpeechRecognizer`. Cambiar de plugin no
cambia de motor.

Lo que **sí** son motores distintos, y por eso son las tres filas de la tabla:

| Configuración | Cómo se activa | Dónde se procesa el audio |
| --- | --- | --- |
| **Google on-device** | `useOnDeviceRecognition: true` → `createOnDeviceSpeechRecognizer` (API 31+) | Nunca sale del teléfono |
| **Google en red** | `useOnDeviceRecognition: false` | Servidores de Google |
| **Diálogo del sistema** | `popup: true` → `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` | Servidores de Google, con UI de Google |

En el S20+ están instalados los dos motores necesarios:

- `com.google.android.tts` v20260720 — Google Speech Services, el reconocedor **on-device**.
  Es además el `voice_recognition_service` configurado por defecto.
- `com.google.android.googlequicksearchbox` v17.48 — la app de Google, el reconocedor **en red**.

Samsung trae `svoiceime` y Bixby, pero no se exponen como `RecognitionService` para apps de
terceros, así que no compiten.

### 2. El audio no se puede repetir en un teléfono real

`SpeechRecognizer` abre el micrófono él mismo: no hay forma de inyectarle un archivo. Esto
rompe la garantía que sí teníamos en OCR de que «todos los motores ven exactamente los
mismos bytes». Se resuelve con dos caminos complementarios:

| Camino | Dónde | Qué mide | Reproducible |
| --- | --- | --- | --- |
| **Dictado guiado** | Teléfono real | Rendimiento real: micrófono del teléfono, acento chileno, ruido de la pieza | No — hay que repetir y promediar |
| **Reproducción acústica** | Teléfono real | Diferencias entre motores con la misma entrada, sin la variable humana | Sí, dentro de una misma sesión |

### Reproducción acústica: cómo funciona y qué vale

**Verificado y funcionando.** macOS genera el audio con `say` y una voz en español, y se
reproduce por los parlantes del Mac mientras el teléfono —que está al lado, conectado por
USB— escucha por su micrófono. El ciclo completo se dispara desde un solo comando para que
el toque y el audio queden sincronizados:

```bash
adb -s <serial> shell input tap <x> <y>   # inicia la escucha
sleep 1.2                                  # el reconocedor necesita despertar
afplay frase.aiff                          # el teléfono lo capta por el micrófono
```

El `sleep` no es adorno: separar el toque del audio en dos llamadas distintas hace que el
reconocedor se cierre por silencio antes de que suene nada. Fue el motivo de los primeros
intentos fallidos.

**Lo que este método sí permite:** comparar configuraciones entre sí con exactamente la
misma entrada, y hacerlo sin que nadie tenga que hablar. Es lo que convierte la batería en
algo repetible.

**Lo que este método NO permite, y hay que tener presente al leer los números:**

- La voz es sintética y de acento mexicano, no chilena. Sirve para comparar motores, **no**
  para afirmar cuánto acertará con usuarios reales.
- El audio pasa por parlante y micrófono, así que arrastra la acústica de la sala.
- **Las primeras palabras se pierden**: el reconocedor tarda en despertar y el audio ya va
  sonando. En las pruebas «Gasté» salió como «Castel» y «Pagué» como «calle». Es artefacto
  del método, no del motor.
- Por lo mismo, **los tiempos de latencia que reporta no son válidos**: incluyen el `sleep`
  y la duración del audio.

Para números de precisión con usuarios reales sigue haciendo falta el dictado humano.

### 3. Los números son el problema, igual que en OCR

En las boletas lo que se perdía eran los números largos. Acá pasa algo parecido pero por
otro motivo: **«cinco mil», «5000», «5 mil» y «$5.000» son todos correctos**, y un WER
crudo los cuenta como error.

Sin normalizar números, la medición no dice nada útil. Por eso el plan incluye convertir
números en palabras a dígitos **antes** de comparar. Es el equivalente exacto de lo que
fueron los «campos clave» en OCR: la métrica que refleja si la app puede hacer su trabajo.

---

## Qué se mide

### Métrica que decide: extracción de campos

De cada frase dictada la app real necesita sacar tres cosas. Se evalúa cada una por
separado:

| Campo | Ejemplo | Cómo se valida |
| --- | --- | --- |
| **Monto** | 5000 | Normalizado a entero. `cinco mil` = `5.000` = `5000` |
| **Comercio** | supermercado, Líder, Cruz Verde | Aparece en la transcripción |
| **Categoría** | carnes, farmacia | Aparece en la transcripción |

El monto es el crítico: un comercio mal escrito el usuario lo corrige de un vistazo, un
monto equivocado se cuela al presupuesto.

### Métricas de apoyo

- **WER / CER** sobre texto normalizado (números a dígitos, sin tildes, sin puntuación).
- **Latencia al primer parcial** — cuánto tarda en aparecer texto en pantalla. Es lo que
  define si la app se siente viva mientras hablas.
- **Latencia al resultado final** — desde que dejas de hablar hasta que cierra.
- **Disponibilidad del idioma on-device** — `isOnDeviceRecognitionAvailable('es-CL')`.
  Si el paquete de español no está descargado, el modo on-device cae a red sin avisar, y
  eso hay que detectarlo o la medición miente.

---

## Banco de frases

Fijo y versionado, para que las corridas se comparen entre sí. Tres niveles:

**Nivel 1 — lo típico (3–5 s)**
1. «Gasté cinco mil pesos en el supermercado»
2. «Pagué doce mil quinientos en la farmacia»
3. «Gasté 45.990 pesos en Falabella»

**Nivel 2 — con categoría (6–10 s)**
4. «Gasté cinco mil pesos en el supermercado, en la subcategoría de carnes»
5. «Pagué tres mil doscientos en el almuerzo de hoy, categoría comida»
6. «Gasté 89.990 pesos en Líder con tarjeta de crédito, categoría despensa»

**Nivel 3 — el límite declarado (30–40 s)**
7. Detalle de boleta completa con seis ítems y montos.

Se incluyen a propósito nombres de comercios chilenos (Líder, Jumbo, Santa Isabel,
Cruz Verde, Copec) porque los nombres propios son donde más falla el reconocimiento, y son
justamente los que la app necesita.

También se mide con **es-CL, es-ES y es-US** — el S20+ tiene el sistema en `es-US`, y vale
la pena saber si declarar `es-CL` mejora o empeora el reconocimiento de montos.

---

## Fases

### Fase 1 — Instrumentar (código)

1. Convertir el motor único de voz en **tres motores** que fijan las tres configuraciones
   reales (on-device, red, diálogo del sistema). El contrato `SttEngine` no cambia.
2. Normalizador de números en español: `«cinco mil»` → `5000`. Cubre unidades, decenas,
   centenas, `mil`, `millón`, y las formas mixtas (`5 mil`).
3. Extractor de campos: monto, comercio, categoría.
4. Pantalla de dictado guiado: banco de frases, se elige una, se dicta, se registra
   transcripción + parciales + tiempos + campos acertados.
5. Registro de sesión acumulado y exportación a Markdown/JSON, igual que en OCR.

### Fase 2 — Correr en el S20+ (requiere que dictes tú)

Cada frase × cada configuración × 3 repeticiones. Con 7 frases y 3 configuraciones son
63 dictados; conviene partir con el nivel 1 y 2 (6 frases → 54) y dejar el nivel 3 para
después.

### Fase 3 — Correr en el emulador con audio sintético

Mismas frases generadas con `say`, entrada idéntica para las tres configuraciones. Sirve
para separar «lo que falla por el motor» de «lo que falla por cómo hablo yo o por el
micrófono».

### Fase 4 — Comparar plugins (no motores)

Cambiar `@capgo/capacitor-speech-recognition` por `@capacitor-community/speech-recognition`
con `npm run stt:use-community` y repetir una corrida corta. Se espera **la misma
precisión** —es el mismo motor— y diferencias sólo en API: parciales, push-to-talk,
segmentación por silencio.

---

## La ventana de arranque: por qué existe y cómo se mide

Android tiene dos momentos distintos que es fácil confundir:

| Momento | Qué significa |
| --- | --- |
| `startListening()` retorna | Se **pidió** arrancar. El micrófono todavía no captura. |
| `onReadyForSpeech()` | Android confirma que **ya está capturando**. Recién aquí se puede hablar. |

Entre ambos hay una ventana en la que el usuario puede hablar y no ser escuchado. Es
exactamente lo que se vio en las primeras tomas: «Gasté» salió «Castel» y «Pagué» salió
«calle» — la primera palabra cayó dentro de esa ventana.

**El plugin se traga `onReadyForSpeech`**: emite su evento `started` justo después de
`startListening()`, o sea antes de que el micrófono capture. Desde JavaScript no había
forma de saber cuándo se puede hablar. El parche expone un evento `readyForSpeech`, y con
eso la app mide la ventana y muestra «habla ahora» sólo cuando corresponde.

Se mide separando dos casos, porque suelen ser muy distintos:

- **Arranque en frío** — el primero después de abrir la app. Incluye crear el reconocedor
  y, en el caso de red, levantar la conexión con el servicio.
- **Arranques siguientes** — con el reconocedor ya vivo.

Si la diferencia es grande, la solución no es hacer esperar al usuario: es **precalentar**
el reconocedor al abrir la pantalla de registrar gasto, para que al tocar el micrófono ya
esté listo. La capa de «espera un momento» sólo hace falta si ni siquiera precalentando
baja lo suficiente.

---

## Alternativas más instantáneas: qué ofrece el mercado hoy

La razón de fondo de la ventana de arranque es que `SpeechRecognizer` **no corre dentro de
la app**: es un servicio del sistema (`com.google.android.tts`) al que hay que conectarse
por IPC. Ese enlace es el que cuesta. Un motor que corra **dentro del proceso** no tiene
ese costo.

| Motor | Dónde corre | Arranque | Precisión esperada | Costo real |
| --- | --- | --- | --- | --- |
| **Google on-device** | Servicio del sistema | Ventana de enlace IPC | Alta | Gratis. Es lo que ya medimos. |
| **Google en red** | Servicio + servidores | Enlace IPC + red | La más alta, sobre todo nombres propios | Gratis, pero el audio sale del teléfono |
| **Vosk** | **Dentro de la app** | Prácticamente inmediato: streaming continuo | Menor que Google | ~50 MB por idioma en el APK o descargados |
| **whisper.cpp** | Dentro de la app | Inmediato al grabar, pero transcribe **después** | Muy alta, especialmente con números | Modelo 75–500 MB; lento en gama media |
| **ML Kit GenAI Speech** | AICore / Gemini Nano | Por medir | Por medir | **Alpha en 2026**; sólo dispositivos con Gemini Nano |
| **Picovoice Cheetah** | Dentro de la app | Inmediato, streaming | Alta | **Licencia comercial** |

### El candidato concreto: `capacitor-offline-speech-recognition`

Existe y es alcanzable desde Capacitor hoy:

- **Paquete**: `capacitor-offline-speech-recognition@3.0.0`, peer `@capacitor/core >= 7`
- **Motor**: Vosk en **ambas** plataformas — Vosk Android SDK 0.3.70 e `libvosk.xcframework` en iOS
- **Idiomas**: 15+, con modelos descargados bajo demanda desde alphacephei.com
- **Peso**: ~50 MB por idioma, guardados en el directorio de documentos de la app
- **Nota**: en iOS reemplaza el framework Speech de Apple por Vosk

Es interesante por tres razones para este caso de uso: corre **dentro del proceso** (sin
ventana de enlace), es **el mismo motor en Android y iOS** (una sola calidad que validar en
vez de dos), y no depende de servicios de Google.

Contras honestos: es un paquete de autor único con poca tracción, Vosk rinde por debajo de
Google en benchmarks estándar, y hay que descargar y gestionar los modelos.

**Recomendación**: agregarlo como cuarta fila de la tabla comparativa. Es el único candidato
del mercado que ataca directamente el problema del arranque instantáneo sin microservicio.
Queda pendiente de integrar.

### Descartados para esta ronda

- **whisper.cpp** — no transcribe en vivo: graba y luego procesa. Para frases de 5 segundos
  el usuario esperaría a que termine. Sirve si más adelante se quiere máxima precisión en
  montos y se acepta esa espera.
- **Picovoice** — técnicamente sólido, pero licencia comercial. Fuera mientras haya
  opciones gratuitas que cumplan.
- **ML Kit GenAI Speech** — en alpha y limitado a dispositivos con Gemini Nano. Vale
  seguirlo de cerca, no construir sobre él todavía.

---

## Criterio de decisión

La configuración elegida tiene que cumplir, sobre las frases de nivel 1 y 2:

- **Monto correcto ≥ 95 %** — es el dato que no se puede equivocar.
- Comercio correcto ≥ 80 % — el usuario corrige lo que falte.
- Primer parcial < 1 s — para que la pantalla se sienta viva.
- Si **on-device** cumple el umbral de monto, gana aunque la red sea algo mejor: el audio
  de la gente diciendo en qué gasta no debería salir del teléfono si no hace falta.
