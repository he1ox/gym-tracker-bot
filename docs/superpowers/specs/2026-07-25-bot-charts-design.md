# Diseño — Gráficas en el bot y comando `/stagnant`

Fecha: 2026-07-25. Revisado el 2026-07-26 tras el análisis de UX y rendimiento; los cambios de
esa revisión están marcados con **(rev.)** allí donde contradicen la versión anterior.

## 1. Objetivo

Hacer el bot más visual sin tocar el camino crítico de captura de series. Cuatro entregables:

1. La bienvenida de `/start` gana **barras de texto** de series por grupo muscular dentro de su
   tabla monoespaciada, y un botón `📊 Semana` que envía la gráfica rasterizada bajo demanda.
2. El resumen de `/finish` envía la gráfica del volumen de la semana por grupo muscular.
3. El detalle de `/last` gana un botón que envía la evolución del 1RM estimado de ese ejercicio,
   y una línea de aviso cuando ese ejercicio está estancado.
4. Comando nuevo `/stagnant`, que expone en el bot el `detectStagnation` que hoy solo ve el
   dashboard.

**(rev.)** La versión anterior enviaba la gráfica de volumen automáticamente en `/start`. Se
descartó por tres motivos que se refuerzan entre sí, detallados en §4.1: ensucia el chat con una
foto huérfana por arranque, sale casi vacía los lunes —cuando más se pulsa `/start`— y mete render
más subida a Telegram delante del selector de día. Ninguna foto viaja ya en `/start`.

Fuera de alcance de forma explícita: `/undo`, `/today`, `/progress`, `/records`, peso corporal,
fotos de progreso y cualquier forma de racha o medalla (SPEC §2.5). `/dashboard` y `/backup`
siguen siendo alcance pendiente del SPEC §6 y no entran aquí.

## 2. Restricción de partida

Telegram **no renderiza SVG dentro de un mensaje**: solo imágenes rasterizadas enviadas como
foto. Un `.svg` llega como adjunto sin vista previa. Además, un mensaje de texto no se puede
convertir en foto, así que cualquier pantalla que hoy se repinte con `editMessageText` deja de
funcionar en cuanto lleve imagen. De ahí la regla de §4: **las fotos son siempre mensajes nuevos y
las pantallas editables nunca llevan imagen**.

Decisión del autor: rasterizar con **Chart.js sobre skia-canvas**, aceptando la dependencia
nativa. Consecuencias asumidas:

- Contradice el SPEC §3 («Prohibido usar `better-sqlite3` ni cualquier otro módulo nativo que
  requiera compilación»). Hay que **editar el SPEC**, no ignorarlo.
- skia-canvas distribuye binarios precompilados por plataforma, así que no hace falta compilador
  en la máquina del usuario, pero el árbol crece decenas de MB.
- La Fase 4 deja de poder empaquetar un binario autocontenido sin arrastrar el `.node`.
- **(rev.)** El spike de la tarea 1 debe comprobar además **si hay binario para musl**. Si no lo
  hay, la imagen Docker de la Fase 4 no puede basarse en Alpine y tiene que ir sobre
  `debian-slim`. Es una restricción que conviene conocer antes de escribir el Dockerfile, no
  durante.
- El bot y el dashboard tendrán **dos implementaciones de gráficas distintas** (Chart.js aquí,
  SVG a mano allá). Es aceptable: es presentación, no lógica de dominio. El SPEC §7 solo prohíbe
  duplicar reglas de negocio, y todas siguen viviendo en `packages/core` — incluida la banda
  10–20, que se mueve allí precisamente por esto (§5.4).

## 3. Arquitectura del renderizado

Directorio nuevo `apps/server/src/charts/`. **No** es un paquete del monorepo: solo el bot
dibuja con Chart.js, y `packages/core` no puede depender de nada nativo (SPEC §3).

| Fichero | Responsabilidad | Depende de |
|---|---|---|
| `charts/theme.ts` | paleta Nocturne con colores literales, tamaños de fuente y grosores mínimos | nada |
| `charts/weekly-volume.ts` | datos → configuración de Chart.js. Función pura | core, theme |
| `charts/exercise-1rm.ts` | datos → configuración de Chart.js. Función pura | core, theme |
| `charts/render.ts` | configuración → `Buffer` PNG. Único importador de skia-canvas y chart.js | skia-canvas |
| `charts/volume-bars.ts` | datos → barras de texto para el `<pre>` de la bienvenida. Función pura | core |

