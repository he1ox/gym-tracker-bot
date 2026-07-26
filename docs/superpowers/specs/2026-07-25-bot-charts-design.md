# Diseño — Gráficas en el bot y comando `/stagnant`

Fecha: 2026-07-25

## 1. Objetivo

Hacer el bot más visual sin tocar el camino crítico de captura de series. Tres entregables:

1. `/start` envía una gráfica del volumen de la semana por grupo muscular.
2. El detalle de `/last` gana un botón que envía la evolución del 1RM estimado de ese ejercicio.
3. Comando nuevo `/stagnant`, que expone en el bot el `detectStagnation` que hoy solo ve el
   dashboard.

Fuera de alcance de forma explícita: `/undo`, `/today`, `/progress`, `/records`, peso corporal,
fotos de progreso y cualquier forma de racha o medalla (SPEC §2.5). `/dashboard` y `/backup`
siguen siendo alcance pendiente del SPEC §6 y no entran aquí.

## 2. Restricción de partida

Telegram **no renderiza SVG dentro de un mensaje**: solo imágenes rasterizadas enviadas como
foto. Un `.svg` llega como adjunto sin vista previa. Además, un mensaje de texto no se puede
convertir en foto, así que cualquier pantalla que hoy se repinte con `editMessageText` deja de
funcionar en cuanto lleve imagen.

Decisión del autor: rasterizar con **Chart.js sobre skia-canvas**, aceptando la dependencia
nativa. Consecuencias asumidas:

- Contradice el SPEC §3 («Prohibido usar `better-sqlite3` ni cualquier otro módulo nativo que
  requiera compilación»). Hay que **editar el SPEC**, no ignorarlo.
- skia-canvas distribuye binarios precompilados por plataforma, así que no hace falta compilador
  en la máquina del usuario, pero el árbol crece decenas de MB.
- La Fase 4 deja de poder empaquetar un binario autocontenido sin arrastrar el `.node`.
- El bot y el dashboard tendrán **dos implementaciones de gráficas distintas** (Chart.js aquí,
  SVG a mano allá). Es aceptable: es presentación, no lógica de dominio. El SPEC §7 solo prohíbe
  duplicar reglas de negocio, y todas siguen viviendo en `packages/core`.

## 3. Arquitectura del renderizado

Directorio nuevo `apps/server/src/charts/`. **No** es un paquete del monorepo: solo el bot
dibuja con Chart.js, y `packages/core` no puede depender de nada nativo (SPEC §3).

| Fichero | Responsabilidad | Depende de |
|---|---|---|
| `charts/theme.ts` | paleta Nocturne con colores literales, tamaños de fuente | nada |
| `charts/weekly-volume.ts` | datos → configuración de Chart.js. Función pura | core, theme |
| `charts/exercise-1rm.ts` | datos → configuración de Chart.js. Función pura | core, theme |
| `charts/render.ts` | configuración → `Buffer` PNG. Único importador de skia-canvas y chart.js | skia-canvas |

La frontera clave: **qué se dibuja se decide en funciones puras; cómo se pinta está aislado en un
solo fichero**. El grueso del código nuevo se testea sin abrir un canvas, y sustituir el motor de
render mañana toca un fichero.

Parámetros cerrados:

- Lienzo de 1000×560 px. Telegram recomprime las fotos; con menos ancho las etiquetas se ven
  borrosas en móvil.
- `responsive: false` y `animation: false`: sin ellos Chart.js no funciona headless.
- Registro explícito de los controladores y escalas usados, no `chart.js/auto`, para no cargar
  todo el paquete.
- Colores literales en `theme.ts`: las `var(--color-*)` del dashboard no existen fuera del DOM.
- El degradado se construye con `createLinearGradient` del contexto de skia-canvas, sobre el
  acento `#9184d9` que ya usa el dashboard.
- Fuentes: **las del sistema**, pidiendo `sans-serif`. No se versiona ningún `.ttf`. Contrapartida
  registrada: la imagen no es idéntica entre plataformas y la imagen Docker de la Fase 4 tendrá
  que instalar un paquete de fuentes o las etiquetas saldrán vacías.
- Envío con `replyWithPhoto(new InputFile(buffer, '<nombre>.png'), { caption })`.

## 4. Pantallas

### 4.1 `/start`

Envía **primero la foto y después la bienvenida de siempre**, de modo que el mensaje con los
botones quede al final del chat, al alcance del pulgar. `welcome.ts` no cambia: sus cuatro
`editMessageText` (ayuda, ‹ Volver, rutinas, selector de día) siguen operando sobre un mensaje de
texto.

Contenido: barras horizontales de series efectivas por grupo muscular de la **semana ISO en
curso** en la zona horaria del usuario.

- Solo los grupos con al menos una serie, ordenados de más a menos series.
- Banda de referencia de 10–20 series pintada de fondo (SPEC §8.1).
- Caption breve con el rango de fechas de la semana y el total de series.
- **Si la semana no tiene ninguna serie efectiva, no se envía foto.** Nada de gráficas vacías, y
  `/start` sigue costando un solo mensaje mientras no haya datos.

### 4.2 `/last`

El detalle sigue siendo un mensaje de texto editable; el selector de ejercicios conserva su
navegación con ‹ Volver. Se le añade un botón `📈 Ver gráfica` que envía la imagen **como mensaje
aparte**, solo cuando se pide. Se descartó enviarla automáticamente al elegir ejercicio: consultar
cuatro ejercicios dejaría cuatro fotos sueltas, y el SPEC §6 exige que el chat quede limpio.

