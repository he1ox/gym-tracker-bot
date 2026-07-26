# Bienvenida y descubribilidad del bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que quien abra el bot por primera vez entienda qué hace y cómo se usa sin escribir nada, y que quien ya lo usa vea su progreso de los últimos 30 días al abrirlo.

**Architecture:** Dos funciones puras nuevas en `packages/core` (ventanas de 30 días y fronteras de día local), dos consultas nuevas en `packages/db` sin migraciones, un servicio que calcula las fronteras y une ambas capas, y un módulo de bot `welcome.ts` con render puro al estilo de `session-view.ts`. Los tres botones secundarios de la bienvenida no inventan pantalla: reutilizan el selector de día, la lista de rutinas y el selector de ejercicios por grupo que ya existen. El flujo de captura no se toca.

**Tech Stack:** TypeScript estricto (ESM), grammY 1.45, `@grammyjs/conversations` 2.1, `node:sqlite`, Vitest 4, pnpm workspaces.

## Global Constraints

- **Node 24** (mínimo 23.4.0), **pnpm 11.x**. `.npmrc` con `engine-strict=true`.
- **Sin dependencias nuevas.** Todo con la librería estándar y lo ya instalado. Si crees necesitar un paquete, para y pregunta al autor (SPEC §12).
- **Sin cambios de esquema ni migraciones.** Nada nuevo en `packages/db/src/schema.ts` ni en `packages/db/drizzle/`.
- **`packages/core` no importa nada de grammY, Hono, Drizzle ni del navegador** (SPEC §3). Solo funciones puras sobre tipos propios.
- **`packages/core` no consulta el reloj.** `buildOverview` recibe las fronteras ya calculadas; quien mira `Date.now()` es el servicio.
- **Idioma:** identificadores, nombres de archivo y comentarios de código **en inglés**; textos de interfaz **en español**; mensajes de commit **en inglés** (Conventional Commits con ámbito, p. ej. `feat(server):`).
- **Todo texto de interfaz vive en `apps/server/src/bot/texts.ts`** (objeto `T`). Nunca literales en español repartidos por los handlers.
- **TypeScript estricto** con tres opciones que cambian cómo se escribe el código a diario:
  - `noUncheckedIndexedAccess` — `arr[0]` es `T | undefined`; hay que comprobarlo o usar `as T` con una razón.
  - `exactOptionalPropertyTypes` — a `rpe?: number` no se le asigna `undefined`; se omite la clave.
  - `verbatimModuleSyntax` — las importaciones de solo-tipo van con `import type`.
- **Los tests viven junto al código** (`foo.ts` → `foo.test.ts`), no en un árbol `__tests__`.
- **TDD:** en cada tarea el test se escribe primero, se ve fallar, y solo entonces se implementa.
- **Zona horaria por parámetro.** En el server sale de `config.timezone` (`apps/server/src/config.ts`), igual que en `/last`. Nunca literales repartidos ni `Intl.DateTimeFormat().resolvedOptions()` dentro de un handler.
- **`parse_mode: 'HTML'` solo en `welcome.ts`.** Es el primer sitio del bot que lo usa. Todo lo que venga de fuera del código (nombre de usuario, nombre de ejercicio) pasa por `escapeHtml` antes de entrar en el mensaje.
- **Suite en verde antes de cada commit.** `pnpm test && pnpm typecheck`.

**Baseline de la suite al empezar:** 276 tests en 43 archivos (209 en `node`, 67 en `web`). Ojo: `CONTRIBUTING.md` §3 dice hoy «211 tests en 42 archivos», que está desactualizado. Se corrige en la Tarea 8 con los números reales de después del cambio.

---

## Decisiones que resuelven ambigüedades del spec

Ambas consultadas y aprobadas por el autor antes de escribir este plan.

### D1 — El toque extra para empezar a entrenar: gana la letra de §3 y §7

El spec se contradice: §3 y §7 hacen que empezar cueste un toque más que hoy (`/start` → bienvenida → `▶️ Empezar` → día), mientras que §12 pide «el mismo número de toques que hoy».

**Decisión del autor: se implementa §3 y §7 tal como están escritos.** La bienvenida es una pantalla propia con el botón `▶️ Empezar entrenamiento`, que edita ese mensaje y lo convierte en el selector de día. Se acepta conscientemente el toque adicional. La frase de §12 sobre el número de toques queda como aspiración no cumplida, no como criterio de bloqueo.

### D2 — Pulsar un día con un entrenamiento ya en curso

Con un entrenamiento a medias se puede llegar a la bienvenida por `/help` → `‹ Volver` → `▶️ Empezar`. Hoy, pulsar un día con sesión activa cae en `capture.ts:224-228` y **no hace nada**: `answerCallbackQuery()` sin texto y a otra cosa. Es un callejón sin salida que ya existe.

**Decisión del autor: repintar el entrenamiento en curso.** El mensaje pulsado pasa a ser *el* mensaje activo de la sesión, el anterior se borra (SPEC §6: un solo mensaje activo por sesión) y se pinta la vista de la sesión, igual que hace `/start`. Se implementa en la Tarea 7.

### D3 — El saludo también se escapa (extensión del spec §3)

El spec pide escapar solo el nombre del ejercicio de `Más pesado`. Pero `parse_mode: 'HTML'` se aplica al **mensaje entero**, y el saludo lleva `ctx.from.first_name`, que es texto arbitrario que el usuario controla desde su perfil de Telegram. Un nombre con `<` rompería el mensaje o, peor, Telegram devolvería `can't parse entities` y el `/start` fallaría.

**Se escapa todo lo interpolado**: el nombre del saludo y el nombre del ejercicio. Hay un test para cada uno.

### D4 — `Más pesado` no usa `formatTonnage`

El spec §3 dice que los millares se separan «reutilizando `formatTonnage`». `formatTonnage` **redondea a entero** (`session-view.ts:55`), lo cual está bien para tonelaje y conteos, pero convertiría un `Más pesado` de 62.5 kg en «63 kg», que es un dato falso sobre una serie concreta.

**`Más pesado` usa `formatWeight`** (`session-view.ts:53`, `String(kg)`), que es lo que ya usa el resto del bot para pesos de serie. El resto de cifras sí usan `formatTonnage`. Nadie levanta 1.000 kg en una serie, así que la falta de separador de millares ahí es irrelevante.

### D5 — `buildDayOptions` vive en `session-service.ts`, no en `capture.ts`

El spec §10 dice extraer `buildDayOptions(db, userId)` *de* `capture.ts` para compartirla con `wc:s`. Si se queda exportada en `capture.ts` se crea un **ciclo de importación**: `capture.ts` necesita `sendWelcome` de `welcome.ts`, y `welcome.ts` necesitaría `buildDayOptions` de `capture.ts`.

**Se extrae a `apps/server/src/services/session-service.ts`**, junto a `buildSessionView`, que es donde ya viven las lecturas de base de datos que arman modelos de vista (SPEC §3: el bot es un adaptador delgado). `capture.ts` y `welcome.ts` la importan de ahí. Sin ciclo.

### D6 — El espacio `wc:` no pasa por `parseCallback`

`parseCallback` existe porque `capture.ts` engancha un `bot.on('callback_query:data')` que atiende **todo** y tiene que despachar a mano. Los handlers de `wc:*` se registran **antes** que ese catch-all, así que pueden usar los filtros por cadena exacta de grammY (`bot.callbackQuery(CB.wcStart, …)`), como ya hace `registerRoutines` con `'newroutine'`.

Las cinco constantes sí viven en `callback-data.ts` (fuente única de las cadenas, como pide §10), pero **`parseCallback` no se amplía**: un `wc:*` que llegase hasta él sería un error de orden de registro, y devolver `unknown` es el comportamiento correcto. Hay un test que lo fija.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `packages/core/src/local-day.ts` | **(nuevo)** `startOfLocalDay`: epoch de las 00:00 locales | 1 |
| `packages/core/src/local-day.test.ts` | **(nuevo)** Cambios de horario y desfases de media hora | 1 |
| `packages/core/src/overview.ts` | **(nuevo)** `percentChange`, `overviewTotals`, `buildOverview` | 2 |
| `packages/core/src/overview.test.ts` | **(nuevo)** Reparto entre ventanas, empates, ventana vacía | 2 |
| `packages/core/src/index.ts` | *(modificado)* Reexporta los dos módulos nuevos | 1, 2 |
| `packages/db/src/repositories/sets.ts` | *(modificado)* `listEffectiveSetsBetween` | 3 |
| `packages/db/src/repositories/workouts.ts` | *(modificado)* `listWorkoutStartsBetween` | 3 |
| `apps/server/src/bot/callback-data.ts` | *(modificado)* Constantes del espacio `wc:` | 4 |
| `apps/server/src/bot/texts.ts` | *(modificado)* Copy de bienvenida, cabeceras de métricas y ayuda | 4 |
| `apps/server/src/bot/welcome.ts` | **(nuevo)** `escapeHtml`, `renderWelcome`, `renderHelp`; luego `registerWelcome` y `setBotCommands` | 4, 7, 8 |
| `apps/server/src/services/overview-service.ts` | **(nuevo)** Fronteras + lectura de BD + `buildOverview` | 5 |
| `apps/server/src/services/session-service.ts` | *(modificado)* `buildDayOptions` (ver D5) | 6 |
| `apps/server/src/bot/routines-wizard.ts` | *(modificado)* Se extrae `renderRoutinesList` | 6 |
| `apps/server/src/bot/capture.ts` | *(modificado)* `handleStart` → bienvenida; repintado con sesión activa | 7 |
| `apps/server/src/bot/bot.ts` | *(modificado)* `registerWelcome` entre `registerLast` y `registerCapture` | 7 |
| `apps/server/src/bot/flows.test.ts` | *(modificado)* Regresión de los flujos nuevos | 7 |
| `apps/server/src/main.ts` | *(modificado)* `setBotCommands` dentro de `onStart`, con `catch` que loguea | 8 |
| `CONTRIBUTING.md` | *(modificado)* Cifra de referencia de la suite | 8 |

Cada tarea deja la suite entera en verde antes de commitear.

---

### Task 1: Fronteras de día en la zona horaria del usuario

La pieza con más aristas del diseño (spec §8.2). Va primero porque es pura, independiente de todo lo demás y `weeks.ts` no sirve: `isoWeekKey` lee las partes locales pero nunca reconstruye un epoch, que es justo lo que hace falta.

**Files:**
- Create: `packages/core/src/local-day.ts`
- Test: `packages/core/src/local-day.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `startOfLocalDay(instant: Date, timeZone: string): number` — epoch en milisegundos de las 00:00 locales del día que contiene `instant`.

- [ ] **Step 1: Escribe el test que falla**

Crea `packages/core/src/local-day.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { startOfLocalDay } from './local-day';

// Helper de lectura: la hora local de un epoch, para afirmar sobre lo que ve el usuario.
function localTime(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(epochMs));
}

