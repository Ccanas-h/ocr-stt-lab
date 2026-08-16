# Plan de pruebas en iOS

Cerrar el estudio: repetir en iPhone las mediciones de OCR y voz que ya están hechas en
Android, y dejar una versión instalable que un tercero pueda probar por su cuenta.

A diferencia de Android —donde bastó enchufar el cable— **iOS exige decisiones de cuenta y
de firma antes de poder instalar nada**. Este plan separa con claridad qué hago yo y qué
tiene que hacer una persona con un navegador, una tarjeta y el teléfono en la mano.

---

## Parte A — Qué tiene el Mac hoy

Verificado el 16 de agosto de 2026 sobre este equipo.

| Pieza | Estado | Comentario |
| --- | --- | --- |
| Xcode | ✅ **26.6** (17F113) | Al día. Incluye los SDK nuevos. |
| SDK de iOS | ✅ **iOS 26.5** | Permite compilar contra las APIs más recientes. |
| CocoaPods | ✅ **1.17.0** | Instalado por Homebrew. |
| Pods del proyecto | ✅ **instalados** | ML Kit, Vision y voz ya resueltos en `ios/App/Pods`. |
| Proyecto Xcode | ✅ **generado** | `cl.investigacion.ocrsttlab`, target mínimo iOS 16.0. |
| Permisos `Info.plist` | ✅ **completos** | Cámara, galería, micrófono y reconocimiento de voz, con textos en español. |
| Espacio en disco | ✅ **302 GB libres** | De sobra para runtimes de simulador. |
| **Runtime de simulador** | ❌ **ninguno instalado** | Xcode trae el SDK pero no la imagen del sistema. Son ~7–10 GB. |
| **Identidad de firma** | ❌ **`0 valid identities found`** | No hay ningún certificado de desarrollo en el llavero. |
| **Perfiles de aprovisionamiento** | ❌ **la carpeta no existe** | Nunca se ha firmado una app en este Mac. |
| **Cuenta Apple en Xcode** | ❌ **ninguna** | `IDEProvisioningTeams` no existe. |
| **Equipo de desarrollo** | ❌ **sin asignar** | `DEVELOPMENT_TEAM` vacío en el proyecto. |
| **iPhone conectado** | ❌ **ninguno** | `devicectl` no ve dispositivos. |
| `go-ios` / `ideviceinstaller` | ❌ **no instalados** | Necesarios para que yo controle el iPhone. |

**Resumen honesto**: la mitad de herramientas está lista y la mitad de identidad está en
cero. Compilar para simulador es cuestión de una descarga. Instalar en un iPhone real
requiere una cuenta Apple, y eso sólo lo puede hacer una persona.

---

## Parte B — Tres hallazgos antes de escribir una línea

Estos salieron de leer el código de los plugins y la configuración de los Pods. Los pongo
primero porque **cambian el plan**, no son detalles.

### B.1 — El simulador no sirve para comparar ML Kit

Los Pods de ML Kit se instalan con esta línea, puesta automáticamente por CocoaPods:

```
EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64
```

Es porque ML Kit se distribuye como *fat framework* con `x86_64 arm64`, donde ese `arm64` es
la porción de **dispositivo**, no de simulador. En un Mac con Apple Silicon el simulador
también es arm64, así que las porciones chocan y CocoaPods resuelve excluyendo.

Consecuencia: en este Mac, **el simulador tendría que correr en x86_64 bajo Rosetta** para
enlazar ML Kit, cosa que Xcode 26 ya prácticamente no soporta.

> **El simulador queda para verificar que la app arranca y que Apple Vision responde. La
> comparación real es en el iPhone físico, sin alternativa.**

Esto también significa que si en la app final ML Kit terminara siendo el motor de iOS, todo
el equipo de desarrollo perdería el simulador para esa pantalla. Es un costo a considerar
al elegir, no sólo precisión y velocidad.

### B.2 — El plugin de Apple Vision no declara el idioma

`@jcesarmobile/capacitor-ocr` llama a `RecognizeTextRequest` (iOS 18+) o `VNRecognizeTextRequest`
sin tocar **ninguna** opción:

```swift
let request = RecognizeTextRequest()
textObservations = try await request.perform(on: imageData)
```

No fija `recognitionLanguages`, ni `recognitionLevel`, ni `usesLanguageCorrection`. Vision
por defecto reconoce **en inglés**. Sobre una boleta chilena eso ataca justo lo que importa:
tildes, la `ñ`, y la corrección lingüística tirando hacia palabras inglesas.

