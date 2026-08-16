# Bitácora de mediciones

Registro de corridas para llegar a la decisión final.

Anotar siempre el **dispositivo real**, no sólo la plataforma: un emulador, un S20 y un S25
no son comparables entre sí.

---

## Corrida 2 — mismas muestras · Galaxy S25 (SM-S931B, Android 15, Snapdragon 8 Elite)

Misma batería, mismas imágenes, mismo build. La pregunta era si hardware más nuevo mejora
la extracción.

### Campos clave recuperados

| Muestra | Tesseract 5 | Vision/ML Kit | ML Kit (embebido) | ML Kit (Play Services) |
| --- | --- | --- | --- | --- |
| Cencosud (media) | 5/6 · 83.3 % | 4/6 · 66.7 % | 4/6 · 66.7 % | 4/6 · 66.7 % |
| Líder (alta) | 3/7 · 42.9 % | 6/7 · 85.7 % | 6/7 · 85.7 % | 6/7 · 85.7 % |
| Bolsa (muy alta) | 0/4 · 0 % | 4/4 · 100 % | 4/4 · 100 % | 4/4 · 100 % |
| Hoja datos (baja) | 1/5 · 20 % | 4/5 · 80 % | 4/5 · 80 % | 4/5 · 80 % |
| **Promedio** | **36.6 %** | **83.1 %** | **83.1 %** | **83.1 %** |

### Tiempo (mediana, ms) — S20+ → S25

| Muestra | Tesseract | Vision/ML Kit | ML Kit (embebido) | ML Kit (Play Serv.) |
| --- | --- | --- | --- | --- |
| Cencosud | 3103 → **1261** | 312 → **140** | 444 → **161** | 332 → **176** |
| Líder | 3369 → **1355** | 358 → **201** | 424 → **223** | 398 → **215** |
| Bolsa | 3785 → **1570** | 140 → **61** | 175 → **57** | 149 → **70** |
| Hoja datos | 887 → **377** | 168 → **60** | 163 → **60** | 171 → **68** |
| **Mejora** | ~2.4× | ~2.3× | ~2.6× | ~2.1× |

---

## Lectura de la corrida 2 — la respuesta importa

### El hardware nuevo NO mejora la precisión. Ni un punto.

**Las 16 celdas de precisión son idénticas entre el S20+ y el S25.** No una diferencia
pequeña: exactamente los mismos 4/6, 6/7, 4/4, 4/5, y los mismos porcentajes de similitud.

Tiene sentido y conviene entenderlo bien: el modelo de ML Kit es **el mismo binario** en
ambos teléfonos. Dado el mismo archivo de entrada, produce la misma salida. La NPU del
Snapdragon 8 Elite acelera la inferencia; no la cambia.

**Consecuencia directa para el producto: el techo de precisión de ML Kit sobre estas
imágenes es ~83 %, y no se sube comprando teléfonos mejores ni esperando a que el parque
de dispositivos se renueve.** Para subirlo hay que cambiar de palanca.

### Lo que sí mejora, y bastante, es la velocidad: ~2.3×

De 312 a 140 ms en la boleta Cencosud. En términos de experiencia de usuario ambos son
instantáneos, así que **la velocidad no debería pesar en la decisión** — salvo que se
quiera procesar en vivo desde la cámara, donde 60 ms contra 170 ms sí cambia si alcanzas
los 15 fps.

Nota para el S20+: incluso ahí ML Kit está entre 140 y 444 ms. Un teléfono de 2020 ya es
suficientemente rápido. **No hay que dejar fuera a los usuarios con equipos antiguos.**

---

## Hallazgo aparte: sí hay señal de confianza, y sólo un plugin la entrega

Verificado en el código de ML Kit (`Text$Line`) y confirmado en dispositivo:

```
public float getConfidence();   // com.google.mlkit.vision.text.Text$Line
public float getAngle();
```

ML Kit v2 **sí calcula confianza por línea en Android**. De los cuatro plugins, sólo
**`@jcesarmobile/capacitor-ocr` la expone** — en la hoja de datos bancarios reportó
**79.6 % de confianza** para un resultado que tenía 97.5 % de similitud real.

Esto es directamente relevante para el requisito de "las fallas cuestan": es la única de
las cuatro librerías que permite que la app diga *"esta foto no me convence, sácala de
nuevo"* en vez de devolver texto malo en silencio. Y lo hace en **ambas plataformas**
(en iOS viene de `VNRecognizedText.confidence`, de Vision).