describe('startOfLocalDay', () => {
  it('returns the same instant for UTC midnight in UTC', () => {
    const midnight = Date.UTC(2026, 6, 25);
    expect(startOfLocalDay(new Date(midnight), 'UTC')).toBe(midnight);
    expect(startOfLocalDay(new Date(midnight + 23 * 3_600_000), 'UTC')).toBe(midnight);
  });

  it('keeps a 23:50 set inside its own local day (America/Mexico_City)', () => {
    const tz = 'America/Mexico_City'; // UTC-6 fijo desde 2022
    // 2026-07-25 23:50 local = 2026-07-26 05:50 UTC
    const lateNight = Date.UTC(2026, 6, 26, 5, 50);
    const start = startOfLocalDay(new Date(lateNight), tz);
    expect(localTime(start, tz)).toBe('2026-07-25, 00:00');
    expect(start).toBeLessThanOrEqual(lateNight);
    // Y diez minutos después ya es otro día local.
    expect(startOfLocalDay(new Date(lateNight + 20 * 60_000), tz)).toBeGreaterThan(start);
  });

  it('handles a spring-forward day (America/New_York, 2026-03-08)', () => {
    const tz = 'America/New_York'; // 02:00 EST -> 03:00 EDT
    const afternoon = Date.UTC(2026, 2, 8, 19, 0); // 15:00 EDT
    const start = startOfLocalDay(new Date(afternoon), tz);
    expect(localTime(start, tz)).toBe('2026-03-08, 00:00');
    expect(start).toBe(Date.UTC(2026, 2, 8, 5, 0)); // 00:00 EST = 05:00 UTC
  });

  it('handles a fall-back day (America/New_York, 2025-11-02)', () => {
    const tz = 'America/New_York'; // 02:00 EDT -> 01:00 EST
    const afternoon = Date.UTC(2025, 10, 2, 20, 0); // 15:00 EST
    const start = startOfLocalDay(new Date(afternoon), tz);
    expect(localTime(start, tz)).toBe('2025-11-02, 00:00');
    expect(start).toBe(Date.UTC(2025, 10, 2, 4, 0)); // 00:00 EDT = 04:00 UTC
  });

  it('handles a half-hour offset zone (Asia/Kolkata)', () => {
    const tz = 'Asia/Kolkata'; // UTC+5:30 fijo
    const start = startOfLocalDay(new Date(Date.UTC(2026, 2, 15, 10, 0)), tz);
    expect(localTime(start, tz)).toBe('2026-03-15, 00:00');
    expect(start).toBe(Date.UTC(2026, 2, 14, 18, 30));
  });

  it('starts the day at 01:00 when the DST jump deletes local midnight (America/Santiago)', () => {
    const tz = 'America/Santiago'; // 2025-09-07: 00:00 -> 01:00, las 00:00 no existen
    const start = startOfLocalDay(new Date(Date.UTC(2025, 8, 7, 18, 0)), tz);
    expect(localTime(start, tz)).toBe('2025-09-07, 01:00');
  });

  it('is idempotent: the start of a day is its own start of day', () => {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Kolkata', 'Europe/Madrid']) {
      const start = startOfLocalDay(new Date(Date.UTC(2026, 2, 8, 19, 0)), tz);
      expect(startOfLocalDay(new Date(start), tz)).toBe(start);
    }
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `pnpm vitest run packages/core/src/local-day.test.ts`
Expected: FAIL con `Failed to resolve import "./local-day"`.

- [ ] **Step 3: Implementa `startOfLocalDay`**

Crea `packages/core/src/local-day.ts`:

```ts
interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// `hourCycle: 'h23'` y NO `hour12: false`: si `hour12` está presente, `hourCycle`
// se ignora y la medianoche puede salir como "24" en vez de "00".
function partsIn(instant: number, timeZone: string): LocalParts {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));

  const read = (type: string): number => {
    const part = formatted.find((p) => p.type === type);
    if (part === undefined) {
      throw new Error(`Could not read ${type} for timezone ${timeZone}`);
    }
    return Number(part.value);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

// Las partes locales leídas como si fueran UTC. Es un instante ficticio, útil solo
// para restar: la diferencia con el instante real es el desfase de la zona.
function localAsUtc(instant: number, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

// Desfase de la zona respecto a UTC, en ms, EN ESE INSTANTE (no es constante:
// cambia con el horario de verano). Se truncan los milisegundos porque
// formatToParts no los devuelve y falsearían la resta.
function offsetMsAt(instant: number, timeZone: string): number {
  return localAsUtc(instant, timeZone) - Math.floor(instant / 1000) * 1000;
}

/**
 * Epoch en milisegundos de las 00:00 locales del día que contiene `instant`.
 *
 * Dos pasadas: la primera usa el desfase del propio `instant`, que en un día de
 * cambio de horario puede no ser el de las 00:00 de ese día; la segunda corrige
 * usando el desfase del candidato.
 */
export function startOfLocalDay(instant: Date, timeZone: string): number {
  const time = instant.getTime();
  const p = partsIn(time, timeZone);
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);

  const first = midnightAsUtc - offsetMsAt(time, timeZone);
  const second = midnightAsUtc - offsetMsAt(first, timeZone);

  // La segunda pasada es la buena salvo cuando el adelanto de horario BORRA las
  // 00:00 locales (Santiago, La Habana: ese día empieza a la 1:00). Ahí ninguna
  // de las dos cae en medianoche y el arranque real del día es la posterior.
  return localAsUtc(second, timeZone) === midnightAsUtc ? second : Math.max(first, second);
}
```

> Limitación conocida, no cubierta por tests: cuando el atraso de horario ocurre
> exactamente a medianoche, las 00:00 locales suceden **dos veces** y esta función
> devuelve la segunda. Son 60 minutos, una vez al año, en un registro personal de
> gimnasio. Déjalo así y no lo compliques.

- [ ] **Step 4: Reexporta desde `core`**

En `packages/core/src/index.ts`, añade la línea junto a las demás (mantén el orden actual, la nueva va detrás de `./weeks`):

```ts
export * from './local-day';
```

- [ ] **Step 5: Ejecuta los tests y comprueba que pasan**

Run: `pnpm vitest run packages/core/src/local-day.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/local-day.ts packages/core/src/local-day.test.ts packages/core/src/index.ts
git commit -m "feat(core): add startOfLocalDay for timezone-anchored day boundaries"
```

---

### Task 2: Agregados de 30 días y variación porcentual

El grueso de la lógica de dominio (spec §8.1). Pura y determinista: recibe las fronteras ya calculadas, nunca mira el reloj.

**Files:**
- Create: `packages/core/src/overview.ts`
- Test: `packages/core/src/overview.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface OverviewSet { createdAt: number; weightKg: number; reps: number; exerciseName: string }`
  - `interface OverviewTotals { workouts: number; effectiveSets: number; reps: number; tonnageKg: number; heaviest: { weightKg: number; exerciseName: string } | null }`
  - `interface OverviewMetric { current: number; previous: number; changePercent: number | null }`
  - `interface Overview { workouts: OverviewMetric; effectiveSets: OverviewMetric; reps: OverviewMetric; tonnageKg: OverviewMetric; heaviest: OverviewMetric & { exerciseName: string | null } }`
  - `percentChange(current: number, previous: number): number | null`
  - `overviewTotals(sets: readonly OverviewSet[], workoutStarts: readonly number[]): OverviewTotals`
  - `buildOverview(input: { sets: readonly OverviewSet[]; workoutStarts: readonly number[]; currentFrom: number; currentTo: number; previousFrom: number }): Overview`

> Nota sobre la firma: el spec escribe `sets: OverviewSet[]`. Aquí es
> `readonly OverviewSet[]` para seguir el estilo de `core` (`deriveRestSeconds` en
> `rest.ts` ya usa `ReadonlyArray`). Un array normal se pasa sin cambios.

- [ ] **Step 1: Escribe el test que falla**

Crea `packages/core/src/overview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type OverviewSet, buildOverview, overviewTotals, percentChange } from './overview';

const DAY = 86_400_000;

// Ventana actual [1000, 1000 + 30*DAY]; anterior [1000 - 30*DAY, 1000).
const CURRENT_FROM = 1000;
const CURRENT_TO = 1000 + 30 * DAY;
const PREVIOUS_FROM = 1000 - 30 * DAY;

function set(createdAt: number, over: Partial<OverviewSet> = {}): OverviewSet {
  return { createdAt, weightKg: 100, reps: 5, exerciseName: 'Sentadilla', ...over };
}

function build(sets: OverviewSet[], workoutStarts: number[] = []) {
  return buildOverview({
    sets,
    workoutStarts,
    currentFrom: CURRENT_FROM,
    currentTo: CURRENT_TO,
    previousFrom: PREVIOUS_FROM,
  });
}

describe('percentChange', () => {
  it('returns null when the previous window is zero: there is nothing to divide by', () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it('reports an improvement as a positive integer', () => {
    expect(percentChange(120, 100)).toBe(20);
  });

  it('reports a worsening as a negative integer', () => {
    expect(percentChange(97, 100)).toBe(-3);
  });

  it('reports equal values as zero', () => {
    expect(percentChange(100, 100)).toBe(0);
  });

  it('rounds to the nearest integer', () => {
    expect(percentChange(1093, 1000)).toBe(9); // 9.3 %
    expect(percentChange(1096, 1000)).toBe(10); // 9.6 %
  });
});

describe('overviewTotals', () => {
  it('adds reps and tonnage over the given sets', () => {
    const totals = overviewTotals([set(1, { weightKg: 60, reps: 8 }), set(2, { weightKg: 100, reps: 5 })], [1]);
    expect(totals.effectiveSets).toBe(2);
    expect(totals.reps).toBe(13);
    expect(totals.tonnageKg).toBe(60 * 8 + 100 * 5);
    expect(totals.workouts).toBe(1);
  });

  it('reports no heaviest set when there are no sets', () => {
    const totals = overviewTotals([], []);
    expect(totals.heaviest).toBeNull();
    expect(totals.tonnageKg).toBe(0);
  });

  it('breaks a tie in the heaviest set with the most recent one', () => {
    const totals = overviewTotals(
      [
        set(100, { weightKg: 140, exerciseName: 'Peso muerto' }),
        set(200, { weightKg: 140, exerciseName: 'Sentadilla' }),
        set(300, { weightKg: 120, exerciseName: 'Press banca' }),
      ],
      [],
    );
    expect(totals.heaviest).toEqual({ weightKg: 140, exerciseName: 'Sentadilla' });
  });

  it('keeps the heavier set even when a lighter one is more recent', () => {
    const totals = overviewTotals(
      [set(100, { weightKg: 140, exerciseName: 'Peso muerto' }), set(999, { weightKg: 60, exerciseName: 'Curl' })],
      [],
    );
    expect(totals.heaviest).toEqual({ weightKg: 140, exerciseName: 'Peso muerto' });
  });
});

describe('buildOverview', () => {
  it('splits sets between the two windows without overlap or gap', () => {
    const overview = build([
      set(PREVIOUS_FROM), // primer instante de la ventana anterior: cuenta
      set(CURRENT_FROM - 1), // último instante de la anterior
      set(CURRENT_FROM), // primer instante de la actual
      set(CURRENT_TO), // último instante de la actual
    ]);
    expect(overview.effectiveSets.previous).toBe(2);
    expect(overview.effectiveSets.current).toBe(2);
  });

  it('ignores sets outside both windows', () => {
    const overview = build([set(PREVIOUS_FROM - 1), set(CURRENT_TO + 1)]);
    expect(overview.effectiveSets.current).toBe(0);
    expect(overview.effectiveSets.previous).toBe(0);
  });

  it('counts workouts with no effective sets at all', () => {
    const overview = build([], [CURRENT_FROM, CURRENT_FROM + DAY, PREVIOUS_FROM]);
    expect(overview.workouts.current).toBe(2);
    expect(overview.workouts.previous).toBe(1);
    expect(overview.effectiveSets.current).toBe(0);
    expect(overview.workouts.changePercent).toBe(100);
  });

  it('reports the heaviest set of the current window with its exercise name', () => {
    const overview = build([
      set(CURRENT_FROM, { weightKg: 140, exerciseName: 'Peso muerto' }),
      set(CURRENT_FROM + DAY, { weightKg: 100, exerciseName: 'Sentadilla' }),
      set(PREVIOUS_FROM, { weightKg: 135, exerciseName: 'Peso muerto' }),
    ]);
    expect(overview.heaviest.current).toBe(140);
    expect(overview.heaviest.previous).toBe(135);
    expect(overview.heaviest.exerciseName).toBe('Peso muerto');
    expect(overview.heaviest.changePercent).toBe(4); // 3.7 % -> 4
  });

  it('gives an all-zero overview with no exercise name for a user with no data', () => {
    const overview = build([]);
    expect(overview.workouts).toEqual({ current: 0, previous: 0, changePercent: null });
    expect(overview.tonnageKg).toEqual({ current: 0, previous: 0, changePercent: null });
    expect(overview.heaviest.current).toBe(0);
    expect(overview.heaviest.exerciseName).toBeNull();
    expect(overview.heaviest.changePercent).toBeNull();
  });

  it('leaves the exercise name null when only the previous window has sets', () => {
    const overview = build([set(PREVIOUS_FROM, { weightKg: 140, exerciseName: 'Peso muerto' })]);
    expect(overview.heaviest.exerciseName).toBeNull();
    expect(overview.heaviest.previous).toBe(140);
    expect(overview.heaviest.current).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `pnpm vitest run packages/core/src/overview.test.ts`
Expected: FAIL con `Failed to resolve import "./overview"`.

- [ ] **Step 3: Implementa `overview.ts`**

Crea `packages/core/src/overview.ts`:

```ts
export interface OverviewSet {
  createdAt: number;
  weightKg: number;
  reps: number;
  exerciseName: string;
}

/** Agregado de UNA ventana. `buildOverview` devuelve las dos ya emparejadas; esto
 *  se exporta para poder testear el agregado por separado. */
export interface OverviewTotals {
  workouts: number;
  effectiveSets: number;
  reps: number;
  tonnageKg: number;
  heaviest: { weightKg: number; exerciseName: string } | null;
}

export interface OverviewMetric {
  current: number;
  previous: number;
  changePercent: number | null;
}

export interface Overview {
  workouts: OverviewMetric;
  effectiveSets: OverviewMetric;
  reps: OverviewMetric;
  tonnageKg: OverviewMetric;
  heaviest: OverviewMetric & { exerciseName: string | null };
}

/** `null` cuando el periodo anterior vale 0: no hay división posible. */
export function percentChange(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

export function overviewTotals(
  sets: readonly OverviewSet[],
  workoutStarts: readonly number[],
): OverviewTotals {
  let reps = 0;
  let tonnageKg = 0;
  let heaviest: { weightKg: number; exerciseName: string } | null = null;
  let heaviestAt = Number.NEGATIVE_INFINITY;

  for (const set of sets) {
    reps += set.reps;
    tonnageKg += set.weightKg * set.reps;
    // Gana el peso mayor; en empate, la serie más reciente (spec §3).
    const wins =
      heaviest === null ||
      set.weightKg > heaviest.weightKg ||
      (set.weightKg === heaviest.weightKg && set.createdAt >= heaviestAt);
    if (wins) {
      heaviest = { weightKg: set.weightKg, exerciseName: set.exerciseName };
      heaviestAt = set.createdAt;
    }
  }

  return { workouts: workoutStarts.length, effectiveSets: sets.length, reps, tonnageKg, heaviest };
}

/**
 * Ventanas `[currentFrom, currentTo]` y `[previousFrom, currentFrom)`: el instante
 * `currentFrom` pertenece solo a la actual, sin solape ni hueco.
 *
 * Recibe únicamente series EFECTIVAS: el filtro de calentamiento lo hace la consulta
 * (`listEffectiveSetsBetween`), no esta función.
 */
export function buildOverview(input: {
  sets: readonly OverviewSet[];
  workoutStarts: readonly number[];
  currentFrom: number;
  currentTo: number;
  previousFrom: number;
}): Overview {
  const inCurrent = (at: number): boolean => at >= input.currentFrom && at <= input.currentTo;
  const inPrevious = (at: number): boolean => at >= input.previousFrom && at < input.currentFrom;

  const current = overviewTotals(
    input.sets.filter((s) => inCurrent(s.createdAt)),
    input.workoutStarts.filter(inCurrent),
  );
  const previous = overviewTotals(
    input.sets.filter((s) => inPrevious(s.createdAt)),
    input.workoutStarts.filter(inPrevious),
  );

  const metric = (currentValue: number, previousValue: number): OverviewMetric => ({
    current: currentValue,
    previous: previousValue,
    changePercent: percentChange(currentValue, previousValue),
  });
  const heaviestKg = (totals: OverviewTotals): number => totals.heaviest?.weightKg ?? 0;

  return {
    workouts: metric(current.workouts, previous.workouts),
    effectiveSets: metric(current.effectiveSets, previous.effectiveSets),
    reps: metric(current.reps, previous.reps),
    tonnageKg: metric(current.tonnageKg, previous.tonnageKg),
    heaviest: {
      ...metric(heaviestKg(current), heaviestKg(previous)),
      exerciseName: current.heaviest?.exerciseName ?? null,
    },
  };
}
```

- [ ] **Step 4: Reexporta desde `core`**

En `packages/core/src/index.ts`, detrás de `export * from './local-day';`:

```ts
export * from './overview';
```

- [ ] **Step 5: Ejecuta los tests y comprueba que pasan**

Run: `pnpm vitest run packages/core/src/overview.test.ts && pnpm --filter @gym-tracker/core typecheck`
Expected: PASS, 15 tests, y el typecheck sin salida.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/overview.ts packages/core/src/overview.test.ts packages/core/src/index.ts
git commit -m "feat(core): add 30-day overview totals and percent change"
```

---

### Task 3: Las dos consultas de la ventana de 60 días

Spec §9. Sin migraciones ni cambios de esquema. Ambas se piden **una sola vez sobre los 60 días completos** y `buildOverview` reparte: una ida a la base de datos y todo el troceo en código puro.

**Files:**
- Modify: `packages/db/src/repositories/sets.ts` (al final del archivo)
- Modify: `packages/db/src/repositories/workouts.ts` (al final del archivo)
- Test: `packages/db/src/repositories/sets.test.ts` (añadir, no borrar lo que hay)
- Test: `packages/db/src/repositories/workouts.test.ts` (añadir, no borrar lo que hay)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface EffectiveSetWithName { createdAt: number; weightKg: number; reps: number; exerciseName: string }` — mismos campos que `OverviewSet` de la Tarea 2, para pasarlo directo sin mapear.
  - `listEffectiveSetsBetween(db: DatabaseSync, params: { userId: number; fromMs: number; toMs: number }): EffectiveSetWithName[]`
  - `listWorkoutStartsBetween(db: DatabaseSync, params: { userId: number; fromMs: number; toMs: number }): number[]`
- Ambas se exportan solas: `packages/db/src/index.ts` ya hace `export * from './repositories/sets'` y `'./repositories/workouts'`. **No toques `index.ts`.**

- [ ] **Step 1: Escribe los tests que fallan**

Añade al final de `packages/db/src/repositories/sets.test.ts` (dentro del archivo, fuera del `describe` existente). Ajusta también la línea de import de `./sets` para incluir `listEffectiveSetsBetween`:

```ts
describe('listEffectiveSetsBetween', () => {
  it('includes both boundaries and excludes what falls outside', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, w.id, { createdAt: 999 });
    add(d, w.id, { createdAt: 1000 });
    add(d, w.id, { createdAt: 2000 });
    add(d, w.id, { createdAt: 2001 });

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 1000, toMs: 2000 });
    expect(rows.map((r) => r.createdAt)).toEqual([1000, 2000]);
  });

  it('excludes warmup sets', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, w.id, { createdAt: 1000, isWarmup: true });
    add(d, w.id, { createdAt: 1100, isWarmup: false });

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdAt).toBe(1100);
  });

  it('isolates by user_id', () => {
    const d = db();
    createUser(d, { telegramUserId: 2, timezone: 'UTC', createdAt: 0 });
    const mine = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    const theirs = createWorkout(d, { userId: 2, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, mine.id, { createdAt: 1000, weightKg: 60 });
    add(d, theirs.id, { createdAt: 1000, weightKg: 200 });

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.weightKg).toBe(60);
  });

  it('joins the exercise name, including a custom one', () => {
    const d = db();
    const own = createCustomExercise(d, { userId: 1, name: 'Curl <martillo> & polea', muscleGroup: 'biceps' });
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, w.id, { createdAt: 1000, exerciseId: own.id });

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 });
    expect(rows[0]?.exerciseName).toBe('Curl <martillo> & polea');
  });
});
```

Ese bloque necesita dos importaciones más en la cabecera del archivo: `createCustomExercise` desde `./exercises` y `createUser` ya está importado desde `./users`.

Añade al final de `packages/db/src/repositories/workouts.test.ts`, ajustando su import de `./workouts` para incluir `listWorkoutStartsBetween`:

```ts
describe('listWorkoutStartsBetween', () => {
  it('includes both boundaries and excludes what falls outside', () => {
    const d = db();
    for (const startedAt of [999, 1000, 2000, 2001]) {
      createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt });
    }
    expect(listWorkoutStartsBetween(d, { userId: 1, fromMs: 1000, toMs: 2000 })).toEqual([1000, 2000]);
  });

  it('counts unfinished workouts too', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 1500 });
    expect(w.finishedAt).toBeNull();
    expect(listWorkoutStartsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 })).toEqual([1500]);
  });

  it('isolates by user_id', () => {
    const d = db();
    createUser(d, { telegramUserId: 2, timezone: 'UTC', createdAt: 0 });
    createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 1000 });
    createWorkout(d, { userId: 2, routineDayId: null, dayNameSnapshot: null, startedAt: 1000 });
    expect(listWorkoutStartsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 })).toHaveLength(1);
  });
});
```

Comprueba antes cómo se llama el helper de base de datos en `workouts.test.ts` (en `sets.test.ts` es `db()`); si allí se llama distinto, usa el suyo en vez de `db()`. Si `workouts.test.ts` no crea un segundo usuario, importa `createUser` desde `./users`.

- [ ] **Step 2: Ejecuta los tests y comprueba que fallan**

Run: `pnpm vitest run packages/db/src/repositories/sets.test.ts packages/db/src/repositories/workouts.test.ts`
Expected: FAIL, `listEffectiveSetsBetween is not a function` / `listWorkoutStartsBetween is not a function` (o error de import).

- [ ] **Step 3: Implementa las dos consultas**

Al final de `packages/db/src/repositories/sets.ts`:

```ts
/** Misma forma que `OverviewSet` de `@gym-tracker/core`, para pasarlo sin mapear. */
export interface EffectiveSetWithName {
  createdAt: number;
  weightKg: number;
  reps: number;
  exerciseName: string;
}