> Es exactamente el mismo tipo de hallazgo que en Android: **el plugin no expone la opción
> que decide el resultado.** Hay que parcharlo, igual que se parchó el de voz.

Medir Vision sin este parche daría un número falsamente malo, y ese número decidiría mal.

### B.3 — En iOS por debajo de 26 este plugin no tiene modo offline

`@capgo/capacitor-speech-recognition` tiene dos caminos en iOS:

| Camino | Cuándo | Dónde procesa |
| --- | --- | --- |
| `SFSpeechRecognizer` (por defecto) | siempre | **servidores de Apple** |
| `SpeechAnalyzer` / `SpeechTranscriber` | sólo iOS 26+, con `useOnDeviceRecognition: true` | **el teléfono** |

Apple ofrece desde iOS 13 la propiedad `requiresOnDeviceRecognition` para forzar a
`SFSpeechRecognizer` a trabajar local. **El plugin nunca la asigna** — lo verifiqué en el
Swift, la palabra no aparece.

Consecuencia: en un iPhone con iOS 18 o 25, este plugin **siempre manda el audio a Apple**,
sin manera de evitarlo desde JavaScript. Otro parche.

### Y un hallazgo a favor: `contextualStrings`

Apple permite sesgar el reconocimiento hacia términos propios de la app, y el plugin **sí**
lo expone. Android no tiene equivalente.

```ts
contextualStrings: ['Falabella', 'Jumbo', 'Líder', 'Unimarc', 'Copec', 'lucas']
```

Es candidato directo a arreglar el fallo que se midió en el S25 (`cinco lucas` → `5 Lucas`).
**Hay que medir si funciona**: si Apple resuelve por API lo que en Android hubo que resolver
con una tabla de jerga, es un punto fuerte real y no una opinión.

---

## Parte C — Qué se va a comparar

### OCR — imagen a texto

| Candidato | Motor real | Notas |
| --- | --- | --- |
| `@jcesarmobile/capacitor-ocr` | **Apple Vision** | Único con Vision. Entrega confianza por línea. Requiere el parche B.2. |
| `@capacitor-mlkit/text-recognition` | **ML Kit iOS** | El mismo motor que ganó en Android. Permite ver si empata o pierde contra Vision. |
| `@pantrist/...ml-kit-text-recognition` | ML Kit iOS | Ya está en el Podfile; corre gratis. |
| `tesseract.js` | WASM | Ya sabemos que colapsa con fotos reales. Se corre para confirmar que iOS no lo cambia. |

Las mismas 4 imágenes reales del corpus, el mismo cálculo de campos clave. Así los números
de iOS son directamente comparables con los del S20+ y el S25 que ya están en la bitácora.

### Voz — voz a texto

| Candidato | API de Apple | Red / local | Disponible en |
| --- | --- | --- | --- |
| Apple en red | `SFSpeechRecognizer` | **red** | iOS 13+ |
| Apple local | `SFSpeechRecognizer` + `requiresOnDeviceRecognition` | **local** | iOS 13+ · **necesita parche B.3** |
| Apple SpeechAnalyzer | `SpeechAnalyzer` + `SpeechTranscriber` | **local** | iOS 26+ · **por verificar en el equipo** |
| Apple con sesgo | cualquiera + `contextualStrings` | — | mide si la jerga se resuelve por API |
| Web Speech en WKWebView | `webkitSpeechRecognition` | red | probablemente no exista dentro de la app; se comprueba |

Se dicta el mismo banco de frases con el mismo método acústico, incluida la batería de
montos donde Android sacó 8 de 9.

### La pregunta abierta que este laboratorio va a responder

`SpeechAnalyzer` es lo más cercano a «algo instantáneo que vive dentro del teléfono» que
apareció en toda la investigación. Pero **no está documentado con claridad si funciona en
equipos sin Apple Intelligence**, y un iPhone 12 (A14) o 13 (A15) no la tiene.

> Si `SpeechAnalyzer` corre en un iPhone 12/13, es el mejor candidato de todo el estudio.
> Si exige iPhone 15 Pro o superior, queda descartado para el público real de la app.
>
> **Medirlo en el teléfono responde algo que hoy no está publicado en ninguna parte.**

---

## Parte D — Paso a paso para ti

### Paso 0 · Dime dos datos (5 minutos, y bloquea todo lo demás)