Ojo: la confianza es **conservadora** (79.6 % declarado para 97.5 % real). No sirve como
estimación de precisión, sí como **señal de alarma relativa**. Hay que calibrar el umbral
midiendo confianza contra precisión real sobre muchas muestras — está en pendientes.

---

## Corrida 1 — boletas reales · Galaxy S20+ (SM-G985F, Android 13)

**Ésta es la corrida que importa.** Cuatro fotos reales tomadas con celular, batería
completa en una sola sesión: 4 muestras × 4 motores × 3 pasadas.

| Muestra | Dificultad | Condiciones |
| --- | --- | --- |
| Boleta Cencosud | media | Papel térmico arrugado sobre mesa, foto en ángulo, sombras, pliegues que cortan renglones |
| Boleta Líder | alta | Boleta larga sostenida a mano sobre jeans, papel curvado, sombra del pulgar, reverso traspasándose |
| Bolsa de delivery | muy alta | No es documento: bolsa plegada, texto blanco sobre rojo, en perspectiva, fondo de follaje |
| Hoja con datos bancarios | baja | Impresión láser sobre hoja blanca, tipografía grande, rotación leve |

### Campos clave recuperados — la métrica que decide

| Muestra | Tesseract 5 | Vision/ML Kit | ML Kit (Play Services) | ML Kit (embebido) |
| --- | --- | --- | --- | --- |
| Cencosud (media) | **5/6** · 83.3 % | 4/6 · 66.7 % | 4/6 · 66.7 % | 4/6 · 66.7 % |
| Líder (alta) | 3/7 · 42.9 % | **6/7** · 85.7 % | **6/7** · 85.7 % | **6/7** · 85.7 % |
| Bolsa (muy alta) | 0/4 · 0 % | **4/4** · 100 % | **4/4** · 100 % | **4/4** · 100 % |
| Hoja datos (baja) | 1/5 · 20 % | **4/5** · 80 % | **4/5** · 80 % | **4/5** · 80 % |
| **Promedio** | **36.6 %** | **83.1 %** | **83.1 %** | **83.1 %** |

### Tiempo (mediana de 3 pasadas, ms)

| Muestra | Tesseract 5 | Vision/ML Kit | ML Kit (Play Services) | ML Kit (embebido) |
| --- | --- | --- | --- | --- |
| Cencosud | 3103 | **312** | 332 | 444 |
| Líder | 3369 | **358** | 398 | 424 |
| Bolsa | 3785 | **140** | 149 | 175 |
| Hoja datos | 887 | 168 | 171 | **163** |

---

## Lectura de la corrida 1

### 1. Tesseract se cae con fotos reales. El hallazgo anterior era un espejismo.

En la imagen sintética limpia Tesseract ganaba con 98.4 %. Con boletas fotografiadas baja a
**36.6 % promedio**, y en la bolsa de delivery no recupera **ni un solo campo**. ML Kit
promedia 83.1 %.

Tesseract fue entrenado para documentos escaneados: texto negro sobre blanco, plano,
alineado. Nada de eso se cumple en una foto de celular. ML Kit fue entrenado justamente
con fotos.

**Conclusión práctica: Tesseract queda descartado como candidato de producción.** Se
mantiene en el laboratorio como control —es útil saber cuánto de la dificultad viene de la
imagen y cuánto del motor— pero no compite.

> Esto invalida la impresión que dejó la primera corrida sintética. Vale la pena dejarlo
> escrito: **medir con el caso feliz lleva a la decisión equivocada.**

### 2. Es ~10× más lento, además

Tesseract tarda entre 887 y 3785 ms; ML Kit entre 140 y 444 ms. En una app donde el usuario
fotografía una boleta y espera el resultado, 3,4 segundos contra 0,36 no es un detalle.

### 3. Los tres plugins de ML Kit dan resultados idénticos en Android

66.7 / 85.7 / 100 / 80 en los tres, sin una sola diferencia. Confirmado: **en Android son
el mismo motor**. La elección entre ellos no se juega en precisión sino en:

- **Peso del binario** — el embebido mete los 5 modelos de escritura en el APK; el de Play
  Services no.
- **Latencia** — el de Play Services fue consistentemente más rápido que el embebido
  (332 vs 444 ms en Cencosud), probablemente porque Play Services ya tiene el modelo
  residente en memoria compartida.
- **Dependencia** — el embebido funciona sin Play Services; el otro no.
- **Cobertura de escrituras** — sólo el embebido soporta chino, japonés, coreano y devanagari.

La diferencia real de calidad entre estos plugins **sólo puede aparecer en iOS**, donde
`vision-mlkit` cambia a Apple Vision. Sigue pendiente.