/**
 * Series efectivas (`is_warmup = 0`) del usuario en `[fromMs, toMs]`, ambos
 * inclusive, con el nombre del ejercicio ya unido. Se pide una sola vez sobre los
 * 60 días completos; el reparto entre ventanas lo hace `buildOverview`.
 */
export function listEffectiveSetsBetween(
  db: DatabaseSync,
  params: { userId: number; fromMs: number; toMs: number },
): EffectiveSetWithName[] {
  const rows = db
    .prepare(
      `SELECT s.created_at, s.weight_kg, s.reps, e.name AS exercise_name
         FROM sets s
         JOIN workouts w ON w.id = s.workout_id
         JOIN exercises e ON e.id = s.exercise_id
        WHERE w.user_id = ? AND s.is_warmup = 0 AND s.created_at >= ? AND s.created_at <= ?
        ORDER BY s.created_at`,
    )
    .all(params.userId, params.fromMs, params.toMs) as unknown as Array<{
    created_at: number;
    weight_kg: number;
    reps: number;
    exercise_name: string;
  }>;
  return rows.map((r) => ({
    createdAt: r.created_at,
    weightKg: r.weight_kg,
    reps: r.reps,
    exerciseName: r.exercise_name,
  }));
}
```

Al final de `packages/db/src/repositories/workouts.ts`:

```ts
/**
 * `started_at` de los entrenamientos del usuario en `[fromMs, toMs]`, ambos
 * inclusive. Incluye los no terminados: un entrenamiento cuenta por haber
 * empezado, tenga o no series efectivas (spec §3).
 */
