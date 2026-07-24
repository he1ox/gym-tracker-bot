# Decisiones técnicas

Registro del porqué. El qué vive en `SPEC.md`; el diseño de cada fase en `docs/superpowers/specs/`.

## 2026-07-23 — Fase 0

- **"Semana" = semana calendario ISO (lunes–domingo) en la zona horaria del usuario**, para
  volumen, estancamiento y comparaciones. Una sola noción consistente y testeable; es como
  piensa el usuario de gimnasio. (Aprobado en brainstorming.)
- **Estancamiento con umbral configurable** (`weeks`, default 3): ≥ N semanas ISO entrenadas
  posteriores a la semana del récord sin superarlo estrictamente. Igualar no renueva el récord.
- **`muscle_group` es un enum fijo de 17 grupos** con granularidad (deltoides y espalda
  separados). Texto libre fragmentaría la analítica.
- **1RM de un single = el peso levantado**; Epley solo para reps ≥ 2. Epley con reps=1
  sobreestima un 3.3% algo que ya es una repetición máxima real.
- **Sin librería de fechas en `core`**: `Intl.DateTimeFormat` nativo para convertir UTC a fecha
  local. Cero dependencias de runtime (SPEC §12: árbol mínimo).
- **Node ≥ 23.4 aunque SPEC dice 22+**: `node:sqlite` requiere flag experimental antes de
  23.4. Recomendado Node 24 LTS. Sigue siendo "Node 22+" en espíritu (22 quedó atrás).
- **Runner de migraciones propio sobre `node:sqlite`** que aplica el SQL generado por
  drizzle-kit (leyendo `meta/_journal.json`). El soporte de driver `node:sqlite` en
  drizzle-orm no está garantizado y el runner propio es trivial, auditable y sin deps extra.
- **PKs enteros autoincrementales** (SQLite local, un escritor) y **timestamps epoch-ms UTC**;
  la zona horaria vive en `users.timezone` (IANA).
- **`detectStagnation` no recibe `now`**: el diseño lo listaba, pero el algoritmo solo cuenta
  semanas presentes en los datos; un parámetro sin uso es superficie de confusión.
- **Supresión dirigida del `ExperimentalWarning` de `node:sqlite` en los tests** (vía
  `--disable-warning=ExperimentalWarning` en los workers de Vitest): en Node 24 el módulo ya
  no exige flag pero sigue emitiendo el warning; silenciarlo de forma dirigida mantiene la
  salida de tests limpia sin ocultar otros warnings.

## 2026-07-24 — Fase 1

- **`grammy`** como framework del bot (mandado por SPEC §3). Único cliente de la API de
  Telegram; long polling; `InlineKeyboard` y transformers para el testing de fixtures.
- **Estado de sesión en SQLite (`bot_sessions`), no en memoria de grammY**: el flujo de
  captura es un teclado persistente editado in-place que debe sobrevivir reinicios.
  `@grammyjs/conversations` se reserva para el wizard lineal de `/routines`.
- **`callback-data.ts` separado de `capture.ts`**: builders sin ciclos, importables por
  `session-view` y `capture`. Sigue siendo un único parser (`parseCallback`).
- **Usuario creado en el primer contacto permitido**, no en `/start`**: el middleware `auth` crea
  la fila en la BD la primera vez que un id autorizado toca cualquier update (callback, comando,
  etc.). Idempotente y garantiza que `ctx.user` nunca es undefined en handlers posteriores.
- **`@grammyjs/conversations`** para el wizard lineal de `/routines` (mandado por SPEC §3);
  motor de replay, todos los efectos vía `conversation.external`.
- **`routineWizard` tipa su `ctx` interior como `Context` (grammY base), no `CustomContext`**:
  el motor de replay rehidrata el contexto en cada `wait`/resume sin pasarlo por los
  middlewares exteriores (`auth`, `conversations()`), así que nunca lleva `.user` ni
  `.conversation` poblados; tiparlo como `CustomContext` compilaría pero mentiría sobre el
  runtime. `userId` se captura una única vez con `conversation.external((outerCtx) => ...)`,
  usando el ctx EXTERIOR (con `.user`) que ese callback sí recibe.
- **`createConversation(..., { plugins: [...] })` reenvía los transformers de `bot.api` al
  `ctx.api` que el wizard rehidrata en cada replay**: `@grammyjs/conversations` construye una
  `Api` nueva por replay a partir de `token`+`options` (ver `hydrateContext` en su
  `plugin.js`) y no copia los transformers instalados con `bot.api.config.use(...)`, a
  diferencia de `Bot.handleUpdate` (que sí los copia explícitamente, comentario "configure it
  with the same transformers as bot.api" en `grammy/out/bot.js`). Sin este reenvío, cualquier
  llamada a la API hecha desde dentro del wizard (p. ej. `ctx.reply`) escapa a la red real —
  en los tests de `routines-wizard.test.ts` fallaba con `404 Not Found` contra Telegram. El
  `plugins` es una lista de middleware que corre en el `ctx` rehidratado antes de cada paso
  del wizard; no depende de nada test-only, así que también aplica en producción a
  transformers legítimos (rate limiting, logging) sin cambiar el comportamiento cuando no hay
  ninguno instalado.