La frontera clave: **qué se dibuja se decide en funciones puras; cómo se pinta está aislado en un
solo fichero**. El grueso del código nuevo se testea sin abrir un canvas, y sustituir el motor de
render mañana toca un fichero.

### 3.1 Parámetros cerrados

- Lienzo de 1000×560 px. Telegram recomprime las fotos; con menos ancho las etiquetas se ven
  borrosas en móvil.
- `responsive: false` y `animation: false`: sin ellos Chart.js no funciona headless.
- Registro explícito de los controladores y escalas usados, no `chart.js/auto`, para no cargar
  todo el paquete.
- Colores literales en `theme.ts`: las `var(--color-*)` del dashboard no existen fuera del DOM.
  Los valores salen de `nocturne.css` y de `presenters/format.ts`, para que las dos superficies
  se vean iguales:

  | Token | Literal | Uso |
  |---|---|---|
  | `bg` | `#161826` | fondo del lienzo |
  | `text` | `#e9e9ed` | etiquetas y cifras |
  | `divider` | `rgba(233,233,237,0.16)` | ejes y rejilla |
  | `track` | `#292b31` | canal de la barra |
  | `accent` | `#9184d9` | línea del 1RM y degradado |
  | `barInBand` | `#b5abfc` | barra dentro de 10–20 (`--color-accent-400`) |
  | `barOutOfBand` | `#d4a15a` | barra fuera de banda (`ACCENT_DOWN`) |
  | `bandFill` | `rgba(145,132,217,0.13)` | banda de referencia 10–20 |

- El degradado se construye con `createLinearGradient` del contexto de skia-canvas, sobre el
  acento `#9184d9` que ya usa el dashboard.
- **(rev.) Mínimos tipográficos: fuente ≥ 18 px para etiquetas y ≥ 16 px para cifras de eje,
  trazos ≥ 2 px.** Más píxeles de lienzo no compensan una recompresión con pérdida: lo que la
  sobrevive es tipografía grande y trazo grueso. Los mínimos viven en `theme.ts` como constantes
  con nombre, no dispersos en las configuraciones.
- Fuentes: **las del sistema**, pidiendo `sans-serif`. No se versiona ningún `.ttf`. Contrapartida
  registrada: la imagen no es idéntica entre plataformas y la imagen Docker de la Fase 4 tendrá
  que instalar un paquete de fuentes o las etiquetas saldrán vacías.
- Envío con `replyWithPhoto(new InputFile(buffer, '<nombre>.png'), { caption })`.
- Sin caché de imágenes ni reutilización de `file_id`: el dato cambia con cada serie registrada,
  así que la caché necesitaría invalidación por contenido. YAGNI.

### 3.2 Ciclo de vida del render **(rev.)**

Tres reglas que no son detalles de implementación, sino condiciones para que la gráfica no pese
sobre quien no la mira:

1. **Carga diferida.** skia-canvas y chart.js se importan con `await import()` dentro de
   `render.ts`, memoizando la promesa en una variable de módulo. Con un `import` estático, el
   binario nativo se cargaría **al arrancar el proceso** en toda instalación, incluidas las que
   nunca ven una gráfica: arranque más lento y decenas de MB de RSS residentes en un servicio que
   vive meses. Con carga diferida, el coste se paga en el primer dibujo y solo si llega.
2. **`chart.destroy()` en `finally`.** `new Chart(...)` se registra en el registro global de
   instancias de Chart.js; sin destruirla tras el `toBuffer`, cada render deja colgados el
   config, los datos y el canvas. En un proceso de larga vida es una fuga lenta.
3. **La gráfica nunca rompe el flujo.** `render.ts` expone una función que **no lanza**: envuelve
   todo en `try/catch`, registra el fallo en stdout y devuelve `null`. Quien la llama trata el
   `null` como «no hay foto» y sigue con su texto. Este diseño mismo admite dos formas realistas
   de fallo (el `.node` que no carga en Windows, el paquete de fuentes ausente en Docker), así que
   la degradación no es defensa preventiva: es el camino esperado en esos entornos.

## 4. Pantallas

### 4.1 `/start` — barras de texto y botón

**(rev.)** `/start` sigue costando **un solo mensaje** y sigue siendo editable de principio a fin.
Sus cuatro `editMessageText` (ayuda, ‹ Volver, rutinas, selector de día) siguen operando sobre un
mensaje de texto, y `welcome.ts` conserva su estructura.