export function listWorkoutStartsBetween(
  db: DatabaseSync,
  params: { userId: number; fromMs: number; toMs: number },
): number[] {
  const rows = db
    .prepare(
      `SELECT started_at FROM workouts
        WHERE user_id = ? AND started_at >= ? AND started_at <= ?
        ORDER BY started_at`,
    )
    .all(params.userId, params.fromMs, params.toMs) as unknown as Array<{ started_at: number }>;
  return rows.map((r) => r.started_at);
}
```

- [ ] **Step 4: Ejecuta los tests y comprueba que pasan**

Run: `pnpm vitest run packages/db && pnpm --filter @gym-tracker/db typecheck`
Expected: PASS, con 7 tests nuevos.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/sets.ts packages/db/src/repositories/sets.test.ts packages/db/src/repositories/workouts.ts packages/db/src/repositories/workouts.test.ts
git commit -m "feat(db): add windowed queries for effective sets and workout starts"
```

---

### Task 4: Render puro de la bienvenida y de la ayuda

Spec §3 y §5. Sin base de datos y sin Telegram: recibe un modelo y devuelve texto y teclado, igual que `session-view.ts`.

**Files:**
- Modify: `apps/server/src/bot/callback-data.ts` (añadir al objeto `CB`)
- Modify: `apps/server/src/bot/texts.ts` (añadir al final del objeto `T`, antes del cierre)
- Create: `apps/server/src/bot/welcome.ts`
- Test: `apps/server/src/bot/callback-data.test.ts` (añadir, no borrar lo que hay)
- Test: `apps/server/src/bot/welcome.test.ts`

**Interfaces:**
- Consumes: `Overview` de `@gym-tracker/core` (Tarea 2); `formatTonnage` y `formatWeight` de `./session-view`.
- Produces:
  - `CB.wcStart = 'wc:s'`, `CB.wcRoutines = 'wc:r'`, `CB.wcHistory = 'wc:l'`, `CB.wcHelp = 'wc:h'`, `CB.wcBack = 'wc:b'`
  - `escapeHtml(value: string): string`
  - `interface WelcomeModel { firstName: string | null; overview: Overview }`
  - `export interface Rendered { text: string; keyboard: InlineKeyboard }`
  - `renderWelcome(model: WelcomeModel): Rendered`
  - `renderHelp(): Rendered`

- [ ] **Step 1: Escribe el test del espacio `wc:`**

Añade al final de `apps/server/src/bot/callback-data.test.ts`:

```ts
describe('welcome callback space', () => {
  it('keeps the five wc: constants distinct and short', () => {
    const all = [CB.wcStart, CB.wcRoutines, CB.wcHistory, CB.wcHelp, CB.wcBack];
    expect(new Set(all).size).toBe(5);
    for (const data of all) {
      expect(data.startsWith('wc:')).toBe(true);
      expect(Buffer.byteLength(data, 'utf8')).toBeLessThanOrEqual(64);
    }
  });

  it('does not collide with the day:, ex: or pick: spaces', () => {
    for (const data of [CB.wcStart, CB.wcRoutines, CB.wcHistory, CB.wcHelp, CB.wcBack]) {
      // parseCallback es el despachador del catch-all de capture.ts, que se
      // registra DESPUÉS de registerWelcome: un wc: que llegue hasta él es un
      // error de orden de registro, y 'unknown' es la respuesta correcta (D6).
      expect(parseCallback(data)).toEqual({ type: 'unknown' });
    }
  });
});
```

Comprueba que la cabecera de `callback-data.test.ts` importa `CB` además de `parseCallback`; si no, añádelo.

- [ ] **Step 2: Añade las constantes a `callback-data.ts`**

Dentro del objeto `CB` de `apps/server/src/bot/callback-data.ts`, después de `pickSearch`:

```ts
  // Espacio de la bienvenida (spec §10). Estos NO pasan por parseCallback: sus
  // handlers usan los filtros por cadena exacta de grammY y se registran ANTES
  // del catch-all de capture.ts, igual que 'newroutine' en routines-wizard.ts.
  wcStart: 'wc:s',
  wcRoutines: 'wc:r',
  wcHistory: 'wc:l',
  wcHelp: 'wc:h',
  wcBack: 'wc:b',
```

Run: `pnpm vitest run apps/server/src/bot/callback-data.test.ts`
Expected: PASS, con los 2 tests nuevos.

- [ ] **Step 3: Añade el copy a `texts.ts`**

Dentro del objeto `T` de `apps/server/src/bot/texts.ts`, justo antes de la llave de cierre (después de `pickGroupTitle`), añade:

```ts
  // Bienvenida y ayuda (Fase 2 — onboarding).
  // OJO: estos textos se envían con parse_mode: 'HTML'. Las etiquetas de abajo
  // (<b>, <code>) son deliberadas; cualquier '<', '>' o '&' LITERAL que añadas
  // aquí romperá el mensaje. Lo interpolado en tiempo de ejecución se escapa en
  // welcome.ts con escapeHtml, no aquí.
  welcomeIntro: 'Registra tus series desde aquí: elige un día, elige ejercicio y escribe 60x8.',
  overviewTitle: 'Últimos 30 días',
  overviewCompare: 'vs. 30 anteriores',
  overviewWorkouts: 'Entrenamientos',
  overviewSets: 'Series',
  overviewReps: 'Repeticiones',
  overviewTonnage: 'Levantado',
  overviewHeaviest: 'Más pesado',
  overviewNoChange: '—',

  welcomeStartButton: '▶️ Empezar entrenamiento',
  welcomeRoutinesButton: '📋 Mis rutinas',
  welcomeHistoryButton: '📊 Historial',
  welcomeHelpButton: '❓ Cómo funciona',
  welcomeBackButton: '‹ Volver',

  welcomeGreeting(firstName: string | null): string {
    return firstName === null ? '👋 Hola' : `👋 Hola, ${firstName}`;
  },

  helpText: [
    '❓ <b>Cómo funciona</b>',
    '',
    'Este bot registra tus series mientras entrenas. Los datos se guardan en tu propio equipo.',
    '',
    '<b>El flujo</b>',
    '1. <code>/start</code> y elige un día de tu rutina, o entrena libre.',
    '2. Elige el ejercicio: verás lo que hiciste la última vez, para decidir el peso de hoy.',
    '3. Registra cada serie.',
    '4. <code>/finish</code> cierra el entrenamiento y te avisa de los récords.',
    '',
    '<b>Dos formas de registrar, siempre disponibles</b>',
    'Con botones: ajusta con −2.5 / +2.5 / −1 rep / +1 rep y pulsa ↻ Registrar.',
    'Escribiendo, que es más rápido:',
    '<code>60x8</code> — 60 kg por 8 repeticiones',
    '<code>60 x 8</code> — los espacios dan igual',
    '<code>60x8 rpe8</code> — con esfuerzo percibido',
    '<code>sentadilla 100x5</code> — cambia de ejercicio y registra de una vez',
    '',
    '<b>Calentamiento</b>',
    'Pulsa 🔥 Calent. y la siguiente serie no contará en el volumen ni en los récords. Se desactiva sola en cuanto la registras.',
    '',
    '<b>Descanso</b>',
    'Si el ejercicio tiene descanso objetivo en tu rutina, el bot te avisa cuando toca la siguiente serie. El botón ⏱ lo cancela.',
    '',
    '<b>Comandos</b>',
    '<code>/start</code> — inicio y resumen',
    '<code>/finish</code> — terminar el entrenamiento',
    '<code>/routines</code> — mis rutinas',
    '<code>/last</code> — historial de un ejercicio',
    '<code>/help</code> — esta pantalla',
  ].join('\n'),
```

- [ ] **Step 4: Escribe el test que falla**

Crea `apps/server/src/bot/welcome.test.ts`:

```ts
import type { Overview } from '@gym-tracker/core';
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderHelp, renderWelcome } from './welcome';

function metric(current: number, previous: number, changePercent: number | null) {
  return { current, previous, changePercent };
}

const EMPTY: Overview = {
  workouts: metric(0, 0, null),
  effectiveSets: metric(0, 0, null),
  reps: metric(0, 0, null),
  tonnageKg: metric(0, 0, null),
  heaviest: { ...metric(0, 0, null), exerciseName: null },
};

const FULL: Overview = {
  workouts: metric(12, 10, 20),
  effectiveSets: metric(148, 136, 9),
  reps: metric(1184, 1221, -3),
  tonnageKg: metric(58420, 52161, 12),
  heaviest: { ...metric(140, 135, 4), exerciseName: 'Peso muerto' },
};

const datas = (rendered: ReturnType<typeof renderWelcome>): string[] =>
  rendered.keyboard.inline_keyboard.flat().map((b) => ('callback_data' in b ? b.callback_data : ''));

describe('escapeHtml', () => {
  it('escapes the three characters Telegram HTML cares about', () => {
    expect(escapeHtml('Curl <martillo> & polea')).toBe('Curl &lt;martillo&gt; &amp; polea');
  });

  it('escapes ampersands before angle brackets, not after', () => {
    expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;');
  });
});

describe('renderWelcome', () => {
  it('greets by name and shows the four buttons', () => {
    const { text, keyboard } = renderWelcome({ firstName: 'George', overview: FULL });
    expect(text).toContain('👋 Hola, George');
    expect(text).toContain('Registra tus series desde aquí');
    expect(datas({ text, keyboard })).toEqual(['wc:s', 'wc:r', 'wc:l', 'wc:h']);
  });

  it('drops the name when Telegram gives none', () => {
    const { text } = renderWelcome({ firstName: null, overview: FULL });
    expect(text).toContain('👋 Hola\n');
    expect(text).not.toContain('Hola,');
  });

  it('renders every figure with its change inside a single <pre> block', () => {
    const { text } = renderWelcome({ firstName: 'George', overview: FULL });
    const block = text.slice(text.indexOf('<pre>') + 5, text.indexOf('</pre>'));
    const lines = block.split('\n');

    expect(text.split('<pre>')).toHaveLength(2); // exactamente un bloque
    expect(lines[0]).toContain('Últimos 30 días');
    expect(lines[0]).toContain('vs. 30 anteriores');
    expect(lines[1]).toContain('12');
    expect(lines[1]).toContain('▲ 20 %');
    expect(lines[2]).toContain('148');
    expect(lines[3]).toContain('1,184'); // separador de millares
    expect(lines[3]).toContain('▼  3 %'); // bajada
    expect(lines[4]).toContain('58,420 kg');
    expect(lines[5]).toContain('140 kg');
    expect(lines[6]?.trim()).toBe('Peso muerto');
  });

  it('aligns every metric row to the same width', () => {
    const { text } = renderWelcome({ firstName: 'George', overview: FULL });
    const block = text.slice(text.indexOf('<pre>') + 5, text.indexOf('</pre>'));
    const widths = new Set(block.split('\n').slice(0, 6).map((line) => line.length));
    expect(widths.size).toBe(1);
  });

  it('shows every change as a dash for a user with no history and no exercise name', () => {
    const { text } = renderWelcome({ firstName: 'George', overview: EMPTY });
    const block = text.slice(text.indexOf('<pre>') + 5, text.indexOf('</pre>'));
    const rows = block.split('\n');
    expect(rows).toHaveLength(6); // cabecera + 5 métricas, sin línea de ejercicio
    for (const row of rows.slice(1)) {
      expect(row).toContain('—');
    }
    expect(text).toContain('Registra tus series desde aquí'); // el texto explica de qué va
  });

  it('shows a dash for a metric whose previous window was zero', () => {
    const overview: Overview = { ...FULL, workouts: metric(3, 0, null) };
    const { text } = renderWelcome({ firstName: 'George', overview });
    const row = text.split('\n').find((l) => l.includes('Entrenamientos'));
    expect(row).toContain('—');
    expect(row).not.toContain('▲');
  });

  it('shows no arrow when a metric did not move', () => {
    const overview: Overview = { ...FULL, effectiveSets: metric(148, 148, 0) };
    const { text } = renderWelcome({ firstName: 'George', overview });
    const row = text.split('\n').find((l) => l.includes('Series'));
    expect(row).toContain('0 %');
    expect(row).not.toContain('▲');
    expect(row).not.toContain('▼');
  });

  it('does not round a fractional heaviest weight', () => {
    const overview: Overview = { ...FULL, heaviest: { ...metric(62.5, 60, 4), exerciseName: 'Curl' } };
    const { text } = renderWelcome({ firstName: 'George', overview });
    expect(text).toContain('62.5 kg');
  });

  it('escapes an own exercise name with HTML characters (§3)', () => {
    const overview: Overview = {
      ...FULL,
      heaviest: { ...metric(140, 135, 4), exerciseName: 'Curl <martillo> & polea' },
    };
    const { text } = renderWelcome({ firstName: 'George', overview });
    expect(text).toContain('Curl &lt;martillo&gt; &amp; polea');
    expect(text).not.toContain('<martillo>');
  });

  it('escapes a Telegram first name with HTML characters', () => {
    const { text } = renderWelcome({ firstName: '<b>George</b>', overview: FULL });
    expect(text).toContain('&lt;b&gt;George&lt;/b&gt;');
  });
});

describe('renderHelp', () => {
  it('covers both ways of recording, warmup, rest and every command', () => {
    const { text, keyboard } = renderHelp();
    for (const needle of [
      '60x8',
      '60 x 8',
      '60x8 rpe8',
      'sentadilla 100x5',
      'Calent.',
      'Descanso',
      '/start',
      '/finish',
      '/routines',
      '/last',
      '/help',
    ]) {
      expect(text).toContain(needle);
    }
    expect(keyboard.inline_keyboard.flat().map((b) => ('callback_data' in b ? b.callback_data : ''))).toEqual(['wc:b']);
  });
});
```

