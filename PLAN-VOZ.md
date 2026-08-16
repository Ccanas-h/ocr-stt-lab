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
| **Dictado guiado** | S20+ real | Rendimiento real: micrófono del teléfono, acento chileno, ruido de la pieza | No — hay que repetir varias veces y promediar |
| **Audio sintético** | Emulador | Diferencias entre motores con entrada idéntica, sin la variable humana | Sí |

Para el segundo, macOS genera el audio con `say` y voces en español (Mónica es_ES,
Paulina es_MX). No hay voz chilena, pero para comparar motores entre sí da lo mismo:
lo que importa es que la entrada sea **la misma** para todos.

> **Requisito pendiente para el camino reproducible:** el emulador toma el micrófono
> por defecto del Mac. Para meterle el audio limpio hace falta un dispositivo de loopback
> (`brew install blackhole-2ch`), que hoy **no está instalado**. Sin él, el plan B es
> reproducir por parlantes y dejar que el micrófono del Mac lo capte — funciona, pero
> agrega acústica de la sala. Decisión del usuario si vale instalarlo.

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

## Lo que sí sería un motor distinto (fase posterior)

Si Google on-device no alcanza, las alternativas reales exigen plugin nativo propio:

| Motor | Ventaja | Costo |
| --- | --- | --- |
| **Vosk** | Offline de verdad, modelos pequeños (~50 MB), español disponible | No hay plugin Capacitor mantenido; hay que escribirlo |
| **whisper.cpp** | Precisión muy alta, especialmente con números | Modelo de 75–500 MB, lento en gama media, plugin propio |

Ambos quedan fuera de esta ronda: primero hay que saber si lo que ya trae el sistema
alcanza. Si alcanza, no se justifica cargar la app con un modelo propio.

---

## Criterio de decisión

La configuración elegida tiene que cumplir, sobre las frases de nivel 1 y 2:

- **Monto correcto ≥ 95 %** — es el dato que no se puede equivocar.
- Comercio correcto ≥ 80 % — el usuario corrige lo que falte.
- Primer parcial < 1 s — para que la pantalla se sienta viva.
- Si **on-device** cumple el umbral de monto, gana aunque la red sea algo mejor: el audio
  de la gente diciendo en qué gasta no debería salir del teléfono si no hace falta.