### 4. Ninguno llega al 100 % en boletas térmicas

Ni el mejor motor recupera todos los campos clave de las boletas. Los que se pierden son
sistemáticamente los **numéricos largos sin contexto**: códigos de autorización, folios de
14 dígitos. El texto con forma de palabra se recupera bien; las secuencias de dígitos, no.

**Implicación de diseño para la app real**: no confiar en el OCR crudo para los códigos.
Conviene (a) validar con dígito verificador donde exista —el RUT chileno lo tiene—,
(b) usar los `boundingBox` para buscar el número *cerca de* su etiqueta en vez de en el
texto corrido, y (c) dejar que el usuario corrija los campos numéricos.

### 5. La bolsa de delivery salió mejor que las boletas

Contraintuitivo: la muestra marcada "muy alta" dificultad dio 100 % y la más rápida
(140 ms). El texto era grande, de alto contraste y en tipografía moderna. Las boletas
térmicas, aunque planas, usan matriz de puntos degradada y letra chica.

**Lo difícil para el OCR no es lo que a nosotros nos parece difícil.** La superficie curva
y el fondo cargado importaron menos que el tamaño y el contraste del texto.

---

## Corrida 0 — verificación del banco (emulador, imagen sintética)

Conservada sólo como referencia histórica y como contraejemplo. **No usar para decidir.**

- Emulador Pixel 10 Pro XL, Android 17 · imagen sintética 1000×1400, sin degradar

| Motor | Mediana | Similitud |
| --- | --- | --- |
| Tesseract 5 | 325 ms | 98.4 % |
| Vision/ML Kit | 148 ms | 79.7 % |
| ML Kit embebido | 273 ms (403 en frío) | 79.7 % |
| ML Kit Play Services | 298 ms | 79.7 % |

El 20.3 % de error de ML Kit acá **no era leer mal**: era orden de lectura en layout de dos
columnas. Fue precisamente ese hallazgo el que motivó agregar la métrica de campos clave,
que no castiga el reordenamiento.

---

## Dónde está el techo, y cómo subirlo

Con dos dispositivos medidos y precisión idéntica entre ellos, el diagnóstico es claro:
**el limitante no es el motor ni el hardware, es la imagen que entra.** Las palancas que
quedan, en orden de retorno esperado:

1. **Preprocesar antes de reconocer.** El escáner de documentos de ML Kit
   (`@capacitor-mlkit/document-scanner`, ya instalado) recorta, endereza y realza
   automáticamente. Es la hipótesis más prometedora para subir el 66.7 % de Cencosud, y no
   está medida todavía. **Siguiente experimento.**
2. **Guiar la captura.** Detectar bordes del documento en vivo y no dejar disparar hasta
   que el encuadre y el foco estén bien. Ataca el problema en el origen: el usuario cree
   que sacó una buena foto, y no lo era.
3. **Detectar el fallo y pedir otra foto.** Con la confianza de `Text.Line` más
   heurísticas (¿aparece un patrón de RUT válido?, ¿cuántos bloques?, ¿qué área cubre el
   texto?). Barato de implementar y evita el peor caso: dato malo aceptado en silencio.
4. **Validar por estructura, no por texto corrido.** El RUT chileno tiene dígito
   verificador; las fechas tienen formato; los totales cuadran con el neto más IVA. Un
   número que no valida es un número que hay que volver a leer o preguntar.

## Pendiente

- [x] ~~Misma batería en el **S25**~~ → hecho. Sin cambio de precisión, ~2.3× más rápido.
- [ ] **Escáner de documentos como preprocesamiento** — la palanca 1 de arriba.
- [ ] Misma batería en **iPhone** → única corrida que puede separar Vision de ML Kit.
- [ ] **Ampliar el corpus más allá de boletas**: informes médicos, exámenes radiológicos,
      documentos oficiales, notas manuscritas. El caso de uso real es "cualquier cosa que
      el usuario fotografíe", y hoy 3 de 4 muestras son boletas.
- [ ] Calibrar el umbral de confianza: medir confianza declarada contra precisión real
      sobre muchas muestras, para saber a partir de qué valor conviene pedir otra foto.
- [ ] Medir peso del APK con y sin modelos embebidos.
- [ ] Usar `boundingBox` para buscar campos numéricos junto a su etiqueta, en vez de en el
      texto corrido.
- [ ] Barrido de degradación controlada (ver [PLAN-CORPUS.md](PLAN-CORPUS.md)).
- [ ] Fase 2: voz a texto.