- [ ] **Step 5: Ejecuta el test y comprueba que falla**

Run: `pnpm vitest run apps/server/src/bot/welcome.test.ts`
Expected: FAIL con `Failed to resolve import "./welcome"`.

- [ ] **Step 6: Implementa `welcome.ts`**

Crea `apps/server/src/bot/welcome.ts`:

```ts
import type { Overview } from '@gym-tracker/core';
import { InlineKeyboard } from 'grammy';
import { CB } from './callback-data';
import { formatTonnage, formatWeight } from './session-view';
import { T } from './texts';

export interface WelcomeModel {
  firstName: string | null;
  overview: Overview;
}

// Exportada porque registerWelcome (Tarea 7) la usa en la firma de su helper de edición.
export interface Rendered {
  text: string;
  keyboard: InlineKeyboard;
}

/**
 * Telegram HTML solo se rompe con estos tres caracteres. Se aplica a TODO lo que
 * venga de fuera del código: el nombre de Telegram del usuario y el nombre del
 * ejercicio de "Más pesado", que puede ser un ejercicio propio con texto arbitrario
 * (routines-wizard.ts, askOwnName, no valida caracteres).
 * El '&' va primero: si no, escaparía los '&' que él mismo acaba de introducir.
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// La fuente por defecto de Telegram es proporcional: la tabla solo cuadra dentro
// de un <pre>. Anchos fijos en unidades UTF-16, que es lo que cuentan padStart y
// padEnd; todas las etiquetas son latinas precompuestas, así que coinciden con
// los caracteres visibles.
const LABEL_WIDTH = 14;
const VALUE_WIDTH = 12;
const CHANGE_WIDTH = 8;
const TABLE_WIDTH = LABEL_WIDTH + VALUE_WIDTH + CHANGE_WIDTH;

function changeCell(percent: number | null): string {
  if (percent === null) {
    return T.overviewNoChange;
  }
  // padStart(2) alinea los dígitos entre filas: "▲ 20 %" y "▼  3 %".
  const magnitude = `${String(Math.abs(percent)).padStart(2)} %`;
  if (percent > 0) {
    return `▲ ${magnitude}`;
  }
  if (percent < 0) {
    return `▼ ${magnitude}`;
  }
  return magnitude; // sin movimiento: sin flecha
}

function metricRow(label: string, value: string, percent: number | null): string {
  return label.padEnd(LABEL_WIDTH) + value.padStart(VALUE_WIDTH) + changeCell(percent).padStart(CHANGE_WIDTH);
}

function metricsBlock(overview: Overview): string {
  const rows = [
    T.overviewTitle.padEnd(TABLE_WIDTH - T.overviewCompare.length) + T.overviewCompare,
    metricRow(T.overviewWorkouts, formatTonnage(overview.workouts.current), overview.workouts.changePercent),
    metricRow(T.overviewSets, formatTonnage(overview.effectiveSets.current), overview.effectiveSets.changePercent),
    metricRow(T.overviewReps, formatTonnage(overview.reps.current), overview.reps.changePercent),
    metricRow(T.overviewTonnage, `${formatTonnage(overview.tonnageKg.current)} kg`, overview.tonnageKg.changePercent),
    // formatWeight, NO formatTonnage: es el peso crudo de una serie y redondearlo
    // convertiría 62.5 kg en 63 kg, que es un dato falso.
    metricRow(T.overviewHeaviest, `${formatWeight(overview.heaviest.current)} kg`, overview.heaviest.changePercent),
  ];

  if (overview.heaviest.exerciseName !== null) {
    // Se rellena ANTES de escapar: '&amp;' ocupa 5 unidades y una sola columna,
    // así que escapar primero descuadraría la alineación.
    rows.push(escapeHtml(overview.heaviest.exerciseName.padStart(LABEL_WIDTH + VALUE_WIDTH)));
  }

  return `<pre>${rows.join('\n')}</pre>`;
}

export function renderWelcome(model: WelcomeModel): Rendered {
  const text = [
    escapeHtml(T.welcomeGreeting(model.firstName)),
    '',
    T.welcomeIntro,
    '',
    metricsBlock(model.overview),
  ].join('\n');

  // Cada .row() lleva otro botón detrás: el idioma `.text(x).row()` solo es seguro
  // así (ver el comentario sobre InlineKeyboard en exercise-picker.ts:17-21).
  const keyboard = new InlineKeyboard()
    .text(T.welcomeStartButton, CB.wcStart)
    .row()
    .text(T.welcomeRoutinesButton, CB.wcRoutines)
    .text(T.welcomeHistoryButton, CB.wcHistory)
    .row()
    .text(T.welcomeHelpButton, CB.wcHelp);

  return { text, keyboard };
}

export function renderHelp(): Rendered {
  return { text: T.helpText, keyboard: new InlineKeyboard().text(T.welcomeBackButton, CB.wcBack) };
}
```

- [ ] **Step 7: Ejecuta los tests y comprueba que pasan**

Run: `pnpm vitest run apps/server/src/bot/welcome.test.ts`
Expected: PASS, 13 tests.

Si falla el test de alineación (`aligns every metric row to the same width`), el culpable casi seguro es `TABLE_WIDTH - T.overviewCompare.length`: comprueba que `'Últimos 30 días'` cabe en ese hueco (15 caracteres frente a 34 − 17 = 17). No cambies los textos para cuadrarlo; ajusta los tres anchos.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/bot/callback-data.ts apps/server/src/bot/callback-data.test.ts apps/server/src/bot/welcome.ts apps/server/src/bot/welcome.test.ts apps/server/src/bot/texts.ts
git commit -m "feat(server): add pure welcome and help screen renderers"
```

---

### Task 5: Servicio que calcula las fronteras y arma el resumen

Spec §8.2 y §9. Es el único sitio que mira el reloj y el único que conoce el «29 / 30».

**Files:**
- Create: `apps/server/src/services/overview-service.ts`
- Test: `apps/server/src/services/overview-service.test.ts`

**Interfaces:**
- Consumes: `startOfLocalDay`, `buildOverview`, `Overview` de `@gym-tracker/core` (Tareas 1 y 2); `listEffectiveSetsBetween`, `listWorkoutStartsBetween` de `@gym-tracker/db` (Tarea 3).
- Produces: `buildUserOverview(db: DatabaseSync, params: { userId: number; timezone: string; now: number }): Overview`

- [ ] **Step 1: Escribe el test que falla**

Crea `apps/server/src/services/overview-service.test.ts`:

```ts
import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  insertSet,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import { describe, expect, it } from 'vitest';
import { buildUserOverview } from './overview-service';

const DAY = 86_400_000;
const TZ = 'America/Mexico_City'; // UTC-6 fijo: la aritmética del test es legible
// 2026-07-25 12:00 local = 18:00 UTC
const NOW = Date.UTC(2026, 6, 25, 18, 0);
// 00:00 local del 25 = 06:00 UTC
const TODAY_START = Date.UTC(2026, 6, 25, 6, 0);

function baseDb() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: TZ, createdAt: 0 });
  return d;
}

function addSet(d: ReturnType<typeof baseDb>, createdAt: number, over: { weightKg?: number; reps?: number; isWarmup?: boolean } = {}) {
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: createdAt });
  insertSet(d, {
    workoutId: w.id,
    exerciseId: 1,
    position: 1,
    weightKg: over.weightKg ?? 100,
    reps: over.reps ?? 5,
    rpe: null,
    restSeconds: null,
    isWarmup: over.isWarmup ?? false,
    createdAt,
  });
}

describe('buildUserOverview', () => {
  it('anchors the window to the start of the local day, not to the current time', () => {
    const d = baseDb();
    addSet(d, TODAY_START); // 00:00 local de hoy: dentro
    addSet(d, TODAY_START - 1); // un ms antes: ayer, también dentro (día 2 de 30)
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.effectiveSets.current).toBe(2);
  });

  it('includes a set 29 local days ago and excludes one 30 days ago', () => {
    const d = baseDb();
    addSet(d, TODAY_START - 29 * DAY); // primer instante de la ventana
    addSet(d, TODAY_START - 29 * DAY - 1); // un ms fuera: cae en la anterior
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.effectiveSets.current).toBe(1);
    expect(overview.effectiveSets.previous).toBe(1);
  });

  it('excludes what falls before the previous window entirely', () => {
    const d = baseDb();
    addSet(d, TODAY_START - 59 * DAY); // primer instante de la ventana anterior
    addSet(d, TODAY_START - 59 * DAY - 1); // fuera de las dos
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.effectiveSets.current).toBe(0);
    expect(overview.effectiveSets.previous).toBe(1);
  });

  it('ignores warmup sets in every figure', () => {
    const d = baseDb();
    addSet(d, TODAY_START, { isWarmup: true, weightKg: 200 });
    addSet(d, TODAY_START, { weightKg: 60, reps: 10 });
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.effectiveSets.current).toBe(1);
    expect(overview.reps.current).toBe(10);
    expect(overview.tonnageKg.current).toBe(600);
    expect(overview.heaviest.current).toBe(60); // no el calentamiento de 200
  });

  it('returns an all-zero overview for a user with no data at all', () => {
    const d = baseDb();
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.workouts.current).toBe(0);
    expect(overview.heaviest.exerciseName).toBeNull();
    expect(overview.tonnageKg.changePercent).toBeNull();
  });

  it('does not move between two sets recorded minutes apart', () => {
    const d = baseDb();
    addSet(d, TODAY_START + 3_600_000);
    const first = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    const later = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW + 5 * 60_000 });
    expect(later.effectiveSets).toEqual(first.effectiveSets);
    expect(later.workouts).toEqual(first.workouts);
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `pnpm vitest run apps/server/src/services/overview-service.test.ts`
Expected: FAIL con `Failed to resolve import "./overview-service"`.