Motivos para no enviar aquí la foto, que era el diseño anterior:

- **Chat sucio.** La bienvenida se repinta en el sitio; una foto no. Cada `/start` dejaría una
  imagen huérfana que ya no se puede actualizar: cinco entrenos por semana son cinco fotos de la
  misma semana, cada una más desactualizada que la anterior. Es el mismo argumento con el que
  §4.3 descarta enviar la gráfica de `/last` automáticamente, y el SPEC §6 pide justo lo
  contrario.
- **El lunes sale vacía.** La semana ISO en curso, consultada un lunes por la mañana —cuando más
  se pulsa `/start`—, tiene una barra o ninguna. El caso de cero series ya estaba cubierto, pero
  una gráfica de dos barras se ve peor que ninguna: parece roto.
- **Latencia en la puerta de entrada.** Render más subida con datos móviles en el gimnasio son
  cientos de milisegundos en el mejor caso, y segundos en el peor, antes de que aparezca el
  selector de día. `/start` es lo primero que se hace de pie con el móvil en la mano.

Lo que sí gana la bienvenida:

**Bloque de barras de texto**, dentro de un `<pre>` propio bajo la tabla de métricas. Da lectura
visual inmediata con cero dependencias, cero latencia y sin salir del mensaje editable:

```
Pecho          █████│██░░░  14
Cuádriceps     █████│█████  22
Bíceps         ███░░│░░░░░   6
```

- Diez celdas de **2 series** cada una: la barra llena equivale a 20, el techo de la banda. El
  relleno es `Math.min(10, Math.round(count / 2))`, así que un grupo con 7 series pinta 4 celdas;
  la cifra exacta va al lado y manda sobre la barra.
- El `│` tras la quinta celda marca el **mínimo de 10** de la banda del SPEC §8.1. Es la
  referencia de la banda en texto: media barra es el suelo, la barra entera el techo.
- Ancho de etiqueta **calculado** sobre las filas presentes, no una constante: los nombres de
  grupo salen de `localizeGroups` y «Deltoides posterior» no cabe en los 14 caracteres que usa la
  tabla de métricas. Los tres glifos (`█░│`) y las etiquetas latinas son unidades UTF-16 simples,
  así que `padEnd` cuadra igual que en `metricsBlock`.
- Solo los grupos con al menos una serie, ordenados de más a menos series. Si la semana no tiene
  ninguna serie efectiva, el bloque entero no se pinta.
- Contrapartida registrada: la escala no dice nada por encima de 20 (la barra ya está llena) y
  los glifos de bloque dependen de la fuente monoespaciada del cliente. Si en uso real el `│`
  descuadra en algún cliente, se retira y quedan las diez celdas a secas.

**Botón `📊 Semana`**, en la última fila del teclado junto a `Ayuda`. Envía la gráfica rasterizada
como mensaje nuevo, solo cuando se pide. El botón **se conserva tras usarlo**: es una entrada de
menú permanente, y `‹ Volver` reconstruye la bienvenida entera de todos modos, así que retirarlo
sería inconsistente. Pulsarlo dos veces manda dos fotos; es una acción explícita del usuario.

