# Bienvenida y descubribilidad del bot (Fase 2)

Fecha: 2026-07-25
Estado: aprobado, pendiente de plan de implementación

## 1. Problema

Un usuario que abre el bot por primera vez no tiene forma de saber qué hace ni cómo se usa.

- **El menú ☰ de Telegram está vacío.** No hay ninguna llamada a `setMyCommands` en el
  código. Telegram no ofrece la lista de comandos, así que `/routines`, `/last` y `/finish`
  son invisibles.
- **`/start` no da la bienvenida, arranca un entrenamiento.** En Telegram, `/start` es el
  botón «INICIAR» que pulsa cualquiera al abrir un bot por primera vez. Hoy eso responde
  `«¿Qué toca hoy? Elige un día o entrena libre»` (`capture.ts:173-186`) sin explicar nada.
- **Un usuario sin rutinas solo ve «🏃 Entrenar libre».** `renderDayPicker`
  (`session-view.ts:65`) no menciona que se pueden crear rutinas.
- **El texto libre es invisible.** Escribir `60x8` es la vía más rápida de registrar
  (SPEC §6.4), pero ninguna pantalla lo dice: solo aparece tras un error de formato.
- **No existe `/help`.**

## 2. Alcance

Una pantalla de bienvenida con resumen de progreso y botonera, una pantalla de ayuda, y el
registro de comandos en el menú nativo de Telegram.

**No** entran: pistas contextuales dentro del flujo de captura, primer entrenamiento
guiado, `/dashboard` y `/backup` (fases posteriores). El flujo de captura no se toca.

## 3. Pantalla de bienvenida

`/start` **sin sesión activa** responde:

```
👋 Hola, George

Registra tus series desde aquí: elige un día, elige ejercicio
y escribe 60x8.

Últimos 30 días          vs. 30 anteriores
  Entrenamientos      12          ▲ 20 %
  Series             148          ▲  9 %
  Repeticiones     1,184          ▼  3 %
  Levantado     58,420 kg         ▲ 12 %
  Más pesado       140 kg         ▲  4 %
                   Peso muerto
```

Botonera inline:

```
┌────────────────────────────────┐
│ ▶️  Empezar entrenamiento       │
├───────────────┬────────────────┤
│ 📋 Mis rutinas │ 📊 Historial   │
├───────────────┴────────────────┤
│ ❓ Cómo funciona                │
└────────────────────────────────┘
```

### Reglas de las métricas

- **Ventana actual:** los 30 días que terminan hoy, ambos inclusive, anclados al **inicio
  del día en la zona horaria del usuario**, no a la hora exacta. El resumen no cambia entre
  serie y serie.
- **Ventana de comparación:** los 30 días inmediatamente anteriores.
- **Solo series efectivas** (`is_warmup = 0`) en todas las cifras, según SPEC §5.
- **`Entrenamientos`** = sesiones cuyo `started_at` cae en la ventana. Se cuentan aunque no
  tengan series efectivas.
- **`Series`** = número de series efectivas. **`Repeticiones`** = suma de sus `reps`.
  **`Levantado`** = tonelaje, `Σ weight_kg × reps`.
- **`Más pesado`** = mayor `weight_kg` de una serie efectiva, con el nombre de su ejercicio
  en una segunda línea. En caso de empate gana la serie más reciente. Es un dato crudo, no
  un 1RM estimado.
- **Variación** = `(actual − anterior) / anterior × 100`, redondeada a entero.
  - Si el periodo anterior vale **0**, no hay división posible: se muestra `—`.
  - La columna se muestra **siempre**, también durante los primeros 30 días de uso. Una
    sola versión de la pantalla.
- **Usuario sin ningún entrenamiento:** todas las cifras a 0, `Más pesado` sin ejercicio y
  toda la columna de variación a `—`. Las dos líneas de texto bajo el saludo son las que
  explican de qué va el bot.

El nombre del saludo sale de `ctx.from.first_name`. Si viene vacío, el saludo se reduce a
`👋 Hola`.

### Formato de los números y alineación

- Los millares se separan reutilizando `formatTonnage` (`session-view.ts:55`), que ya usa
  coma. No se introduce un segundo criterio de formato en el bot.
- **La tabla no se alinea con la fuente por defecto de Telegram**, que es proporcional. El
  bloque de métricas se envía dentro de un `<pre>` con `parse_mode: 'HTML'`; el saludo y el
  texto explicativo van fuera, en texto normal.
- Es la primera vez que el bot usa `parse_mode`. El nombre del ejercicio de `Más pesado`
  puede ser un ejercicio propio con texto arbitrario, así que **debe escaparse** (`&`, `<`,
  `>`) antes de entrar en el `<pre>`. Los ejercicios propios se crean desde el wizard sin
  validación de caracteres (`routines-wizard.ts`, `askOwnName`), de modo que este escape no
  es teórico. Hay un test dedicado.