En el iPhone: **Ajustes → General → Información**.

- **Nombre del modelo** — «iPhone 12», «iPhone 13 Pro», el que sea
- **Versión del software** — el número exacto de iOS

Por qué es lo primero: la versión de iOS decide qué se puede medir.

| Si el iPhone tiene | Se puede probar |
| --- | --- |
| iOS 26 o superior | **Todo**, incluido `SpeechAnalyzer`, que es el candidato más prometedor |
| iOS 18 a 25 | Vision moderno y `SFSpeechRecognizer` local, pero no `SpeechAnalyzer` |
| iOS 16 o 17 | Vision antiguo. El estudio queda incompleto en la parte más interesante |

Si está por debajo de 26 y el modelo lo permite, **conviene actualizar antes de empezar**.
Un iPhone 12 o 13 sí soporta iOS 26.

### Paso 1 · Crea (o confirma) tu Apple ID de desarrollador — gratis

No hace falta pagar todavía. Con un Apple ID normal ya se puede instalar en **tu propio**
iPhone.

1. Abre **Xcode → Settings → Accounts** (`⌘ ,`)
2. Botón **+** → **Apple ID** → entra con tu Apple ID de siempre
3. Debe aparecer un equipo llamado **«Cristóbal Cañas (Personal Team)»**

Cuando esté, avísame: yo asigno el equipo al proyecto y compilo.

**Los límites de la cuenta gratis, para que no te sorprendan:**

| Límite | Detalle |
| --- | --- |
| **La app expira a los 7 días** | Deja de abrir y hay que reinstalarla desde el Mac. |
| Máximo 3 apps a la vez | Nuestra app y la herramienta de automatización ya son 2. |
| Sólo por cable | No hay forma de mandársela a nadie. |
| Sin TestFlight | Bloqueado para cuentas gratuitas. |

Alcanza perfectamente para medir. **No alcanza para tu amigo.** Eso es el Paso 5.

### Paso 2 · Conecta el iPhone al Mac por cable

Cable USB, y en el teléfono toca **«Confiar en este computador»** e ingresa el código.

Importante: **cable de datos**, no uno sólo de carga. Si `devicectl` no lo ve, suele ser eso.

### Paso 3 · Activa el Modo Desarrollador en el iPhone

En iOS 16+ es obligatorio y tiene un orden que confunde a todo el mundo:

1. Yo intento instalar la app una primera vez — **va a fallar**, es lo esperado
2. Recién ahí aparece **Ajustes → Privacidad y seguridad → Modo de desarrollador**
3. Actívalo → el teléfono **se reinicia**
4. Al desbloquear, confirma **«Activar»**

> Si buscas la opción antes de que yo intente instalar, **no existe**. No es un error tuyo.

### Paso 4 · Autoriza el certificado en el teléfono

Con cuenta gratuita, la primera vez el iPhone desconfía de la firma:

**Ajustes → General → VPN y gestión de dispositivos → tu Apple ID → Confiar**

A partir de ahí la app abre. Y a partir de ahí puedo empezar a medir.

### Paso 5 · Decidir: el Programa de Desarrolladores de Apple

Para mandarle la app a tu amigo **no hay camino gratis**. Apple lo cerró a propósito.

**Costo: 99 USD al año** (~95.000 pesos), en https://developer.apple.com/programs/

Qué desbloquea:

| | Cuenta gratis | Programa pagado |
| --- | --- | --- |
| Instalar en tu iPhone | ✅ por cable | ✅ por cable |
| **Duración de la instalación** | **7 días** | **1 año** |
| **Enviar a un amigo** | ❌ imposible | ✅ **TestFlight** |
| Testers | — | 100 internos / 10.000 externos |
| Mi automatización del iPhone | se rompe cada 7 días | estable |

Trámite: se paga con tarjeta, Apple pide verificar identidad y **la aprobación tarda entre
unas horas y 2 días**. Si vas a pagarlo, conviene iniciarlo temprano y seguir midiendo con
la cuenta gratis mientras tanto.

Con el programa activo, el flujo hacia tu amigo es:

1. Registro la app en App Store Connect con el bundle ID `cl.investigacion.ocrsttlab`
2. Subo el build firmado
3. Tú agregas el Apple ID de tu amigo como **tester interno**
4. Él instala **TestFlight** desde la App Store y le llega la invitación por correo
5. Actualizaciones posteriores le llegan solas