- [ ] **Step 3: Implementa el servicio**

Crea `apps/server/src/services/overview-service.ts`:

```ts
import { type Overview, buildOverview, startOfLocalDay } from '@gym-tracker/core';
import { listEffectiveSetsBetween, listWorkoutStartsBetween } from '@gym-tracker/db';
import type { DatabaseSync } from 'node:sqlite';

const MS_PER_DAY = 86_400_000;
const WINDOW_DAYS = 30;

/**
 * Resumen de los 30 días que terminan hoy frente a los 30 anteriores (spec §3).
 *
 * La ventana se ancla al INICIO DEL DÍA LOCAL, no a la hora exacta: así el resumen
 * no cambia entre serie y serie. `currentTo` sí es `now`, porque nada puede haberse
 * registrado en el futuro.
 *
 * Restar días de 24 h a una medianoche local no cae exactamente en otra medianoche
 * si hay un cambio de horario por medio (será 23:00 o 01:00). Es lo que pide el
 * spec §8.2 y la desviación de una hora sobre una ventana de 30 días no cambia
 * ninguna cifra de forma perceptible.
 *
 * Una sola ida a la base de datos por consulta, sobre los 60 días completos:
 * `buildOverview` hace el reparto entre ventanas en memoria.
 */
export function buildUserOverview(
  db: DatabaseSync,
  params: { userId: number; timezone: string; now: number },
): Overview {
  const currentTo = params.now;
  const currentFrom =
    startOfLocalDay(new Date(params.now), params.timezone) - (WINDOW_DAYS - 1) * MS_PER_DAY;
  const previousFrom = currentFrom - WINDOW_DAYS * MS_PER_DAY;

  const range = { userId: params.userId, fromMs: previousFrom, toMs: currentTo };
  return buildOverview({
    sets: listEffectiveSetsBetween(db, range),
    workoutStarts: listWorkoutStartsBetween(db, range),
    currentFrom,
    currentTo,
    previousFrom,
  });
}
```

- [ ] **Step 4: Ejecuta los tests y comprueba que pasan**

Run: `pnpm vitest run apps/server/src/services/overview-service.test.ts && pnpm --filter @gym-tracker/server typecheck`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/overview-service.ts apps/server/src/services/overview-service.test.ts
git commit -m "feat(server): add overview service with local-day anchored windows"
```

---

### Task 6: Extracción de las dos pantallas que reutiliza la bienvenida

Preparación sin ningún cambio de comportamiento: dos de las tres pantallas que reutiliza la bienvenida (spec §7) se sacan a funciones compartibles. La tercera, el selector de ejercicios por grupo, ya es una función pura (`renderPicker`) y no hay nada que extraer. Al terminar esta tarea la suite debe seguir en verde **sin haber cambiado ningún test existente**.

**Files:**
- Modify: `apps/server/src/services/session-service.ts` (añadir `buildDayOptions`)
- Modify: `apps/server/src/bot/capture.ts` (usar `buildDayOptions` en `handleStart`)
- Modify: `apps/server/src/bot/routines-wizard.ts` (extraer `renderRoutinesList`)
- Test: `apps/server/src/bot/routines-wizard.test.ts` (añadir, no borrar lo que hay)

**Interfaces:**
- Consumes: `DayOption` de `./bot/session-view`; `T` de `./bot/texts`.
- Produces:
  - `buildDayOptions(db: DatabaseSync, userId: number): DayOption[]` — en `services/session-service.ts` (ver D5)
  - `renderRoutinesList(db: DatabaseSync, userId: number): { text: string; keyboard: InlineKeyboard }` — en `bot/routines-wizard.ts`

- [ ] **Step 1: Escribe el test que falla**

Crea un `describe` nuevo al final de `apps/server/src/bot/routines-wizard.test.ts`:

```ts
describe('renderRoutinesList', () => {
  it('lists the routines with the active one marked and offers the new-routine button', () => {
    const d = baseDb(); // usa el helper que ya exista en este archivo
    const first = createRoutine(d, { userId: 1, name: 'PPL', createdAt: 1 });
    createRoutine(d, { userId: 1, name: 'Full body', createdAt: 2 });
    setActiveRoutine(d, { userId: 1, routineId: first.id });

    const { text, keyboard } = renderRoutinesList(d, 1);
    const datas = keyboard.inline_keyboard.flat().map((b) => ('callback_data' in b ? b.callback_data : ''));

    expect(text).toBe(T.routinesList);
    expect(datas).toEqual([`setactive:${first.id}`, 'setactive:2', 'newroutine']);
    expect(JSON.stringify(keyboard.inline_keyboard)).toContain('✅ PPL');
  });

  it('says there are none yet but still offers to create one', () => {
    const d = baseDb();
    const { text, keyboard } = renderRoutinesList(d, 1);
    expect(text).toBe(T.noRoutines);
    expect(keyboard.inline_keyboard.flat()).toHaveLength(1);
  });
});
```

Adapta las importaciones a lo que ya haya en ese archivo (`createRoutine`, `setActiveRoutine`, `T`, `renderRoutinesList`) y reutiliza su helper de base de datos en vez de escribir uno nuevo.

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `pnpm vitest run apps/server/src/bot/routines-wizard.test.ts`
Expected: FAIL — `renderRoutinesList` no se exporta.

- [ ] **Step 3: Extrae `buildDayOptions` a `session-service.ts`**

En `apps/server/src/services/session-service.ts`, añade `getActiveRoutine` y `listRoutineDays` a la importación de `@gym-tracker/db`, `DayOption` a la importación de tipos de `../bot/session-view`, y esta función (junto a `buildSessionView`):

```ts
/**
 * Días de la rutina activa del usuario, o lista vacía si no tiene ninguna activa.
 * Vive aquí y no en capture.ts para que welcome.ts pueda usarla sin crear un ciclo
 * de importación (capture.ts importa welcome.ts).
 */
export function buildDayOptions(db: DatabaseSync, userId: number): DayOption[] {
  const active = getActiveRoutine(db, userId);
  return active ? listRoutineDays(db, active.id).map((d) => ({ routineDayId: d.id, name: d.name })) : [];
}
```

En `apps/server/src/bot/capture.ts`, `handleStart` pasa a usarla. Sustituye el cuerpo posterior a la reanudación:

```ts
  const { text, keyboard } = renderDayPicker(buildDayOptions(db, userId));
  await ctx.reply(text, { reply_markup: keyboard });
```

Añade `buildDayOptions` a la importación de `../services/session-service` y **quita** de la importación de `@gym-tracker/db` los símbolos que dejen de usarse en `capture.ts` (`getActiveRoutine` y `listRoutineDays`, salvo que queden usados en otro sitio del archivo — compruébalo con `pnpm --filter @gym-tracker/server typecheck`, que avisa de importaciones sin usar solo si `noUnusedLocals` está activo; si no avisa, revísalo a ojo).

- [ ] **Step 4: Extrae `renderRoutinesList` en `routines-wizard.ts`**

Antes de `registerRoutines`, añade:

```ts
/**
 * Lista de rutinas con la activa marcada. Extraída del handler de /routines para
 * que la bienvenida (welcome.ts, botón "📋 Mis rutinas") pinte exactamente lo
 * mismo sin entrar en la conversación del wizard: su botón "➕ Nueva rutina" ya
 * hace conversation.enter('routineWizard') por su cuenta.
 */
export function renderRoutinesList(
  db: DatabaseSync,
  userId: number,
): { text: string; keyboard: InlineKeyboard } {
  const routines = listRoutines(db, userId);
  const keyboard = new InlineKeyboard();
  for (const routine of routines) {
    keyboard.text(`${routine.isActive ? '✅ ' : ''}${routine.name}`, `setactive:${routine.id}`).row();
  }
  keyboard.text(T.newRoutineButton, 'newroutine');
  return { text: routines.length > 0 ? T.routinesList : T.noRoutines, keyboard };
}
```

Y el handler de `/routines` se reduce a:

```ts
  bot.command('routines', async (ctx) => {
    const { text, keyboard } = renderRoutinesList(db, ctx.user.id);
    await ctx.reply(text, { reply_markup: keyboard });
  });
```

Es el mismo código de hoy, movido tal cual: el idioma `.text(x).row()` seguido siempre de otro botón es seguro (ver el comentario sobre `InlineKeyboard` en `exercise-picker.ts:17-21`). No lo reescribas.

- [ ] **Step 5: Ejecuta toda la suite y comprueba que pasa**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. Todos los tests anteriores siguen verdes **sin haber modificado ninguno** —es una extracción sin cambio de comportamiento— más los 2 nuevos.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/session-service.ts apps/server/src/bot/capture.ts apps/server/src/bot/routines-wizard.ts apps/server/src/bot/routines-wizard.test.ts
git commit -m "refactor(server): extract day options and routines list for reuse"
```

---

### Task 7: Enganchar la bienvenida al bot

Aquí se junta todo. **El orden de registro es el punto delicado** (spec §10.1): `capture.ts` engancha un `bot.on('callback_query:data')` que atiende **todo** lo que le llegue (`capture.ts:455`), así que cualquier handler de `wc:*` registrado después nunca se ejecutaría.

**Files:**
- Modify: `apps/server/src/bot/welcome.ts` (añadir `welcomeModel`, `sendWelcome`, `registerWelcome`)
- Modify: `apps/server/src/bot/capture.ts` (`handleStart` y el repintado con sesión activa)
- Modify: `apps/server/src/bot/bot.ts` (registro entre `registerLast` y `registerCapture`)
- Test: `apps/server/src/bot/flows.test.ts` (añadir un `describe` nuevo)

**Interfaces:**
- Consumes: `renderWelcome`, `renderHelp` (Tarea 4); `buildUserOverview` (Tarea 5); `buildDayOptions`, `renderRoutinesList`, `CB.wc*` (Tarea 6); `renderDayPicker` de `./session-view`; `renderPicker` de `./exercise-picker`; `listExercisesByMuscleGroup` de `@gym-tracker/db`.
- Produces:
  - `welcomeModel(db: DatabaseSync, ctx: CustomContext, timezone: string): WelcomeModel`
  - `sendWelcome(ctx: CustomContext, db: DatabaseSync, timezone: string): Promise<void>` — la usa `capture.ts` en `/start`
  - `registerWelcome(bot: Bot<CustomContext>, db: DatabaseSync, config: { timezone: string }): void`

- [ ] **Step 1: Escribe los tests que fallan**

Añade al final de `apps/server/src/bot/flows.test.ts`:

```ts
describe('welcome screen and discoverability', () => {
  it('greets a brand-new user on /start instead of starting a workout', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);

    await bot.handleUpdate(commandUpdate(1, 'start'));

    const sent = outgoing.filter((c) => c.method === 'sendMessage');
    expect(sent).toHaveLength(1);
    expect(String(sent[0]?.payload.text ?? '')).toContain('👋 Hola');
    expect(sent[0]?.payload.parse_mode).toBe('HTML');
    expect(lastKeyboardDatas(outgoing, 'sendMessage')).toEqual(['wc:s', 'wc:r', 'wc:l', 'wc:h']);
    // No se ha creado ningún entrenamiento por saludar.
    expect(getActiveWorkout(d, 1)).toBeUndefined();
    expect(getSession(d, 1)).toBeUndefined();
  });

  it('repaints the active workout on /start and shows no welcome (§4)', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'wc:s', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'free', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(commandUpdate(4, 'start'));

    const all = [...outgoingTexts(outgoing, 'sendMessage'), ...outgoingTexts(outgoing, 'editMessageText')].join('\n');
    expect(all).not.toContain('👋 Hola');
    expect(all).toContain('🏋️'); // la cabecera de la sesión activa
  });

  it('opens the day picker from ▶️ Empezar entrenamiento, editing the same message', async () => {
    const d = baseDb();
    const routine = createRoutine(d, { userId: 1, name: 'PPL', createdAt: 1 });
    setActiveRoutine(d, { userId: 1, routineId: routine.id });
    const day = createRoutineDay(d, { routineId: routine.id, name: 'Empuje', position: 1 });
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(2, 'wc:s', MSG));

    expect(outgoing.filter((c) => c.method === 'sendMessage')).toHaveLength(0); // in place
    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('¿Qué toca hoy?');
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toEqual([`day:${day.id}`, 'free']);
  });

  it('starts the workout from a day chosen on the welcome-turned-day-picker', async () => {
    const d = baseDb();
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'wc:s', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'free', MSG));

    expect(getActiveWorkout(d, 1)).toBeDefined();
    expect(getSession(d, 1)?.messageId).toBe(MSG); // el mensaje activo es ese mismo
  });

  it('opens the routines list from 📋 Mis rutinas without entering the wizard', async () => {
    const d = baseDb();
    createRoutine(d, { userId: 1, name: 'PPL', createdAt: 1 });
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(2, 'wc:r', MSG));

    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('Tus rutinas');
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toContain('newroutine');
  });

  it('opens the exercise picker with origin l from 📊 Historial', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(2, 'wc:l', MSG));

    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('grupo muscular');
    expect(lastKeyboardDatas(outgoing, 'editMessageText').every((x) => x.startsWith('pick:l:'))).toBe(true);
  });

  it('shows the help screen from ❓ Cómo funciona and rebuilds the welcome with ‹ Volver', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(2, 'wc:h', MSG));
    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('Cómo funciona');
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toEqual(['wc:b']);
    expect(outgoing.filter((c) => c.method === 'sendMessage')).toHaveLength(0);
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, 'wc:b', MSG));
    const back = outgoing.filter((c) => c.method === 'editMessageText').at(-1);
    expect(String(back?.payload.text ?? '')).toContain('👋 Hola');
    expect(String(back?.payload.text ?? '')).toContain('Últimos 30 días'); // resumen incluido
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toEqual(['wc:s', 'wc:r', 'wc:l', 'wc:h']);
  });

  it('sends /help as a new message and leaves an ongoing workout untouched (§5)', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'wc:s', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(4, 'ex:1', MSG));
    const before = getSession(d, 1)!;
    outgoing.length = 0;

    await bot.handleUpdate(commandUpdate(5, 'help'));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('Cómo funciona');
    expect(outgoing.filter((c) => c.method === 'editMessageText')).toHaveLength(0);
    expect(getSession(d, 1)?.messageId).toBe(before.messageId);
    expect(getSession(d, 1)?.currentExerciseId).toBe(before.currentExerciseId);
  });

  it('resumes the workout when a day is pressed on a stale welcome (D2)', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'wc:s', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'free', MSG)); // sesión activa en MSG
    const HELP_MSG = 900; // el mensaje nuevo de /help
    await bot.handleUpdate(commandUpdate(4, 'help'));
    await bot.handleUpdate(callbackUpdate(5, 'wc:b', HELP_MSG)); // bienvenida en HELP_MSG
    await bot.handleUpdate(callbackUpdate(6, 'wc:s', HELP_MSG)); // selector de día en HELP_MSG
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(7, 'free', HELP_MSG));

    // Antes: no pasaba nada. Ahora el mensaje pulsado ES el mensaje activo.
    expect(getSession(d, 1)?.messageId).toBe(HELP_MSG);
    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('🏋️');
    // Y el mensaje activo anterior se borra: un solo mensaje activo por sesión.
    expect(outgoing.some((c) => c.method === 'deleteMessage' && c.payload.message_id === MSG)).toBe(true);
  });
});
```

Ese bloque usa `createRoutineDay`, `createRoutine`, `setActiveRoutine`, `getActiveWorkout` y `getSession`, todos ya importados en la cabecera de `flows.test.ts`.

- [ ] **Step 2: Ejecuta los tests y comprueba que fallan**

Run: `pnpm vitest run apps/server/src/bot/flows.test.ts`
Expected: FAIL. El primero falla porque `/start` sigue devolviendo `¿Qué toca hoy?`; los de `wc:*` porque nadie los atiende.

- [ ] **Step 3: Añade el modelo y los handlers a `welcome.ts`**

El bloque de importaciones de `apps/server/src/bot/welcome.ts` pasa a ser este (las cuatro primeras líneas del archivo ya existen desde la Tarea 4; el resto son nuevas o amplían las que hay):

```ts
import { type Overview } from '@gym-tracker/core';
import { listExercisesByMuscleGroup } from '@gym-tracker/db';
import { type Bot, InlineKeyboard } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { buildUserOverview } from '../services/overview-service';
import { buildDayOptions } from '../services/session-service';
import { CB } from './callback-data';
import type { CustomContext } from './context';
import { renderPicker } from './exercise-picker';
import { renderRoutinesList } from './routines-wizard';
import { formatTonnage, formatWeight, renderDayPicker } from './session-view';
import { T } from './texts';
```

Y añade al final del archivo:

```ts
// parse_mode va en TODOS los envíos de estas dos pantallas: la tabla de métricas
// necesita <pre> y la ayuda usa <code> para los ejemplos.
const HTML = { parse_mode: 'HTML' } as const;

export function welcomeModel(db: DatabaseSync, ctx: CustomContext, timezone: string): WelcomeModel {
  const firstName = ctx.from?.first_name?.trim();
  return {
    firstName: firstName === undefined || firstName === '' ? null : firstName,
    overview: buildUserOverview(db, { userId: ctx.user.id, timezone, now: Date.now() }),
  };
}

/** `/start` sin sesión activa: mensaje nuevo. */
export async function sendWelcome(ctx: CustomContext, db: DatabaseSync, timezone: string): Promise<void> {
  const { text, keyboard } = renderWelcome(welcomeModel(db, ctx, timezone));
  await ctx.reply(text, { reply_markup: keyboard, ...HTML });
}

export function registerWelcome(
  bot: Bot<CustomContext>,
  db: DatabaseSync,
  config: { timezone: string },
): void {
  // Todas las pantallas de aquí editan el mensaje pulsado. El .catch silencia los
  // "message is not modified" y los mensajes ya inaccesibles, igual que last.ts.
  const edit = async (ctx: CustomContext, rendered: Rendered, html: boolean): Promise<void> => {
    await ctx
      .editMessageText(rendered.text, { reply_markup: rendered.keyboard, ...(html ? HTML : {}) })
      .catch(() => {});
  };

  bot.command('help', async (ctx) => {
    // Mensaje NUEVO: /help funciona con un entrenamiento en curso y no debe tocar
    // el mensaje activo de la sesión (spec §5).
    const { text, keyboard } = renderHelp();
    await ctx.reply(text, { reply_markup: keyboard, ...HTML });
  });

  bot.callbackQuery(CB.wcHelp, async (ctx) => {
    await edit(ctx, renderHelp(), true);
    await ctx.answerCallbackQuery();
  });

  // ‹ Volver reconstruye la bienvenida EN EL SITIO, venga de donde venga: no
  // depende de si a la ayuda se llegó por botón o por /help (spec §5).
  bot.callbackQuery(CB.wcBack, async (ctx) => {
    await edit(ctx, renderWelcome(welcomeModel(db, ctx, config.timezone)), true);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(CB.wcStart, async (ctx) => {
    await edit(ctx, renderDayPicker(buildDayOptions(db, ctx.user.id)), false);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(CB.wcRoutines, async (ctx) => {
    // Pinta la lista sin entrar en la conversación: su botón "➕ Nueva rutina" ya
    // hace conversation.enter por su cuenta (spec §7).
    await edit(ctx, renderRoutinesList(db, ctx.user.id), false);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(CB.wcHistory, async (ctx) => {
    // Origen 'l': sus callbacks los atiende last.ts:96, registrado antes que esto.
    const picker = renderPicker({ view: 'groups' }, 'l', listExercisesByMuscleGroup(db, ctx.user.id));
    await edit(ctx, picker, false);
    await ctx.answerCallbackQuery();
  });
}
```

`Rendered` ya se exporta desde la Tarea 4, así que la firma de `edit` lo usa directamente. `InlineKeyboard` sigue importado como valor porque `renderWelcome` y `renderHelp` lo instancian.

- [ ] **Step 4: Cambia `handleStart` y el arranque con sesión activa en `capture.ts`**

En `apps/server/src/bot/capture.ts`, `handleStart` pasa a recibir la zona horaria y a saludar:

```ts
async function handleStart(
  ctx: CustomContext,
  db: DatabaseSync,
  restTimers: RestTimers,
  timezone: string,
): Promise<void> {
  const existing = getSession(db, ctx.user.id);
  if (existing) {
    await renderActive(ctx.api, db, existing, restTimers); // reanudación (spec §4)
    return;
  }
  await sendWelcome(ctx, db, timezone);
}
```

Con `import { sendWelcome } from './welcome';` arriba. `renderDayPicker` y `buildDayOptions` dejan de usarse en `handleStart`, pero **`renderDayPicker` sigue importado si algún otro punto del archivo lo usa** — compruébalo antes de borrar la importación.

En `registerCapture`, pásale la zona horaria y deja de ignorar la config:

```ts
export function registerCapture(
  bot: Bot<CustomContext>,
  db: DatabaseSync,
  config: { timezone: string },
  restTimers: RestTimers,
): void {
  bot.command('start', (ctx) => handleStart(ctx, db, restTimers, config.timezone));
  bot.command('finish', (ctx) => handleFinish(ctx, db, restTimers));
  bot.on('callback_query:data', (ctx) => handleCallback(ctx, db, restTimers));
  bot.on('message:text', (ctx, next) => handleText(ctx, db, restTimers, next));
}
```

Y en `handleCallback`, sustituye la guardia silenciosa del bloque `'day' | 'free'` (hoy `capture.ts:224-228`) por el repintado de D2:

```ts
  if (action.type === 'day' || action.type === 'free') {
    const active = getSession(db, userId);
    if (active) {
      // Se llega aquí desde una bienvenida antigua: /help → ‹ Volver → ▶️ Empezar
      // con un entreno a medias. Antes esto no hacía nada y dejaba un menú muerto.
      // Ahora el mensaje pulsado pasa a ser EL mensaje activo de la sesión y el
      // anterior se borra: un solo mensaje activo por sesión (SPEC §6).
      const pressed = ctx.callbackQuery?.message?.message_id ?? null;
      if (pressed !== null && pressed !== active.messageId) {
        if (active.messageId !== null) {
          await ctx.api.deleteMessage(active.chatId, active.messageId).catch(() => {});
        }
        updateSession(db, userId, { messageId: pressed }, now);
      }
      const resumed = getSession(db, userId);
      if (resumed) {
        await renderActive(ctx.api, db, resumed, restTimers);
      }
      await ctx.answerCallbackQuery();
      return;
    }
    let routineDayId: number | null = null;
    // …el resto del bloque se queda EXACTAMENTE como está…
```

- [ ] **Step 5: Registra `registerWelcome` en el orden correcto**

En `apps/server/src/bot/bot.ts`, después de `registerLast` y **antes** de crear los timers y llamar a `registerCapture`:

```ts
  registerRoutines(bot, db, config);
  registerLast(bot, db, config);
  // ANTES que registerCapture, que engancha un bot.on('callback_query:data')
  // genérico (capture.ts): cualquier handler de wc:* registrado después nunca se
  // ejecutaría. Es la misma trampa que obligó a meter el segmento de origen en el
  // espacio pick: (ver el comentario de callback-data.ts).
  registerWelcome(bot, db, config);
```

Con `import { registerWelcome } from './welcome';` arriba. Actualiza también el comentario de la línea 29 (`// --- Fase 1: /routines antes de la captura; /last se añade en la Task 16 ---`), que ya no describe lo que hay debajo.