Contenido: línea con degradado del mejor 1RM estimado de cada sesión, **las 12 más recientes**, con
un punto marcado en las sesiones que fueron récord. Caption con el nombre del ejercicio y su mejor
1RM histórico.

**El botón no se muestra si el ejercicio tiene menos de dos sesiones**: una línea de un solo punto
no informa de nada.

### 4.3 `/stagnant`

Solo texto, sin gráfica. El comando va en inglés porque es un identificador (SPEC §12); solo su
descripción en el menú se traduce, como ya hace `botCommands`.

Recorre los ejercicios del usuario con histórico, aplica `detectStagnation` con su default de 3
semanas y lista los estancados, de más semanas sin mejorar a menos. Cada línea: nombre del
ejercicio, récord y la semana en que se logró, mejor 1RM desde entonces y semanas atascado.

Dos estados vacíos **con textos distintos**, porque significan cosas distintas: «no hay nada
estancado» y «aún no hay semanas entrenadas suficientes para juzgarlo». Entra en `COMMAND_ORDER`
y en el texto de `/help`.

## 5. Datos

Ninguna función de dominio nueva. `packages/core` no se toca.

- **Volumen semanal**: `weeklyVolumeByMuscleGroup` ya existe, pero `buildUserOverview` no lo
  devuelve. Hace falta un servicio que cruce las series de la semana ISO con el mapa
  `exerciseId → muscle_group`. **Ese mapa debe incluir los ejercicios archivados**, o las series
  históricas lanzan (precaución registrada en la Fase 1).
- **1RM por sesión**: `listHistorySetsForExercise` ya trae el histórico completo. Se agrupa por
  `workout_id`, se aplica `session1RM` y los récords se derivan del máximo acumulado: una sesión
  es récord si supera **estrictamente** a todas las anteriores. Es una función pura propia,
  testeable aparte.
- **`/stagnant`**: `detectStagnation` opera sobre un ejercicio, así que se añade a `packages/db`
  un `listExercisesWithHistory(userId)` y se recorre llamando a `listHistorySetsForExercise`. Son
  decenas de consultas preparadas, no cientos; SPEC §12 prohíbe optimizar antes de tiempo.
- Sin migraciones: no hay cambios de esquema.

### i18n

Claves nuevas en los dos catálogos (`es`, `en`): captions de las dos gráficas, etiqueta del botón
`📈 Ver gráfica`, todos los textos de `/stagnant` (cabecera, línea de ejercicio y los dos estados
vacíos) y la descripción del comando en el menú.

Los nombres de grupo muscular salen de `localizeGroups`, los de ejercicio de `displayName` y la
unidad de `T.withUnit`, igual que el resto del bot.

**Corrección puntual incluida:** `last.ts:20` fija `'es-ES'` en `Intl.DateTimeFormat`. El eje de
fechas de la gráfica necesita el idioma activo, así que esa función pasa a resolver el locale en
vez de duplicar el fallo.

## 6. Tests

- **Constructores de configuración** (el grueso, sin canvas): orden de las barras, exclusión de
  grupos sin series, presencia de la banda 10–20, ventana de las 12 últimas sesiones, posición de
  los marcadores de récord, y los casos vacíos de cada gráfica.
- **Servicios**: SQLite en memoria con el patrón ya establecido en el repo, incluyendo el caso del
  **ejercicio archivado con histórico** en las dos rutas que agrupan por grupo muscular.
- **Renderizador: un único smoke test.** Devuelve un `Buffer` cuya firma es PNG y cuyas
  dimensiones, leídas de la cabecera IHDR, son las esperadas. **Sin snapshots de píxeles**: las
  fuentes del sistema difieren entre Windows, Linux y CI, y un test así sería inestable por
  diseño.
- **Bot**, con el harness existente: `/start` con datos envía foto y texto; `/start` sin datos
  envía solo texto; el botón de gráfica no aparece con menos de dos sesiones; `/stagnant` en vacío
  y con datos. Esto obliga a **ampliar `test-harness.ts` para observar `sendPhoto`**, que hoy no
  captura.

## 7. Riesgos

1. **skia-canvas puede no cargar en el entorno del autor** (Windows, Vitest). Por eso la primera
   tarea del plan es un spike de instalación aislado: si falla, el diseño se revisa antes de
   escribir gráficas, no en la tarea 8.
2. **Latencia**: el primer render carga el binario nativo. `/start` pagará unos cientos de
   milisegundos extra. Tolerable: el camino crítico del SPEC §2.1 es registrar una serie, no
   arrancar la sesión. Nada de caché de imágenes (YAGNI).
3. **Unidades mezcladas**: el histórico de quien cambie de kg a lb mezcla unidades (riesgo ya
   aceptado y documentado en el SPEC §6). Los ejes heredan el problema; se etiquetan con la unidad
   configurada en ese momento y no se convierte nada.
4. **Peso del árbol de dependencias**, decenas de MB. Es el precio de reaprovechar Chart.js en
   lugar de un rasterizador mínimo.

## 8. Documentación a actualizar

- `SPEC.md` §3: levantar la prohibición de módulos nativos con su matiz (se permiten binarios
  precompilados, sigue prohibido lo que exija compilador) y cambiar la fila «Gráficas» de la tabla
  del stack.
- `SPEC.md` §6: añadir `/stagnant` a la lista de comandos.
- `DECISIONS.md`: entrada nueva con el motivo de Chart.js + skia-canvas, las alternativas
  descartadas (`@resvg/resvg-js`, PNG a mano con `node:zlib`, bloques Unicode) y el coste asumido
  en la Fase 4.