Cuidado al añadirlo: el comentario de [welcome.ts:106](../../../apps/server/src/bot/welcome.ts#L106)
avisa de que `.text(x).row()` solo es seguro si detrás va otro botón. El botón entra en la fila
que ya tiene `Ayuda`, no en una fila propia.

### 4.2 `/finish` — la gráfica de volumen **(rev.)**

El sitio natural para la gráfica de la semana. El usuario acaba de sumar series, está sentado, y
la imagen es la recompensa del entreno en vez de un peaje a la entrada. Es una foto por
entrenamiento, no una por arranque.

`handleFinish` edita el mensaje activo con el resumen y **después** envía la foto como mensaje
nuevo. Al hacerlo, la sesión ya está cerrada: el chat queda con el resumen y su gráfica, y nada
más se va a repintar.

Cuidado al implementarlo: `handleFinish` tiene hoy varios `return` tempranos dentro del `try` de
`editMessageText` ([capture.ts:207-219](../../../apps/server/src/bot/capture.ts#L207-L219)). Hay
que reordenarlo para que el envío de la foto no se salte por esos caminos, sin cambiar el
comportamiento del resumen.

Contenido: barras horizontales de series efectivas por grupo muscular de la **semana ISO en
curso** en la zona horaria del usuario.

- Solo los grupos con al menos una serie, ordenados de más a menos series.
- Banda de referencia de 10–20 series pintada de fondo (SPEC §8.1).
- **(rev.) Barra coloreada según la banda**, no un acento único: `barInBand` si la cuenta está
  dentro de 10–20 y `barOutOfBand` si no, con el mismo criterio que
  [VolumeBar.tsx:20](../../../apps/web/src/components/VolumeBar.tsx#L20). Con un acento único, las
  dos superficies cuentan historias distintas del mismo dato y el usuario tiene que comparar a
  ojo contra la banda en vez de leer «esto lo tengo corto».
- **(rev.) Máximo del eje `Math.max(VOLUME_TARGET_MAX + 4, ...cuentas)`**, igual que
  [overview.ts:79](../../../apps/web/src/presenters/overview.ts#L79). Sin eso, una semana floja
  deja la banda 10–20 fuera del lienzo y la referencia desaparece justo cuando más importa.
- Caption breve con el rango de fechas de la semana y el total de series.
- Si la semana no tiene ninguna serie efectiva, no se envía foto. Se da cuando se cierra un
  entrenamiento sin registrar nada.

### 4.3 `/last` — gráfica de 1RM y aviso de estancamiento

El detalle sigue siendo un mensaje de texto editable; el selector de ejercicios conserva su
navegación con ‹ Volver. Se le añade un botón `📈 Ver gráfica` que envía la imagen **como mensaje
aparte**, solo cuando se pide. Se descartó enviarla automáticamente al elegir ejercicio: consultar
cuatro ejercicios dejaría cuatro fotos sueltas, y el SPEC §6 exige que el chat quede limpio.

**El botón no se muestra si el ejercicio tiene menos de dos sesiones**: una línea de un solo punto
no informa de nada.

**(rev.) El botón se retira tras enviar la foto**, con `editMessageReplyMarkup` sobre el detalle.
A diferencia del de la bienvenida, este es una acción de un solo uso sobre una pantalla
transitoria, y el estado «detalle sin botones» ya existe en el código: es exactamente con lo que
[last.ts:128](../../../apps/server/src/bot/last.ts#L128) pinta hoy el detalle.

**(rev.) Feedback inmediato**, porque entre la pulsación y la foto hay render y subida:

- `answerCallbackQuery()` **antes** de renderizar; si no, la ruedita del botón gira hasta que
  acabe todo.
- `sendChatAction('upload_photo')` antes del render, para que Telegram muestre «enviando foto…».

Contenido: línea con degradado del mejor 1RM estimado de cada sesión, **las 12 más recientes**, con
un punto marcado en las sesiones que fueron récord. Caption con el nombre del ejercicio y su mejor
1RM histórico.

**(rev.) Eje X temporal, no por índice.** Doce sesiones equiespaciadas hacen que dos meses sin
pisar el gimnasio se vean como una semana normal. El eje es `type: 'linear'` sobre epoch-ms, con
`ticks.callback` formateando por `Intl.DateTimeFormat`. **Deliberadamente no se usa la escala
`time` de Chart.js**: exige `chartjs-adapter-date-fns` y una librería de fechas, y DECISIONS
(Fase 0) ya fijó que no entra ninguna. Los huecos quedan visibles y el árbol no crece.

Nota: el dashboard reparte por índice ([AreaChart.tsx:15](../../../apps/web/src/components/AreaChart.tsx#L15)).
La divergencia es consciente y va a DECISIONS; corregir el dashboard es alcance de otra tarea.

**(rev.) Línea de estancamiento en el texto del detalle.** `renderLast` ya carga el histórico
completo del ejercicio ([last.ts:32-36](../../../apps/server/src/bot/last.ts#L32-L36)): es
exactamente lo que `detectStagnation` necesita. Añadir una línea `⚠️ 4 semanas sin superar 92,5 kg`
no cuesta ni una consulta más y pone el insight más valioso del producto (SPEC §5) delante del
usuario en el instante en que decide el peso de hoy, en vez de esperar a que recuerde un comando.
Solo se pinta cuando `detectStagnation` devuelve `stagnant: true`.

### 4.4 `/stagnant`

Solo texto, sin gráfica. El comando va en inglés porque es un identificador (SPEC §12); solo su
descripción en el menú se traduce, como ya hace `botCommands`.

Recorre los ejercicios del usuario con histórico, aplica `detectStagnation` con su default de 3
semanas y lista los estancados, de más semanas sin mejorar a menos. Cada línea: nombre del
ejercicio, récord y la semana en que se logró, mejor 1RM desde entonces y semanas atascado.

Dos estados vacíos **con textos distintos**, porque significan cosas distintas: «no hay nada
estancado» y «aún no hay semanas entrenadas suficientes para juzgarlo». Entra en `COMMAND_ORDER`
y en el texto de `/help`.

**(rev.) Los ejercicios de peso corporal entran en la lista, y eso es una inconsistencia
consciente con el dashboard.** DECISIONS (2026-07-25) los deja fuera de toda cifra derivada del
1RM, y el dashboard los excluye del estancamiento
([overview.ts:82-89](../../../apps/web/src/presenters/overview.ts#L82-L89))… mediante un
`isBodyweight` que **solo existe en los tipos mock del dashboard**: la tabla `exercises` no tiene
esa columna ([schema.ts:29-43](../../../packages/db/src/schema.ts#L29-L43)), y el catálogo base
trae `pull_up` y `dip_parallel_bars`. Así que `/stagnant` va a listar Dominadas mientras el
dashboard las esconde, sobre los mismos datos.

Se acepta la inconsistencia en vez de arreglarla aquí: la columna `is_bodyweight` es una migración
y está fuera del alcance de este diseño. Para el caso de las dominadas con lastre el dato incluso
es útil —el peso añadido sí progresa—. Va a DECISIONS con esa forma, y se revisa cuando el peso
corporal sea un campo almacenado.

**(rev.) Robustez del recorrido.** A diferencia de `/last`, que toca un ejercicio, `/stagnant`
recorre todos: una excepción en el histórico de cualquiera se lleva el comando entero. El bucle
salta el ejercicio que falle y sigue. Nótese que `estimate1RM` lanza con peso ≤ 0
([one-rep-max.ts:4](../../../packages/core/src/one-rep-max.ts#L4)); hoy no hay camino de escritura
que meta un cero —el parser lo rechaza y `recordSet` lo valida
([session-service.ts:75](../../../apps/server/src/services/session-service.ts#L75))— pero el radio
de daño de este comando es lo bastante grande para no depender de ello.

## 5. Datos

Ninguna función de dominio nueva. `packages/core` solo recibe las dos constantes de la banda y su
predicado, que hoy viven en el dashboard (§5.4).

### 5.1 Volumen semanal — sin consultas nuevas **(rev.)**

El diseño anterior pedía «un servicio que cruce las series de la semana ISO con el mapa
`exerciseId → muscle_group`». No hace falta ninguna de las dos cosas:

`/start` ya pide 60 días de series efectivas en cada pulsación, incluido `‹ Volver`
([overview-service.ts:31-39](../../../apps/server/src/services/overview-service.ts#L31-L39)), y la
semana ISO en curso está dentro de esa ventana. Basta **añadir `e.muscle_group` al `SELECT` de
`listEffectiveSetsBetween`** ([sets.ts:139](../../../packages/db/src/repositories/sets.ts#L139)),
que ya hace el JOIN con `exercises`. Es un cambio aditivo: `buildOverview` recibe un campo más y
lo ignora.

Con eso, las barras de texto de `/start` y la gráfica de `/finish` salen **de datos que ya están
en memoria**, sin una segunda consulta ni un mapa que mantener.

Y de paso desaparece el riesgo del ejercicio archivado, que la versión anterior trataba como
«precaución registrada» cuando en realidad **revienta la pantalla**:
`weeklyVolumeByMuscleGroup` lanza si un `exerciseId` no está en el mapa
([volume.ts:17](../../../packages/core/src/volume.ts#L17)) y `listExercisesByMuscleGroup` filtra
`archived = 0` ([exercises.ts:87](../../../packages/db/src/repositories/exercises.ts#L87)). Con el
grupo viniendo del propio JOIN, el fallo es imposible por construcción.

Consecuencia sobre `weeklyVolumeByMuscleGroup`: recibe las series con su grupo ya resuelto, así
que el bot agrupa por `muscleGroup` sin pasar por el mapa. La función de core se queda como está
—el dashboard la usa— y el bot agrupa sobre los datos del JOIN.

### 5.2 1RM por sesión

`listHistorySetsForExercise` ya trae el histórico completo. Se agrupa por `workout_id`, se aplica
`session1RM` y los récords se derivan del máximo acumulado: una sesión es récord si supera
**estrictamente** a todas las anteriores. Es una función pura propia, testeable aparte, y la
comparten la gráfica y el aviso de estancamiento del detalle.

### 5.3 `/stagnant` — una consulta, no 1+N **(rev.)**

La versión anterior añadía `listExercisesWithHistory(userId)` y llamaba a
`listHistorySetsForExercise` en bucle, defendiendo el 1+N con el SPEC §12. Para los viajes a la
base tiene razón, pero el coste real es otro: ese bucle trae a memoria **el histórico completo de
cada ejercicio** —40 ejercicios por tres años son decenas de miles de filas marshalladas por
invocación— para calcular un máximo por semana.

En su lugar, **una sola consulta** de las series efectivas de todos los ejercicios del usuario
(`exercise_id, weight_kg, reps, created_at`, con `is_warmup = 0`), agrupada en memoria por
`exercise_id`. Mismo resultado, hace innecesario `listExercisesWithHistory` —los ejercicios con
histórico son las claves del agrupamiento— y quita superficie en vez de añadirla. No es optimizar
antes de tiempo: es la versión simple.

Los ejercicios archivados con histórico entran, igual que en §5.1: el nombre se resuelve con
`getExerciseById`/`displayName`, que no filtran por `archived`.

### 5.4 La banda 10–20 se mueve a `core` **(rev.)**

`VOLUME_TARGET_MIN`, `VOLUME_TARGET_MAX` e `isVolumeInBand` viven hoy en el dashboard
([config.ts:5-6](../../../apps/web/src/config.ts#L5-L6),
[presenters/volume.ts](../../../apps/web/src/presenters/volume.ts)). Si el bot las redeclara en
`theme.ts`, la misma regla de negocio queda escrita en dos apps, que es justo lo que prohíbe el
SPEC §7.

Se mueven a `packages/core` (es una regla del SPEC §8.1, no una preferencia de presentación) y los
cinco puntos de uso pasan a importarlas de ahí: `VolumeBar.tsx`, `presenters/volume.ts`,
`presenters/overview.ts`, `config.test.ts` y `presenters/volume.test.ts`. `apps/web/src/config.ts`
se queda con `TIME_ZONE`. Cambio mecánico; los tests de la banda se mueven con la función.

Sin migraciones: no hay cambios de esquema.

### 5.5 i18n

Claves nuevas en los dos catálogos (`es`, `en`):

- captions de las dos gráficas;
- etiquetas de los botones `📊 Semana` y `📈 Ver gráfica`;
- cabecera del bloque de barras de texto de la bienvenida;
- línea de aviso de estancamiento del detalle de `/last`;
- todos los textos de `/stagnant`: cabecera, línea de ejercicio y los dos estados vacíos;
- descripción de `/stagnant` en el menú de comandos.

Los nombres de grupo muscular salen de `localizeGroups`, los de ejercicio de `displayName` y la
unidad de `T.withUnit`, igual que el resto del bot.

**Corrección puntual incluida:** [last.ts:20](../../../apps/server/src/bot/last.ts#L20) fija
`'es-ES'` en `Intl.DateTimeFormat`. El eje de fechas de la gráfica necesita el idioma activo, así
que esa función pasa a resolver el locale en vez de duplicar el fallo.

## 6. Tests

- **Constructores de configuración** (el grueso, sin canvas): orden de las barras, exclusión de
  grupos sin series, presencia de la banda 10–20, **color de barra dentro y fuera de banda**,
  **máximo del eje con volumen bajo** (la banda sigue dentro del lienzo), ventana de las 12
  últimas sesiones, **separación proporcional al tiempo en el eje X** (dos sesiones separadas por
  meses no quedan a la misma distancia que dos consecutivas), posición de los marcadores de
  récord, y los casos vacíos de cada gráfica.
- **Barras de texto** (`volume-bars.ts`): relleno y redondeo de celdas, posición del `│`, tope en
  20, ancho de etiqueta calculado con un nombre largo, orden y omisión de grupos sin series.
- **Servicios**: SQLite en memoria con el patrón ya establecido en el repo, incluyendo el caso del
  **ejercicio archivado con histórico** en las dos rutas que agrupan por grupo muscular, y que
  `listEffectiveSetsBetween` devuelve el `muscleGroup` sin alterar el resto del resumen.
- **`/stagnant`**: el agrupamiento de una sola consulta da lo mismo que el recorrido por
  ejercicio; un ejercicio cuyo histórico lanza no tumba el comando; los dos estados vacíos.
- **Renderizador: un único smoke test.** Devuelve un `Buffer` cuya firma es PNG y cuyas
  dimensiones, leídas de la cabecera IHDR, son las esperadas. **Sin snapshots de píxeles**: las
  fuentes del sistema difieren entre Windows, Linux y CI, y un test así sería inestable por
  diseño.
- **Degradación**: con un render que lanza, `/finish` manda su resumen y `/last` su detalle
  igualmente, y no sale ninguna foto. Es el test que protege el punto 3 de §3.2.
- **Bot**, con el harness existente: la bienvenida trae el bloque de barras con datos y no lo trae
  sin ellos; `📊 Semana` envía foto; `/finish` envía resumen y foto; el botón de gráfica no
  aparece con menos de dos sesiones y desaparece tras usarlo; el detalle de `/last` trae la línea
  de estancamiento cuando toca; `/stagnant` en vacío y con datos. Esto obliga a **ampliar
  `test-harness.ts` para observar `sendPhoto`**, que hoy no captura: el transformer solo devuelve
  un `result` con forma de mensaje para `sendMessage`
  ([test-harness.ts:56-59](../../../apps/server/src/bot/test-harness.ts#L56-L59)).

## 7. Riesgos

1. **skia-canvas puede no cargar en el entorno del autor** (Windows, Vitest). Por eso la primera
   tarea del plan es un spike de instalación aislado: si falla, el diseño se revisa antes de
   escribir gráficas, no en la tarea 8. El spike comprueba también el binario para musl (§2).
2. **Latencia del primer render**, que carga el binario nativo. **(rev.)** Ya no la paga `/start`:
   la primera gráfica llega al cerrar el entrenamiento o al pulsar un botón, nunca al arrancar la
   sesión. Con la carga diferida de §3.2, quien no pide gráficas no paga nada en ningún momento.
3. **Legibilidad tras la recompresión de Telegram.** Los mínimos tipográficos de §3.1 son la
   defensa. Se comprueba en el spike **con una foto real recibida en el móvil**, no con el PNG
   local: es lo único que mide lo que el usuario ve.
4. **Unidades mezcladas**: el histórico de quien cambie de kg a lb mezcla unidades (riesgo ya
   aceptado y documentado en el SPEC §6). Los ejes heredan el problema; se etiquetan con la unidad
   configurada en ese momento y no se convierte nada.
5. **Peso del árbol de dependencias**, decenas de MB. Es el precio de reaprovechar Chart.js en
   lugar de un rasterizador mínimo.
6. **Los glifos de bloque de las barras de texto** dependen de la fuente monoespaciada del cliente
   de Telegram. Contrapartida ya registrada en §4.1, con su plan de retirada.

## 8. Documentación a actualizar

- `SPEC.md` §3: levantar la prohibición de módulos nativos con su matiz (se permiten binarios
  precompilados, sigue prohibido lo que exija compilador) y cambiar la fila «Gráficas» de la tabla
  del stack.
- `SPEC.md` §6: añadir `/stagnant` a la lista de comandos, y anotar que `/finish` cierra con la
  gráfica de la semana.
- `DECISIONS.md`, entradas nuevas:
  - Chart.js + skia-canvas: motivo, alternativas descartadas (`@resvg/resvg-js`, PNG a mano con
    `node:zlib`, bloques Unicode como sustituto total del raster) y coste asumido en la Fase 4,
    incluida la restricción de base Debian si no hay binario musl.
  - Las fotos no viajan en `/start`: la bienvenida se mantiene editable y en un solo mensaje; el
    raster va a `/finish` y a botones explícitos.
  - Bloques Unicode **como complemento** en el camino crítico, no como sustituto del raster.
  - La banda 10–20 pasa a `packages/core`: es regla del SPEC §8.1, no presentación.
  - Eje temporal en la gráfica de 1RM del bot frente al reparto por índice del dashboard, y por
    qué no entra un adaptador de fechas.
  - `/stagnant` incluye los ejercicios de peso corporal mientras el dashboard los excluye:
    inconsistencia aceptada, con el motivo y la condición para revisarla.