Los testers internos **no pasan revisión de Apple**: el build queda disponible en minutos.

> **Bonus que vale más de lo que parece**: todas las transcripciones que existen hoy las
> generé con voz sintética y acento no chileno. Tu amigo dictando de verdad es el primer
> dato con voz humana chilena del estudio. Vale la pena mandarle también las frases del
> banco para que dicte las mismas.

### Paso 6 · Que yo pueda manejar el iPhone como manejo el Android

En Android bastó `adb`. En iOS Apple no da nada equivalente, así que se arma con dos piezas:

```bash
npm install -g go-ios          # el "adb" de iOS, no oficial
sudo ios tunnel start          # túnel, obligatorio desde iOS 17
```

Y hay que instalar **WebDriverAgent** en el teléfono: una app de Apple/Appium que expone el
control remoto. Se compila desde Xcode y **se firma con la misma cuenta** — por eso cuenta
como una de las 3 apps del límite gratuito, y por eso también expira a los 7 días.

Ese `sudo` es tuyo: yo no puedo escribir tu contraseña.

**Lo que sí funciona igual que en Android**: el método acústico. El Mac reproduce la frase
por los parlantes y el iPhone la escucha con su micrófono. La metodología de medición no
cambia, así que los resultados son comparables.

**Si el Paso 6 se complica**, hay un plan B: mido lo que pueda por simulador (sólo Vision,
por B.1) y el resto lo dictas tú directamente en el teléfono, que ya tiene pantalla de
registro de tomas y exportación a Markdown. Más lento, pero no bloquea el estudio.

---

## Parte E — Qué hago yo, en orden

| # | Tarea | Depende de |
| --- | --- | --- |
| 1 | Descargar el runtime de simulador iOS | nada |
| 2 | Compilar para simulador y verificar que la app levanta | 1 |
| 3 | Confirmar en la práctica si ML Kit enlaza en simulador (hallazgo B.1) | 2 |
| 4 | Parchar Vision para declarar español y exponer nivel de reconocimiento (B.2) | nada |
| 5 | Parchar el plugin de voz para `requiresOnDeviceRecognition` (B.3) | nada |
| 6 | Escribir los adaptadores `OcrEngine`/`SttEngine` de los candidatos iOS | 4, 5 |
| 7 | Asignar el equipo de firma y compilar para dispositivo | **Paso 1 tuyo** |
| 8 | Instalar en el iPhone | **Pasos 2–4 tuyos** |
| 9 | Correr el corpus de OCR y comparar con S20+ / S25 | 8 |
| 10 | Correr el banco de frases y la batería de montos | 8 |
| 11 | Medir la ventana de arranque del micrófono en iOS y comparar con los 190/125 ms de Android | 8 |
| 12 | Verificar si `SpeechAnalyzer` existe en ese equipo | 8 |
| 13 | Medir si `contextualStrings` arregla «cinco lucas» | 8 |
| 14 | Informe de iOS + tabla final de las dos plataformas | 9–13 |
| 15 | Build de TestFlight para tu amigo | **Paso 5 tuyo** |

Los puntos **1 a 6 no dependen de ti**: los puedo hacer ahora mismo, en paralelo a que
resuelvas la cuenta.

---

## Parte F — Lo que este plan va a agregar a la guía

Cada medición de arriba está pensada para dejar una lección implementable, no sólo un
número. Lo previsible:

- Si el simulador no soporta ML Kit, eso **decide arquitectura**: un equipo que pierde el
  simulador en la pantalla principal paga ese costo todos los días.
- Si Vision necesita que le declaren el idioma, es otro caso de **el plugin no expone lo que
  decide el resultado** — ya van tres, y eso deja de ser casualidad: pasa a ser un criterio
  de selección de plugins.
- Si `contextualStrings` resuelve la jerga, la app necesita **dos estrategias distintas** por
  plataforma para el mismo problema, detrás de la misma interfaz.
- Si `SpeechAnalyzer` corre en equipos sin Apple Intelligence, cambia la recomendación
  completa de iOS.

---

## Estado

- [ ] Paso 0 — modelo y versión de iOS
- [ ] Paso 1 — Apple ID en Xcode
- [ ] Paso 2 — iPhone por cable
- [ ] Paso 3 — Modo Desarrollador
- [ ] Paso 4 — confiar en el certificado
- [ ] Paso 5 — decisión sobre el programa pagado
- [ ] Paso 6 — go-ios + WebDriverAgent
