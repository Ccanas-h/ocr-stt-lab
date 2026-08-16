# Guía de implementación

Lo que hay que saber **antes** de escribir la app real, aprendido midiendo en dispositivos
de verdad. Este documento no compara librerías —eso está en [BITACORA.md](BITACORA.md)—
sino que recoge cómo implementarlas bien.

Cada punto está aquí porque costó descubrirlo.

---

## 1. Los plugins mienten sobre lo que hay debajo

Tres plugins distintos de OCR resultaron ser **el mismo ML Kit** en Android. Tres
configuraciones de voz terminan en **la misma API del sistema**. Elegir «otra librería» no
cambia el motor.

**Cómo verificarlo antes de invertir tiempo**: abrir el `build.gradle` del plugin y mirar
qué dependencia nativa declara. Si dos plugins declaran `com.google.mlkit:text-recognition`,
van a dar resultados idénticos y la comparación de precisión entre ellos es humo.

Lo que sí cambia entre plugins:

- **Qué API del motor exponen.** ML Kit calcula confianza por línea; sólo uno de los tres
  plugins la entrega. Ese detalle decide si la app puede detectar una captura mala.
- **La calidad del wrapper.** Ver el punto 7.
- **La plataforma cruzada.** Un plugin puede usar ML Kit en Android y Apple Vision en iOS.

## 2. La precisión no mejora con mejor hardware

Las 16 celdas de precisión de OCR fueron **idénticas** entre un Galaxy S20+ (2020) y un
S25 (2025). El modelo es el mismo binario; la NPU sólo acelera (~2.3×).

**Implicación**: si la precisión no alcanza, no sirve esperar a que el parque de
dispositivos se renueve. Hay que mejorar **la entrada** (preprocesar la imagen, guiar la
captura) o cambiar de enfoque, no de teléfono.

También al revés, y es buena noticia: un teléfono de 2020 procesa una boleta en 140–444 ms.
**No hace falta excluir equipos antiguos.**

## 3. Medir con el caso feliz lleva a la decisión equivocada

Con una imagen sintética limpia, Tesseract ganaba con 98.4 %. Con fotos reales de boletas
cae a 36.6 % y en un caso no recupera **ni un campo**.

**Regla**: el corpus de prueba tiene que parecerse al peor caso que va a llegar, no al
mejor. Fotos con sombra, papel arrugado, ángulo, letra chica de impresora térmica.

## 4. Comparar texto completo castiga al motor equivocado

ML Kit agrupa por bloques visuales. En una boleta con columnas (`descripción … monto`)
reordena respecto a la lectura por renglón, y el CER lo castiga aunque **no haya leído mal
ni una letra**.

**Qué medir en su lugar**: los datos que la app necesita extraer. RUT, folio, total, fecha.
Si están, el motor sirve, sin importar el orden.

```
CER de ML Kit sobre boleta con columnas:  20.3 %  ← parece malo
Campos clave recuperados:                 4/6     ← lo que realmente importa
```

## 5. Los números son el punto débil de los dos mundos

En OCR, lo que se pierde son las secuencias largas de dígitos sin contexto: folios de
14 cifras, códigos de autorización. Las palabras se recuperan bien.

En voz, el problema es distinto pero igual de caro: **el formato es inconsistente**. Medido
en el S25, Google devolvió el mismo tipo de dato de cinco formas distintas:

| Se dictó | Google devolvió |
| --- | --- |
| cinco mil | `5000` |
| cuarenta y cinco mil novecientos noventa | `45 990` |
| doce mil quinientos | `12 500` |
| siete mil doscientos treinta y cuatro | `7234` |
| un millón doscientos cincuenta mil | `$1250 000` |

Comparado como texto crudo, `45 990` **no** es `45990`. Una capa de normalización no es
opcional: es la que convierte «casi correcto» en «correcto».

**Para OCR**: validar con dígito verificador donde exista (el RUT chileno lo tiene), buscar
el número *cerca de su etiqueta* usando los `boundingBox` en vez de en el texto corrido, y
dejar que el usuario corrija los campos numéricos.

## 6. La jerga local rompe la extracción, y en silencio

`cinco lucas` se transcribió como **`5 Lucas`** —con mayúscula, como si fuera el nombre—.
El monto extraído fue **5** en vez de 5000. Un error de mil veces, en la frase más
cotidiana que puede decir un usuario chileno.

Y lo peor: la similitud de texto daba **100 %**. El texto estaba «bien»; el monto estaba
mil veces mal.

> **Por eso el monto se mide aparte de la similitud.** Un texto perfecto puede dar un
> número catastrófico.

Tabla mínima para Chile, ya implementada en
[`spanish-numbers.ts`](src/app/core/text/spanish-numbers.ts):

| Jerga | Valor | Riesgo si se ignora |
| --- | --- | --- |
| luca / lucas | 1.000 | ×1.000 |
| gamba / gambas | 100 | ×100 |
| palo / palos | 1.000.000 | ×1.000.000 |

## 7. Punto y coma no son lo mismo, y confundirlos cuesta 100×

Convención chilena: el **punto** separa miles, la **coma** separa decimales. Una
normalización que quite toda la puntuación convierte `3.500,50` en `350050`.

Fue un bug real en este laboratorio, encontrado sólo porque se probó explícitamente un caso
con coma. **Aunque el peso chileno no use centavos, hay que probarlo**: el día que alguien
lo diga, el error es de dos órdenes de magnitud.

## 8. Hay una ventana en la que el micrófono no escucha

Android distingue dos momentos:

| Momento | Qué significa |
| --- | --- |
| `startListening()` retorna | Se **pidió** arrancar. El micrófono todavía no captura. |
| `onReadyForSpeech()` | Ya está capturando. **Recién aquí** se puede hablar. |

