# Diseño — Fase 1: Bot mínimo (Gym Tracker Bot)

Fecha: 2026-07-23
Estado: aprobado por el autor en sesión de brainstorming
Documentos padre: `SPEC.md` (§6, §9, §10, §11) y
`docs/superpowers/specs/2026-07-23-phase-0-foundations-design.md`

## Alcance

Bot de Telegram funcional sobre las fundaciones de la Fase 0: long polling, flujo de
captura completo, gestión mínima de rutinas y consulta de histórico. Sin dashboard, sin
API HTTP, sin instalador.

**Criterio de aceptación** (SPEC §11): registrar un entrenamiento completo desde Telegram
con menos de 3 segundos de fricción por serie. Lo mide el uso real del autor; la suite de
fixtures garantiza que el flujo no se rompe.

## Decisiones resueltas en brainstorming

| Decisión | Resolución | Motivo |
|---|---|---|
| Alcance de comandos | Captura (`/start`…`/finish`) + `/routines` mínimo + `/last`. Sin `/backup` ni `/dashboard` | Sin dashboard, las rutinas solo pueden crearse desde el bot; el uso real de la Fase 2 las necesita. `/backup` y `/dashboard` no aportan a la aceptación |
| Ejercicio agregado a media sesión (SPEC §13.1) | Solo la sesión de hoy; la rutina no se modifica | Probar un ejercicio no debe reescribir el plan; para adoptarlo está `/routines` |
| Aviso de descanso (SPEC §13.2) | Automático tras cada serie efectiva si el ejercicio tiene `target_rest_seconds`; cancelable con un botón; sin objetivo no hay aviso | Fricción cero; el timer no exige toques |
| Catálogo base (SPEC §13.3) | Seed de ~50 ejercicios clásicos en español, vía migración (`user_id NULL`, `is_custom = false`) | Cubre el uso típico sin ahogar el buscador; lo raro se crea como propio |
| Máquina de estados | Estado de sesión persistido en SQLite (`bot_sessions`) + callback-data tipada; `@grammyjs/conversations` SOLO para el wizard de `/routines` | La captura es un teclado persistente editado in-place que debe sobrevivir reinicios; conversations es para diálogos lineales y ahí sí se usa |

## Arquitectura

### `packages/db` — lo nuevo

**Repositorios** (`src/repositories/`): `users`, `exercises`, `routines` (incluye días y
ejercicios de rutina), `workouts`, `sets`, `processed-updates`, `bot-sessions`. Funciones
sobre `DatabaseSync` con statements preparados; mapean filas a tipos de dominio de `core`
donde aplica. Sin lógica de negocio.

**Migración 0001** con dos partes:

1. Tabla `bot_sessions`:

```
bot_sessions
  user_id             INTEGER PK, FK → users.id
  workout_id          INTEGER NOT NULL, FK → workouts.id
  chat_id             INTEGER NOT NULL
  message_id          INTEGER NULL          -- mensaje activo; NULL hasta el primer render
  current_exercise_id INTEGER NULL, FK → exercises.id  -- NULL = eligiendo ejercicio
  pending_weight_kg   REAL NULL             -- lo que registraría ↻
  pending_reps        INTEGER NULL
  next_set_is_warmup  INTEGER (bool) NOT NULL DEFAULT 0
  ephemeral_message_id  INTEGER NULL        -- mensaje transitorio vivo (error o aviso de
                                            -- descanso); a lo sumo uno, se borra al
                                            -- registrar la siguiente serie o en /finish
  updated_at          INTEGER (epoch-ms) NOT NULL
```

Invariante: existe fila en `bot_sessions` ⇔ el usuario tiene un workout activo
(`finished_at IS NULL`). Se crea en `/start`, se borra en `/finish`.

2. Seed del catálogo: ~50 ejercicios clásicos (barra, mancuerna, polea, máquina y peso
corporal repartidos entre los 17 grupos del enum), nombres en español. La lista exacta se
fija en el plan de implementación.

### `apps/server` — el proceso

```
apps/server/src/
  main.ts               # wiring: config → openDatabase + runMigrations → bot.start(); SIGTERM
  config.ts             # parseo de env, tipado y con defaults
  services/
    session-service.ts  # orquesta captura: start/resume, registrar serie, finish (transacciones)
    exercise-match.ts   # matching de nombres (case-insensitive, substring) para texto y /last
  bot/
    bot.ts              # instancia grammY, orden de middlewares
    dedup.ts            # middleware processed_updates
    auth.ts             # middleware ALLOWED_TELEGRAM_IDS + alta de usuario en /start
    capture.ts          # handlers del flujo de captura (callbacks + texto)
    session-view.ts     # render puro: estado de sesión → { text, keyboard }
    routines-wizard.ts  # /routines con @grammyjs/conversations
    last.ts             # /last
    texts.ts            # TODOS los textos en español, centralizados
```