## 4. `/start` con entrenamiento a medias

Sin cambios respecto a hoy: repinta la sesión activa y no muestra la bienvenida. Es la
reanudación que exige SPEC §6 y no debe costar ningún toque extra en mitad del gimnasio.

## 5. Pantalla de ayuda

Accesible por el botón `❓ Cómo funciona` y por el comando `/help`. Desde el botón,
**edita el mismo mensaje** en lugar de enviar uno nuevo. Desde el comando, se envía como
mensaje nuevo.

En ambos casos lleva un botón `‹ Volver` (`wc:b`) que **edita ese mismo mensaje** y lo
convierte en la pantalla de bienvenida, resumen incluido. Es decir, `‹ Volver` no depende de
cómo se llegó a la ayuda: siempre reconstruye la bienvenida en el sitio.

`/help` funciona también con un entrenamiento en curso. Como envía un mensaje nuevo y no
toca el mensaje activo de la sesión, no interfiere con la captura.

Contenido: qué es el bot; el flujo de captura; **las dos vías de registro**, botones y texto
libre (`60x8`, `60 x 8`, `60x8 rpe8`, `sentadilla 100x5`); el calentamiento; los avisos de
descanso; y qué hace cada comando.

## 6. Menú de comandos de Telegram

Se registran al arrancar con `setMyCommands`:

| Comando | Descripción |
|---|---|
| `/start` | Inicio y resumen |
| `/finish` | Terminar el entrenamiento |
| `/routines` | Mis rutinas |
| `/last` | Historial de un ejercicio |
| `/help` | Cómo funciona |

La llamada va dentro de `onStart`, con un `catch` que solo registra el fallo en el log: si
Telegram no responde a esa llamada, el bot debe arrancar igual.

## 7. Botones que reutilizan pantallas existentes

Ninguno de los tres botones secundarios inventa pantalla nueva; los tres editan el mensaje
de la bienvenida:

| Botón | Reutiliza |
|---|---|
| `▶️ Empezar entrenamiento` | El selector de día actual, `renderDayPicker` (`session-view.ts:65`) |
| `📋 Mis rutinas` | La lista de rutinas de `/routines` (`routines-wizard.ts:318-326`) |
| `📊 Historial` | El selector de ejercicios por grupo muscular con origen `'l'` (`exercise-picker.ts`, atendido por `last.ts:96`) |

`📋 Mis rutinas` **no** entra en la conversación del wizard: pinta la lista, cuyo botón
`➕ Nueva rutina` ya hace `conversation.enter('routineWizard')`. Así la bienvenida no
depende del plugin de conversaciones.

## 8. Lógica de dominio: `packages/core`

Nada de lo que hay hoy sirve: todas las métricas existentes están agrupadas por semana ISO.

### 8.1 `overview.ts`

```ts
export interface OverviewSet { createdAt: number; weightKg: number; reps: number; exerciseName: string }

export interface OverviewTotals {
  workouts: number;
  effectiveSets: number;
  reps: number;
  tonnageKg: number;
  heaviest: { weightKg: number; exerciseName: string } | null;
}

export interface OverviewMetric { current: number; previous: number; changePercent: number | null }

export interface Overview {
  workouts: OverviewMetric;
  effectiveSets: OverviewMetric;
  reps: OverviewMetric;
  tonnageKg: OverviewMetric;
  heaviest: OverviewMetric & { exerciseName: string | null };
}

export function percentChange(current: number, previous: number): number | null;

export function buildOverview(input: {
  sets: OverviewSet[];
  workoutStarts: number[];
  currentFrom: number;
  currentTo: number;
  previousFrom: number;
}): Overview;
```

`percentChange` devuelve `null` cuando `previous === 0`. Las ventanas son
`[currentFrom, currentTo]` y `[previousFrom, currentFrom)`: el instante `currentFrom`
pertenece solo a la ventana actual, sin solape ni hueco.

`OverviewTotals` es el agregado de **una** ventana. No aparece en la firma pública porque
`buildOverview` ya devuelve las dos ventanas emparejadas, pero se exporta para poder
testearlo por separado.

`buildOverview` no consulta el reloj: recibe las fronteras ya calculadas. Es pura y
determinista.

### 8.2 `local-day.ts`

`weeks.ts` **no** sirve para esto: `isoWeekKey` lee las partes de la fecha local vía `Intl`
pero nunca reconstruye un epoch, que es justo lo que hace falta para delimitar ventanas.

```ts
export function startOfLocalDay(instant: Date, timeZone: string): number;
```

Devuelve el epoch en milisegundos de las 00:00 locales del día que contiene `instant`.
Implementación: obtener las partes locales con `Intl.DateTimeFormat`, calcular el desfase de
la zona respecto a UTC en ese instante, y **converger en una segunda pasada** — en los días
de cambio de horario el desfase de las 00:00 puede no ser el del instante de partida.