Medido en el S25 con el reconocedor local:

- **Primer arranque (frío): 190 ms**
- **Arranques siguientes: 123–131 ms**

Son cifras cómodas: la diferencia entre frío y caliente es de ~60 ms, así que **no hace
falta precalentar** ni poner una pantalla de espera. Basta con **no mentir en la interfaz**:
mostrar «habla ahora» cuando llega `onReadyForSpeech`, no cuando se toca el botón.

```ts
// Mal: el usuario empieza a hablar y pierde la primera palabra
await SpeechRecognition.start(opts);
mostrarIndicador('Escuchando…');

// Bien: el indicador aparece cuando el micrófono ya captura
SpeechRecognition.addListener('readyForSpeech', () => mostrarIndicador('Habla ahora'));
await SpeechRecognition.start(opts);
```

Ojo: **el plugin no expone ese evento**; hubo que parcharlo. Al elegir plugin, revisar que
propague `onReadyForSpeech`.

## 9. El modelo local puede faltar, y el sistema no avisa

Si se pide reconocimiento local sin el modelo del idioma descargado, **Android cae a red en
silencio**. La app parecería funcionar sin conexión durante todo el desarrollo y fallaría
el día que el usuario esté sin señal.

**Siempre consultar el estado antes**, y con el idioma que se va a usar de verdad:

```ts
const { available } = await SpeechRecognition.isOnDeviceRecognitionAvailable({ language });
```

Y la descarga se pide **desde la app**, no mandando al usuario a Ajustes:

```ts
await SpeechRecognition.downloadOnDeviceModel({ language });  // triggerModelDownload()
```

## 10. `es-CL` no existe como modelo local. Usar `es-US` o `es-ES`.

Google publica los modelos on-device por variante regional, y el español de Chile no está
entre ellos. Consultando el S20+ y el S25:

| Idioma | Modelo local |
| --- | --- |
| `es-CL` | **missing** — no existe |
| `es-US` | **installed** — ya venía en ambos teléfonos |

Un chequeo con `es-CL` fijo concluye «este dispositivo no soporta reconocimiento local»,
lo cual es falso. **Declarar `es-US`.**

## 11. Verificar el nivel de API de cada clase que se toca

`ModelDownloadListener` es **API 34**. El reconocimiento local existe desde **API 31**. Un
plugin que use la primera sin guardia rompe en todos los Android 12 y 13 — justo los que sí
soportan la función.

```java
if (Build.VERSION.SDK_INT >= 34) {
    recognizer.triggerModelDownload(intent, executor, listener);  // con progreso
} else {
    recognizer.triggerModelDownload(intent);                      // API 33, sin callback
}
```

Y no basta con `try/catch`: una clase ausente revienta al **cargar** el plugin, antes de que
cualquier `catch` pueda actuar.

## 12. `SpeechRecognizer` exige el hilo principal

Capacitor ejecuta los `@PluginMethod` en un hilo de fondo. Llamar a
`createOnDeviceSpeechRecognizer()` desde ahí lanza `RuntimeException` y **cierra la app** —
no es atrapable desde JavaScript.

```java
@PluginMethod
public void loQueSea(PluginCall call) {
    bridge.getActivity().runOnUiThread(() -> hacerloDeVerdad(call));
}
```

## 13. Diseñar contra una interfaz propia, no contra el plugin

Todo el laboratorio consume `OcrEngine` y `SttEngine`, no los plugins directamente. Eso
permitió cambiar de plugin, agregar configuraciones y parchar bugs **sin tocar la pantalla
ni una vez**.

Para la app real, el mismo patrón resuelve el objetivo declarado: cuando la medición diga
«Vision gana en iOS, ML Kit en Android», eso se implementa como un motor más que enruta por
plataforma. La app sigue llamando al mismo método.

```ts
async recognize(image: LabImage, options: OcrOptions): Promise<OcrOutput> {
  return Capacitor.getPlatform() === 'ios'
    ? this.vision.recognize(image, options)
    : this.mlkit.recognize(image, options);
}
```

## 14. Cómo probar voz sin que nadie hable

`SpeechRecognizer` abre el micrófono él mismo: no acepta audio inyectado. Pero se puede
reproducir audio sintético por los parlantes del computador mientras el teléfono escucha:

```bash
say -v Paulina -r 150 -o frase.aiff "Gasté cinco mil pesos"
adb -s <serial> shell input tap <x> <y>   # inicia la escucha
sleep 1.0                                  # el reconocedor necesita despertar
afplay frase.aiff
```

El `sleep` y el hecho de que todo vaya en **un solo comando** son lo que hace que funcione:
separar el toque del audio en llamadas distintas deja que el reconocedor se cierre por
silencio antes de que suene nada.

Límites que hay que declarar al leer los resultados: voz sintética y no chilena, acústica
de sala, y las primeras palabras se pierden si el audio empieza antes de tiempo. Sirve para
**comparar configuraciones entre sí**, no para afirmar precisión con usuarios reales.

---

## Checklist para la app real

- [ ] Consultar el estado del modelo local **con el idioma real** antes de ofrecer modo offline
- [ ] Pedir la descarga del modelo desde la app, con Ajustes sólo como rescate
- [ ] Mostrar «habla ahora» en `onReadyForSpeech`, no al tocar el botón
- [ ] Normalizar números: separadores, decimales y jerga local
- [ ] Medir el monto aparte del texto — un texto perfecto puede dar un monto 1000× errado
- [ ] Validar el RUT con dígito verificador y los totales contra neto + IVA
- [ ] Usar la confianza del motor para pedir otra foto en vez de aceptar texto malo
- [ ] Consumir una interfaz propia, no el plugin directamente