- [ ] **Step 6: Ejecuta toda la suite y comprueba que pasa**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, con los 9 tests nuevos de `flows.test.ts`.

Si falla `repaints the active workout on /start`, revisa que `handleStart` compruebe la sesión **antes** de saludar. Si fallan varios `wc:*` a la vez con `answerCallbackQuery` como única salida, es el orden de registro en `bot.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/bot/welcome.ts apps/server/src/bot/capture.ts apps/server/src/bot/bot.ts apps/server/src/bot/flows.test.ts
git commit -m "feat(server): show a welcome screen on /start with progress and shortcuts"
```

---

### Task 8: Menú de comandos de Telegram y cierre

Spec §6. Sin esto el menú ☰ sigue vacío y `/routines`, `/last` y `/finish` siguen siendo invisibles, que es la mitad del problema que abre el spec.

**Files:**
- Modify: `apps/server/src/bot/welcome.ts` (`BOT_COMMANDS` y `setBotCommands`)
- Modify: `apps/server/src/main.ts`
- Test: `apps/server/src/bot/welcome.test.ts` (añadir un `describe`)
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: `Api` de grammY.
- Produces:
  - `BOT_COMMANDS: ReadonlyArray<{ command: string; description: string }>`
  - `setBotCommands(api: Api): Promise<void>`

- [ ] **Step 1: Escribe el test que falla**

Añade al final de `apps/server/src/bot/welcome.test.ts`:

```ts
describe('setBotCommands', () => {
  it('registers exactly the five commands of the spec, in order', async () => {
    const d = openDatabase(':memory:');
    runMigrations(d, MIGRATIONS_DIR);
    createUser(d, { telegramUserId: 111, timezone: 'UTC', createdAt: 0 });
    const { bot, outgoing } = makeHarness(d, BOT_INFO, { allowedTelegramIds: [111], timezone: 'UTC' });

    await setBotCommands(bot.api);

    const call = outgoing.find((c) => c.method === 'setMyCommands');
    expect(call).toBeDefined();
    expect(call?.payload.commands).toEqual([
      { command: 'start', description: 'Inicio y resumen' },
      { command: 'finish', description: 'Terminar el entrenamiento' },
      { command: 'routines', description: 'Mis rutinas' },
      { command: 'last', description: 'Historial de un ejercicio' },
      { command: 'help', description: 'Cómo funciona' },
    ]);
  });
});
```

Y a la cabecera del archivo:

```ts
import { MIGRATIONS_DIR, createUser, openDatabase, runMigrations } from '@gym-tracker/db';
import { BOT_INFO, makeHarness } from './test-harness';
```
más `setBotCommands` en la importación de `./welcome`.

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `pnpm vitest run apps/server/src/bot/welcome.test.ts`
Expected: FAIL, `setBotCommands is not a function`.

- [ ] **Step 3: Implementa `setBotCommands`**

En `apps/server/src/bot/welcome.ts`, añade `type Api` a la importación de grammY y, al final del archivo:

```ts
/** El menú ☰ de Telegram (spec §6). El orden es el de la tabla del spec. */
export const BOT_COMMANDS = [
  { command: 'start', description: 'Inicio y resumen' },
  { command: 'finish', description: 'Terminar el entrenamiento' },
  { command: 'routines', description: 'Mis rutinas' },
  { command: 'last', description: 'Historial de un ejercicio' },
  { command: 'help', description: 'Cómo funciona' },
] as const;

export async function setBotCommands(api: Api): Promise<void> {
  await api.setMyCommands(BOT_COMMANDS.map((c) => ({ ...c })));
}
```

- [ ] **Step 4: Llámalo desde `onStart` en `main.ts`**

En `apps/server/src/main.ts`, añade `import { setBotCommands } from './bot/welcome';` y sustituye el arranque:

```ts
  void bot.start({
    onStart: (info) => {
      console.log(`[bot] long polling as @${info.username}`);
      // Si Telegram no responde a esta llamada el bot debe arrancar igual: solo se
      // registra el fallo en el log (spec §6). onStart es síncrono, así que la
      // promesa se descarta con void en vez de esperarla.
      void setBotCommands(bot.api).catch((error) =>
        console.error(`[bot] setMyCommands failed: ${String(error)}`),
      );
    },
  });
```

- [ ] **Step 5: Ejecuta toda la suite y comprueba que pasa**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. Apunta los números exactos de la salida: los necesitas en el paso siguiente.

- [ ] **Step 6: Actualiza la cifra de referencia de `CONTRIBUTING.md`**

En `CONTRIBUTING.md` §3, sustituye:

```markdown
Referencia de lo que debe salir en verde ahora mismo: **211 tests en 42 archivos**
(150 en `node`, 61 en `web`).
```

por los números reales de `pnpm test` (obtén el desglose con `pnpm vitest run --project node` y `pnpm vitest run --project web`). La cifra de `web` no debería moverse de 67: esta fase no toca `apps/web`. La cifra que había era vieja: el punto de partida real eran 276 tests en 43 archivos (209 en `node`, 67 en `web`).

- [ ] **Step 7: Prueba manual en Telegram**

Los tests no ven cómo queda la tabla en pantalla, y **la alineación del `<pre>` es exactamente lo que no se puede verificar en jsdom**. Arranca el bot con una cuenta que tenga historial:

```bash
# PowerShell
$env:TELEGRAM_BOT_TOKEN = '…'; $env:ALLOWED_TELEGRAM_IDS = '…'
pnpm --filter @gym-tracker/server start
```

Comprueba, en este orden:
1. El menú ☰ muestra los cinco comandos con sus descripciones.
2. `/start` sin entrenamiento a medias → saludo con tu nombre, las dos líneas de texto y la tabla **alineada en columnas**, también en el móvil en vertical. Si se descuadra, ajusta `LABEL_WIDTH` / `VALUE_WIDTH` / `CHANGE_WIDTH` en `welcome.ts`.
3. `▶️ Empezar entrenamiento` → el **mismo** mensaje pasa a ser el selector de día. Elige uno y registra una serie con normalidad.
4. Con el entrenamiento abierto: `/help` llega como mensaje nuevo y el mensaje de la sesión **no se mueve**.
5. En esa ayuda, `‹ Volver` → bienvenida con el resumen. `▶️ Empezar` → días. Pulsa uno: vuelve tu entrenamiento en curso y el mensaje viejo desaparece.
6. `/finish`, luego `/start` → `📋 Mis rutinas` y `📊 Historial`, cada uno editando el mismo mensaje.
7. Crea un ejercicio propio llamado `Curl <martillo> & polea`, regístrale la serie más pesada de tu mes y vuelve a `/start`: el nombre debe salir tal cual bajo `Más pesado`, sin romper el mensaje.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/bot/welcome.ts apps/server/src/bot/welcome.test.ts apps/server/src/main.ts CONTRIBUTING.md
git commit -m "feat(server): register the bot command menu with setMyCommands"
```

---

## Cobertura del spec

| Requisito del spec | Dónde se implementa |
|---|---|
| §3 Bienvenida de `/start` sin sesión: saludo, texto y resumen | Tareas 4 y 7 |
| §3 Botonera de cuatro botones | Tarea 4 (render), Tarea 7 (handlers) |
| §3 Ventana actual anclada al inicio del día local | Tareas 1 y 5 |
| §3 Ventana de comparación: los 30 días inmediatamente anteriores | Tarea 5 (`previousFrom`), Tarea 2 (reparto) |
| §3 Solo series efectivas (`is_warmup = 0`) | Tarea 3 (la consulta filtra), verificado en Tareas 3 y 5 |
| §3 `Entrenamientos` cuenta sesiones aunque no tengan series efectivas | Tarea 3 (`listWorkoutStartsBetween`), Tarea 2 (test dedicado) |
| §3 `Series`, `Repeticiones`, `Levantado` | Tarea 2 (`overviewTotals`) |
| §3 `Más pesado` con nombre de ejercicio; empate → la más reciente | Tarea 2 (test dedicado), Tarea 4 (segunda línea) |
| §3 Variación redondeada a entero; `—` si el previo es 0 | Tarea 2 (`percentChange`), Tarea 4 (`changeCell`) |
| §3 La columna de variación se muestra siempre, una sola versión de pantalla | Tarea 4 (test de usuario sin historial) |
| §3 Usuario sin ningún entrenamiento: todo a 0 y sin ejercicio | Tareas 2, 4 y 5 |
| §3 Saludo sin nombre cuando `first_name` viene vacío | Tarea 4 (render), Tarea 7 (`welcomeModel`) |
| §3 Millares con `formatTonnage` | Tarea 4 — **con la excepción D4**: `Más pesado` usa `formatWeight` |
| §3 Tabla dentro de `<pre>` con `parse_mode: 'HTML'`; saludo y texto fuera | Tarea 4 |
| §3 Escape HTML del nombre de ejercicio, con test dedicado | Tarea 4 — **ampliado por D3** al nombre del usuario |
| §4 `/start` con entreno a medias repinta la sesión, sin bienvenida | Tarea 7 |
| §5 Ayuda por botón (edita el mensaje) y por `/help` (mensaje nuevo) | Tarea 7 |
| §5 `‹ Volver` reconstruye la bienvenida en el sitio, venga de donde venga | Tarea 7 |
| §5 `/help` con entreno en curso no interfiere con la captura | Tarea 7 (test dedicado) |
| §5 Contenido: flujo, las dos vías, calentamiento, descanso, comandos | Tarea 4 (`T.helpText`) |
| §6 `setMyCommands` con los cinco comandos, dentro de `onStart`, con `catch` que loguea | Tarea 8 |
| §7 `▶️ Empezar` reutiliza `renderDayPicker` | Tareas 6 y 7 |
| §7 `📋 Mis rutinas` reutiliza la lista de `/routines`, sin entrar en el wizard | Tareas 6 y 7 |
| §7 `📊 Historial` reutiliza el selector con origen `'l'` | Tarea 7 |
| §8.1 `overview.ts` con la firma completa | Tarea 2 |
| §8.2 `local-day.ts` y las fronteras derivadas en el servicio | Tareas 1 y 5 |
| §9 Las dos consultas, una sola vez sobre los 60 días, sin migraciones | Tarea 3 |
| §10 Tabla de archivos afectados | Todas — **con las excepciones D5** (`buildDayOptions` a `session-service.ts`) **y D6** (`parseCallback` no se amplía) |
| §10.1 `registerWelcome` después de `registerLast` y antes de `registerCapture` | Tarea 7 |
| §11 `core/overview.test.ts` | Tarea 2 — salvo «exclusión del calentamiento», que no puede probarse ahí (`OverviewSet` no tiene `isWarmup`: el filtro es de la consulta). Cubierto en las Tareas 3 y 5 |
| §11 `core/local-day.test.ts` | Tarea 1 |
| §11 Tests de las dos consultas de `packages/db` | Tarea 3 |
| §11 `bot/welcome.test.ts` | Tarea 4 |
| §11 `bot/flows.test.ts` | Tarea 7 |
| §11 Verificación de `setMyCommands` contra el mock del harness | Tarea 8 |
| §12 Criterio: el usuario nuevo entiende el bot y llega a todo sin comandos | Tareas 4, 7, 8 |
| §12 Criterio: mismo número de toques que hoy | **No se cumple, por decisión D1 del autor**: `▶️ Empezar` añade un toque |

**Fuera de alcance, confirmado por el spec §2:** pistas contextuales dentro del flujo de captura, primer entrenamiento guiado, `/dashboard`, `/backup`, y cualquier cambio al flujo de captura más allá del arreglo de D2. Tampoco se añaden botones `‹ Volver` a la lista de rutinas ni al selector de historial: §7 dice explícitamente que esos tres botones no inventan pantalla nueva.