Este helper es la pieza con más aristas del diseño y necesita tests explícitos de cambio de
horario (adelanto y atraso) y de zonas con desfase no entero, como `Asia/Kolkata`.

Las fronteras se derivan así, en el servicio, no en `core`:

```
currentTo   = now
currentFrom = startOfLocalDay(now, tz) − 29 días
previousFrom = currentFrom − 30 días
```

## 9. Datos: `packages/db`

Dos consultas nuevas, sin migraciones:

- `listEffectiveSetsBetween(db, { userId, fromMs, toMs })` — series con `is_warmup = 0` del
  usuario, con el nombre del ejercicio ya unido, filtradas por `sets.created_at`.
- `listWorkoutStartsBetween(db, { userId, fromMs, toMs })` — los `started_at` de los
  entrenamientos del usuario en el rango.

Ambas se piden **una sola vez sobre los 60 días completos** (`previousFrom` a `currentTo`) y
`buildOverview` reparte entre las dos ventanas. Una ida a la base de datos y todo el troceo
en código puro.

Sin dependencias nuevas y sin cambios de esquema.

## 10. Bot: archivos afectados

| Archivo | Cambio |
|---|---|
| `bot/welcome.ts` *(nuevo)* | `renderWelcome` y `renderHelp`, puros, al estilo de `session-view.ts`; más `registerWelcome` con los handlers |
| `services/overview-service.ts` *(nuevo)* | Calcula las fronteras, lee de la BD, llama a `core` y arma el modelo de vista |
| `bot/callback-data.ts` | Espacio `wc:` — `wc:s` empezar, `wc:r` rutinas, `wc:l` historial, `wc:h` ayuda, `wc:b` volver |
| `bot/texts.ts` | Textos de bienvenida, cabeceras de métricas y cuerpo de `/help` |
| `bot/capture.ts` | `handleStart`: sin sesión → bienvenida. Se extrae `buildDayOptions(db, userId)` para compartirla con `wc:s` |
| `bot/routines-wizard.ts` | Se extrae `renderRoutinesList(db, userId)` para compartirla con `wc:r` |
| `bot/bot.ts` | `registerWelcome` **después** de `registerLast` y **antes** de `registerCapture` |
| `main.ts` | `setMyCommands` dentro de `onStart`, con `catch` que solo loguea |

### 10.1 El orden de registro es el punto delicado

`capture.ts` engancha un `bot.on('callback_query:data')` que atiende **todo** lo que le
llegue (`capture.ts:455`). Cualquier handler de `wc:*` registrado después nunca se
ejecutaría. Es la misma trampa que en la Fase 2 obligó a meter el segmento de origen en el
espacio `pick:`, y queda comentada en el código.

`📊 Historial` pinta el selector con origen `'l'`, cuyos callbacks atiende `last.ts:96`,
registrado antes que la captura. Encaja sin tocar nada.

## 11. Pruebas

- **`core/overview.test.ts`** — el grueso: reparto entre ventanas, series justo en
  `currentFrom` y en `previousFrom`, exclusión del calentamiento, empate en `Más pesado`
  resuelto por la más reciente, entrenamientos sin series efectivas, y `percentChange` con
  previo 0, mejora, empeoramiento y valores iguales.
- **`core/local-day.test.ts`** — fronteras de día en zona horaria: una serie a las 23:50 en
  `America/Mexico_City` no puede caer en la ventana equivocada; días de cambio de horario en
  ambos sentidos; zona con desfase de media hora.
- **`packages/db`** — tests de las dos consultas nuevas, con los límites `from`/`to`, el
  aislamiento por `user_id` y el filtro de calentamiento.
- **`bot/welcome.test.ts`** — render puro: usuario sin datos, con datos pero sin ventana de
  comparación, y con ambas ventanas llenas; nombre vacío; render de la ayuda; y el escape
  HTML de un ejercicio propio llamado, por ejemplo, `Curl <martillo> & polea`.
- **`bot/flows.test.ts`** — sobre el harness existente: `/start` de usuario nuevo devuelve la
  bienvenida; `/start` con sesión activa repinta el entreno y **no** muestra la bienvenida;
  cada uno de los cuatro botones; `/help` y el `‹ Volver`.
- **`setMyCommands`** — verificación de la lista contra el mock de API del harness.

## 12. Criterio de aceptación

Un usuario que abre el bot por primera vez ve, sin escribir nada, qué es el bot, qué puede
hacer y cómo registrar una serie; y llega a rutinas, historial y ayuda sin conocer ningún
comando. Un usuario con historial ve su progreso de los últimos 30 días al abrirlo, y sigue
arrancando y reanudando un entrenamiento con el mismo número de toques que hoy.