Regla SPEC §3: los handlers son adaptadores delgados. `session-service` coordina repos +
funciones de `core`; no calcula nada que `core` sepa calcular.

### Configuración (env)

| Variable | Default | Notas |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — (obligatoria; sin ella el proceso truena al arrancar con mensaje claro) | |
| `ALLOWED_TELEGRAM_IDS` | — (obligatoria) | ids separados por comas |
| `TIMEZONE` | zona del sistema (`Intl.DateTimeFormat().resolvedOptions().timeZone`) | IANA; se copia a `users.timezone` al crear el usuario |
| `DB_PATH` | ruta estándar del SO (`%APPDATA%\gym-tracker\gym-tracker.db`, `~/.local/share/gym-tracker/`, `~/Library/Application Support/gym-tracker/`) | el directorio se crea si no existe |

Sin dotenv: Node 24 soporta `--env-file` y en desarrollo basta un script. Dependencias
nuevas de la fase: `grammy` y `@grammyjs/conversations` (ambas mandatadas por SPEC §3);
ninguna otra.

## Flujo de captura

### Estados

El estado es implícito en `bot_sessions`:

1. **Eligiendo día** — no hay fila aún; `/start` muestra días de la rutina activa +
   "Entrenar libre". Al elegir se crea workout (con `day_name_snapshot` si aplica) y fila
   de sesión.
2. **Eligiendo ejercicio** — `current_exercise_id IS NULL`: lista del día con ✓ en
   completados + "➕ Otro ejercicio".
3. **En ejercicio** — `current_exercise_id` fijado: el mensaje activo muestra referencia
   de la última sesión, series de hoy y el teclado de captura.

### Mensaje activo (único, editado con `editMessageText`)

```
🏋️ Empuje · 5 series · 1,240 kg

▸ Press banca inclinado
  Última vez: 60×8 · 60×8 · 57.5×9
  Hoy: 60×8 ✓ 60×8 ✓

[      ↻ Registrar 60×8      ]
[ -2.5 ][ +2.5 ][ -1rep ][ +1rep ]
[ 🔥 Calent. ][ ☰ Ejercicios ]
```

- `↻` registra la serie con los valores pendientes (1 toque). Pendientes iniciales = la
  última serie de ese ejercicio (histórico; si no hay, hoy; si no, vacío y `↻` se oculta
  hasta que llegue texto libre).
- `±2.5` kg y `±1` rep ajustan pendientes y re-renderizan (ajuste + registro = 2 toques).
- `🔥` marca la siguiente serie como calentamiento (toggle; el botón muestra estado).
- Texto libre siempre disponible: `60x8`, `32,5x10 rpe8` (parser de `core`). El bot
  registra, **borra el mensaje del usuario** (chat limpio) y re-renderiza. Si trae nombre
  (`press inclinado 60x8`): match contra los ejercicios del día vía `exercise-match`; con
  match único cambia de ejercicio y registra; ambiguo o sin match → error, no registra.
- `☰ Ejercicios` vuelve al estado 2. "➕ Otro ejercicio" abre búsqueda por texto en el
  catálogo + propios; elegirlo lo incorpora **solo al workout de hoy** (§13.1).
- Aviso de descanso: tras registrar serie efectiva en un ejercicio con
  `target_rest_seconds`, se programa `setTimeout` en memoria y el teclado muestra
  `⏱ 90s ✕` (cancelar). Al disparar, el bot envía un mensaje breve cuyo id se guarda en
  `ephemeral_message_id` (se borra al registrar la siguiente serie o en `/finish`).
  Best-effort: un reinicio pierde el timer pendiente, nunca la sesión.
- `/finish`: cierra el workout (`finished_at`), borra la fila de sesión, edita el mensaje
  activo al resumen final (series efectivas, tonelaje `sessionTonnage`, duración, y
  récords por ejercicio vía `detectPersonalRecord` con su 1RM nuevo vs. anterior) y
  elimina el teclado.

### Callback data

Namespace corto y tipado, parseado en un solo lugar (`capture.ts`):
`day:<routineDayId>` · `free` · `ex:<exerciseId>` · `rec` · `w+` `w-` `r+` `r-` · `wu` ·
`list` · `add` · `rest:cancel`. Callback de un teclado obsoleto (sesión ya cerrada) →
`answerCallbackQuery` con "Sesión terminada. Usa /start." y sin efecto.

## `/routines` mínimo (wizard con conversations)

`/routines` lista rutinas propias con "➕ Nueva rutina". Crear (conversación lineal):

1. Nombre de la rutina.
2. Días: un nombre por mensaje ("Empuje", "Pierna"…), botón "Listo" para cerrar.
3. Por día: búsqueda de ejercicios por texto (matches como botones inline), con
   "➕ Crear ejercicio propio" (nombre → grupo muscular elegido del enum de 17 con
   etiquetas en español). Tras elegir un ejercicio: opcionalmente series objetivo, rango
   de reps y descanso objetivo — o "Saltar" (quedan NULL).
4. Al terminar: si es la primera rutina del usuario, se marca `is_active`.

Sin editar, reordenar, duplicar ni archivar en esta fase (dashboard, Fase 3). Si ya hay
rutinas, `/routines` también permite marcar cuál es la activa.

## `/last <texto>`

Match contra catálogo + propios (mismo `exercise-match`). Único → series de las últimas 3
sesiones de ese ejercicio (fecha local, peso×reps, RPE si hay) + mejor 1RM estimado
histórico (`core`). Ambiguo → lista de candidatos como botones. Sin match → sugerencia de
crear con `/routines`.

## Robustez

- **Dedup**: middleware temprano que hace `INSERT` de `update_id` en `processed_updates`;
  conflicto de PK ⇒ update ya visto ⇒ se descarta sin efectos.
- **Atomicidad**: registrar una serie = una transacción (insert en `sets` + update de
  `bot_sessions`); `/finish` = una transacción (update workout + delete sesión).
- **Autorización**: update cuyo `from.id` no está en `ALLOWED_TELEGRAM_IDS` se ignora
  (log a stdout). Primer `/start` de un id permitido crea la fila en `users` con
  `TIMEZONE`.
- **Validación de frontera** (precaución heredada de la revisión de Fase 0): el servicio
  rechaza `reps < 1` o `weight_kg ≤ 0` antes de insertar; la tabla no tiene esos CHECK.
- **Reanudación**: `/start` con sesión viva la retoma y re-renderiza; si el mensaje
  activo ya no es editable (borrado/antiguo), envía uno nuevo y actualiza `message_id`.
- **Errores al usuario**: de botón → toast de `answerCallbackQuery`; de texto → respuesta
  breve en español cuyo id se guarda en `ephemeral_message_id` (reemplaza y borra al
  transitorio anterior si lo hay) y se borra en el siguiente registro exitoso y en
  `/finish`.
- **Apagado**: `SIGTERM`/`SIGINT` → `bot.stop()` (cierra polling) y `db.close()`.

## Manejo de errores (contrato)

- Entrada de usuario inválida nunca tira el proceso: parser de `core` devuelve razones;
  `texts.ts` las traduce al español.
- Errores de la API de Telegram en el render (p. ej. "message is not modified") se
  capturan y se ignoran selectivamente; cualquier otro error se loguea a stdout y
  responde un mensaje genérico.
- Config inválida (token ausente, timezone IANA inválida, ids malformados) → el proceso
  termina al arrancar con mensaje claro, antes de tocar Telegram.

## Testing (SPEC §10)

- **Fixtures del bot** (suite de regresión): updates de Telegram guardados como JSON
  (mensajes, callback_queries) ejecutados contra el bot real con `bot.handleUpdate()` y
  el transporte API sustituido por un transformer que captura cada llamada saliente.
  Asserts sobre (a) el estado en SQLite `:memory:` y (b) las llamadas capturadas (qué
  texto/teclado se envió o editó). Flujos mínimos: sesión completa con rutina;
  entrenamiento libre; texto libre válido e inválido; `update_id` duplicado no duplica
  serie; reanudación tras "reinicio" (nueva instancia de bot, misma DB); usuario no
  autorizado ignorado; serie de calentamiento; récord anunciado en `/finish`; ejercicio
  agregado solo a la sesión.
- **Repos**: integración contra `:memory:` (CRUD por repo; el seed del catálogo existe y
  tiene grupos válidos tras migrar).
- **Servicios**: unitarios con DB en memoria (transacciones, validación de frontera,
  invariante sesión⇔workout activo).

## Fuera de alcance de la Fase 1

`/dashboard` y `/backup`; API HTTP y dashboard web (Fase 3); instalador, servicio del
sistema, healthcheck y respaldo automático (Fase 4); webhook, CSV y binario único
(Fase 5); edición/reordenado/duplicado/archivado de rutinas (Fase 3); persistencia de
timers de descanso entre reinicios.
