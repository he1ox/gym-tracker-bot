# Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo pnpm con `packages/core` (toda la lógica de dominio pura, con tests) y `packages/db` (esquema Drizzle, migraciones y runner), cumpliendo el criterio de aceptación de la Fase 0 de `SPEC.md`.

**Architecture:** Funciones puras por métrica en `core` (cero dependencias de runtime; fechas vía `Intl` nativo), esquema Drizzle en `db` con migraciones SQL generadas por drizzle-kit y aplicadas por un runner propio sobre `node:sqlite`. Los tipos de dominio los define `core`; `db` depende de `core` y nunca al revés.

**Tech Stack:** TypeScript estricto, pnpm workspaces, Vitest, Drizzle ORM + Drizzle Kit, `node:sqlite`.

**Diseño aprobado:** `docs/superpowers/specs/2026-07-23-phase-0-foundations-design.md` — leerlo antes de empezar.

## Global Constraints

- TypeScript **estricto**; nada de `any` sin comentario que lo justifique (SPEC §12).
- **Prohibido `better-sqlite3`** y cualquier módulo nativo que requiera compilación (SPEC §3).
- Código e identificadores **en inglés**; textos de interfaz **en español** (SPEC §12).
- Commits pequeños, en inglés, **Conventional Commits** (SPEC §12). Cada commit termina con el trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (segundo `-m`).
- **Justificar cada dependencia nueva** en `DECISIONS.md` antes de agregarla (SPEC §12). Este plan solo autoriza: `typescript`, `vitest`, `drizzle-orm`, `drizzle-kit`, `@types/node`.
- `packages/core`: **cero dependencias de runtime**; no importa grammY, Hono, Drizzle ni nada del navegador (SPEC §3).
- Tests **junto al código** (`foo.test.ts` al lado de `foo.ts`), no en carpeta aparte (SPEC §12).
- SQLite **solo** vía `node:sqlite` (SPEC §3).
- Node **≥ 23.4** (donde `node:sqlite` es estable sin flag); recomendado Node 24 LTS. SPEC dice "Node 22+" — la restricción extra queda registrada en `DECISIONS.md`.
- Todos los comandos se ejecutan desde la raíz del repo (`C:\development\gym-tracker-bot`) salvo indicación contraria.

---

### Task 1: Raíz del monorepo y tooling

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `.nvmrc`
- Create: `DECISIONS.md`

**Interfaces:**
- Consumes: nada (repo solo contiene `SPEC.md` y `docs/`).
- Produces: workspace pnpm funcional; script raíz `pnpm test` (vitest sobre `packages/*/src/**/*.test.ts`) y `pnpm typecheck` (recursivo); `tsconfig.base.json` que todos los paquetes extienden.

- [ ] **Step 1: Verificar toolchain**

Run: `node --version` y `pnpm --version`
Expected: Node `v23.4.0` o superior (ideal `v24.x`) y pnpm 9+. Si Node es menor a 23.4, **detente y repórtalo al usuario**: `node:sqlite` no es estable antes.

- [ ] **Step 2: Crear archivos raíz**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

`package.json`:

```json
{
  "name": "gym-tracker-bot",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=23.4.0"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "pnpm -r typecheck"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
});
```

`.gitignore`:

```
node_modules/
dist/
coverage/
*.db
```

`.npmrc`:

```
engine-strict=true
```

`.nvmrc`:

```
24
```

`DECISIONS.md`:

```markdown
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
```

- [ ] **Step 3: Instalar devDependencies raíz**

Run: `pnpm add -D -w typescript vitest`
Expected: instala sin errores, crea `pnpm-lock.yaml`.

- [ ] **Step 4: Sanity check del runner**

Run: `pnpm exec vitest run --passWithNoTests`
Expected: `No test files found` y exit code 0.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json vitest.config.ts .gitignore .npmrc .nvmrc DECISIONS.md pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with strict TS and vitest" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `packages/core` — tipos y series efectivas

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/effective-sets.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/types.test.ts`, `packages/core/src/effective-sets.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` (Task 1).
- Produces: `MUSCLE_GROUPS: readonly ["chest", ...]` (tupla const de 17), `type MuscleGroup`, `MUSCLE_GROUP_LABELS: Record<MuscleGroup, string>`, `effectiveSets<T extends { isWarmup: boolean }>(sets: readonly T[]): T[]`. Barrel `index.ts` que las tareas siguientes extienden.

- [ ] **Step 1: Crear el paquete**

`packages/core/package.json`:

```json
{
  "name": "@gym-tracker/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": []
  },
  "include": ["src"]
}
```

(`"types": []` garantiza que `core` no vea tipos de Node: si alguien importa `node:fs`, el typecheck truena. Es la barrera de la regla "cero dependencias de I/O".)

- [ ] **Step 2: Escribir los tests que fallan**

`packages/core/src/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS } from './types';

describe('MUSCLE_GROUPS', () => {
  it('contains the 17 approved groups', () => {
    expect(MUSCLE_GROUPS).toHaveLength(17);
    expect(new Set(MUSCLE_GROUPS).size).toBe(17);
  });

  it('has a non-empty Spanish label for every group', () => {
    for (const group of MUSCLE_GROUPS) {
      expect(MUSCLE_GROUP_LABELS[group]).toBeTruthy();
    }
  });
});
```

`packages/core/src/effective-sets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { effectiveSets } from './effective-sets';

describe('effectiveSets', () => {
  it('filters out warmup sets', () => {
    const sets = [
      { isWarmup: true, weightKg: 40 },
      { isWarmup: false, weightKg: 60 },
      { isWarmup: false, weightKg: 62.5 },
    ];
    expect(effectiveSets(sets)).toEqual([
      { isWarmup: false, weightKg: 60 },
      { isWarmup: false, weightKg: 62.5 },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(effectiveSets([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `pnpm vitest run packages/core`
Expected: FAIL — no resuelve `./types` ni `./effective-sets`.

- [ ] **Step 4: Implementar**

`packages/core/src/types.ts`:

```ts
export const MUSCLE_GROUPS = [
  'chest',
  'front_delt',
  'side_delt',
  'rear_delt',
  'lats',
  'upper_back',
  'lower_back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  front_delt: 'Deltoide anterior',
  side_delt: 'Deltoide lateral',
  rear_delt: 'Deltoide posterior',
  lats: 'Dorsal',
  upper_back: 'Espalda alta',
  lower_back: 'Lumbar',
  traps: 'Trapecio',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazo',
  abs: 'Abdominales',
  quads: 'Cuádriceps',
  hamstrings: 'Femorales',
  glutes: 'Glúteos',
  adductors: 'Aductores',
  calves: 'Gemelos',
};
```

`packages/core/src/effective-sets.ts`:

```ts
export function effectiveSets<T extends { isWarmup: boolean }>(sets: readonly T[]): T[] {
  return sets.filter((set) => !set.isWarmup);
}
```

`packages/core/src/index.ts`:

```ts
export * from './types';
export * from './effective-sets';
```

- [ ] **Step 5: Verificar que pasan y typecheck**

Run: `pnpm vitest run packages/core`
Expected: 4 tests PASS.
Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): add muscle group enum, labels and effective sets" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `core/weeks` — bucketing semanal ISO

**Files:**
- Create: `packages/core/src/weeks.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/weeks.test.ts`

**Interfaces:**
- Consumes: nada de otros módulos.
- Produces: `isoWeekKey(instant: Date, timeZone: string): string` (formato `"2026-W30"`, semana ISO-8601 de la fecha local del instante en `timeZone`; lanza `RangeError` si la zona es inválida) y `compareWeekKeys(a: string, b: string): number` (orden cronológico; negativo/cero/positivo).

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/weeks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareWeekKeys, isoWeekKey } from './weeks';

describe('isoWeekKey', () => {
  it('computes the ISO week of a mid-week UTC instant', () => {
    expect(isoWeekKey(new Date('2026-07-22T12:00:00Z'), 'UTC')).toBe('2026-W30');
  });

  it('zero-pads week numbers below 10', () => {
    expect(isoWeekKey(new Date('2026-01-26T12:00:00Z'), 'UTC')).toBe('2026-W05');
  });

  it('assigns late-December days to week 1 of the next ISO year', () => {
    expect(isoWeekKey(new Date('2025-12-29T12:00:00Z'), 'UTC')).toBe('2026-W01');
  });

  it('assigns early-January days to week 53 of the previous ISO year', () => {
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'), 'UTC')).toBe('2026-W53');
  });

  it('uses the local date of the timezone: Monday 03:00 UTC is still Sunday in UTC-6', () => {
    const instant = new Date('2026-07-20T03:00:00Z');
    expect(isoWeekKey(instant, 'UTC')).toBe('2026-W30');
    expect(isoWeekKey(instant, 'America/Guatemala')).toBe('2026-W29');
  });

  it('handles half-hour offset timezones', () => {
    const instant = new Date('2026-07-19T19:00:00Z'); // 00:30 Monday in Kolkata
    expect(isoWeekKey(instant, 'UTC')).toBe('2026-W29');
    expect(isoWeekKey(instant, 'Asia/Kolkata')).toBe('2026-W30');
  });

  it('throws on an invalid timezone', () => {
    expect(() => isoWeekKey(new Date(), 'Not/AZone')).toThrow();
  });
});

describe('compareWeekKeys', () => {
  it('orders keys chronologically across year boundaries', () => {
    expect(compareWeekKeys('2025-W52', '2026-W01')).toBeLessThan(0);
    expect(compareWeekKeys('2026-W05', '2026-W30')).toBeLessThan(0);
    expect(compareWeekKeys('2026-W30', '2026-W30')).toBe(0);
    expect(compareWeekKeys('2026-W02', '2025-W53')).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm vitest run packages/core/src/weeks.test.ts`
Expected: FAIL — no resuelve `./weeks`.

- [ ] **Step 3: Implementar**

`packages/core/src/weeks.ts`:

```ts
const MS_PER_WEEK = 7 * 86_400_000;

export function isoWeekKey(instant: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(instant).split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Could not extract local date for timezone ${timeZone}`);
  }
  // ISO-8601: a date belongs to the week of its Thursday; week 1 contains Jan 4.
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // 0 = Monday
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 3);
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayOfWeek = (jan4.getUTCDay() + 6) % 7;
  const week1Thursday = new Date(Date.UTC(isoYear, 0, 4 - jan4DayOfWeek + 3));
  const week = 1 + Math.round((date.getTime() - week1Thursday.getTime()) / MS_PER_WEEK);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function compareWeekKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
```

Agregar a `packages/core/src/index.ts`:

```ts
export * from './weeks';
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm vitest run packages/core/src/weeks.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/weeks.ts packages/core/src/weeks.test.ts packages/core/src/index.ts
git commit -m "feat(core): add timezone-aware ISO week bucketing" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `core` — tonelaje y 1RM estimado

**Files:**
- Create: `packages/core/src/tonnage.ts`
- Create: `packages/core/src/one-rep-max.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/tonnage.test.ts`, `packages/core/src/one-rep-max.test.ts`

**Interfaces:**
- Consumes: `effectiveSets` (Task 2).
- Produces: `setTonnage(set: { weightKg: number; reps: number }): number`; `sessionTonnage(sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>): number`; `estimate1RM(weightKg: number, reps: number): number` (lanza si `weightKg <= 0` o `reps` no es entero ≥ 1); `session1RM(sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>): number | undefined`.

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/tonnage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sessionTonnage, setTonnage } from './tonnage';

describe('setTonnage', () => {
  it('multiplies weight by reps', () => {
    expect(setTonnage({ weightKg: 60, reps: 8 })).toBe(480);
    expect(setTonnage({ weightKg: 32.5, reps: 10 })).toBe(325);
  });
});

describe('sessionTonnage', () => {
  it('sums effective sets and ignores warmups', () => {
    const sets = [
      { weightKg: 40, reps: 10, isWarmup: true },
      { weightKg: 60, reps: 8, isWarmup: false },
      { weightKg: 60, reps: 6, isWarmup: false },
    ];
    expect(sessionTonnage(sets)).toBe(480 + 360);
  });

  it('returns 0 for an empty session', () => {
    expect(sessionTonnage([])).toBe(0);
  });
});
```

`packages/core/src/one-rep-max.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { estimate1RM, session1RM } from './one-rep-max';

describe('estimate1RM', () => {
  it('returns the weight itself for a single (reps = 1)', () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });

  it('applies the Epley formula for reps >= 2', () => {
    expect(estimate1RM(60, 8)).toBeCloseTo(76, 5);
    expect(estimate1RM(100, 2)).toBeCloseTo(106.6667, 3);
  });

  it('throws on non-positive weight', () => {
    expect(() => estimate1RM(0, 5)).toThrow();
    expect(() => estimate1RM(-10, 5)).toThrow();
  });

  it('throws on invalid reps', () => {
    expect(() => estimate1RM(60, 0)).toThrow();
    expect(() => estimate1RM(60, 1.5)).toThrow();
  });
});

describe('session1RM', () => {
  it('returns the max estimated 1RM among effective sets', () => {
    const sets = [
      { weightKg: 120, reps: 1, isWarmup: true },
      { weightKg: 60, reps: 8, isWarmup: false },
      { weightKg: 80, reps: 3, isWarmup: false },
    ];
    expect(session1RM(sets)).toBeCloseTo(88, 5); // 80 * (1 + 3/30)
  });

  it('returns undefined when there are no effective sets', () => {
    expect(session1RM([])).toBeUndefined();
    expect(session1RM([{ weightKg: 40, reps: 10, isWarmup: true }])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm vitest run packages/core/src/tonnage.test.ts packages/core/src/one-rep-max.test.ts`
Expected: FAIL — módulos no existen.

- [ ] **Step 3: Implementar**

`packages/core/src/tonnage.ts`:

```ts
import { effectiveSets } from './effective-sets';

export function setTonnage(set: { weightKg: number; reps: number }): number {
  return set.weightKg * set.reps;
}

export function sessionTonnage(
  sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>,
): number {
  return effectiveSets(sets).reduce((sum, set) => sum + setTonnage(set), 0);
}
```

`packages/core/src/one-rep-max.ts`:

```ts
import { effectiveSets } from './effective-sets';

export function estimate1RM(weightKg: number, reps: number): number {
  if (!(weightKg > 0)) {
    throw new Error(`weightKg must be positive, got ${weightKg}`);
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error(`reps must be a positive integer, got ${reps}`);
  }
  // A single already is a real one-rep max; Epley would overestimate it by 3.3%.
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export function session1RM(
  sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>,
): number | undefined {
  const effective = effectiveSets(sets);
  if (effective.length === 0) {
    return undefined;
  }
  return Math.max(...effective.map((set) => estimate1RM(set.weightKg, set.reps)));
}
```

Agregar a `packages/core/src/index.ts`:

```ts
export * from './tonnage';
export * from './one-rep-max';
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm vitest run packages/core`
Expected: todos PASS (los de Tasks 2-3 siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tonnage.ts packages/core/src/tonnage.test.ts packages/core/src/one-rep-max.ts packages/core/src/one-rep-max.test.ts packages/core/src/index.ts
git commit -m "feat(core): add tonnage and estimated 1RM with single special case" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `core/records` — récords personales

**Files:**
- Create: `packages/core/src/records.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/records.test.ts`

**Interfaces:**
- Consumes: `session1RM` (Task 4).
- Produces: `interface PersonalRecord { estimated1RM: number; previous1RM?: number }`; `detectPersonalRecord(historySets, sessionSets): PersonalRecord | undefined` donde ambos parámetros son `ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>` **de un solo ejercicio**. `undefined` = no hubo récord.

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/records.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectPersonalRecord } from './records';

const set = (weightKg: number, reps: number, isWarmup = false) => ({ weightKg, reps, isWarmup });

describe('detectPersonalRecord', () => {
  it('detects a record when the session strictly beats the historical max', () => {
    const history = [set(100, 5)]; // 1RM 116.67
    const session = [set(105, 5)]; // 1RM 122.5
    expect(detectPersonalRecord(history, session)).toEqual({
      estimated1RM: 105 * (1 + 5 / 30),
      previous1RM: 100 * (1 + 5 / 30),
    });
  });

  it('does not count equaling the record', () => {
    const history = [set(100, 5)];
    const session = [set(100, 5)];
    expect(detectPersonalRecord(history, session)).toBeUndefined();
  });

  it('does not count a session below the record', () => {
    expect(detectPersonalRecord([set(100, 5)], [set(90, 5)])).toBeUndefined();
  });

  it('treats the first-ever session as a record without previous1RM', () => {
    expect(detectPersonalRecord([], [set(60, 8)])).toEqual({ estimated1RM: 76 });
  });

  it('ignores warmups on both sides', () => {
    const history = [set(200, 1, true), set(100, 5)];
    const session = [set(105, 5), set(150, 1, true)];
    const record = detectPersonalRecord(history, session);
    expect(record?.estimated1RM).toBeCloseTo(122.5, 5);
    expect(record?.previous1RM).toBeCloseTo(116.6667, 3);
  });

  it('returns undefined when the session has no effective sets', () => {
    expect(detectPersonalRecord([set(100, 5)], [set(40, 10, true)])).toBeUndefined();
    expect(detectPersonalRecord([set(100, 5)], [])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm vitest run packages/core/src/records.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

`packages/core/src/records.ts`:

```ts
import { session1RM } from './one-rep-max';

export interface PersonalRecord {
  estimated1RM: number;
  previous1RM?: number;
}

export function detectPersonalRecord(
  historySets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>,
  sessionSets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>,
): PersonalRecord | undefined {
  const sessionBest = session1RM(sessionSets);
  if (sessionBest === undefined) {
    return undefined;
  }
  const previous = session1RM(historySets);
  if (previous === undefined) {
    return { estimated1RM: sessionBest };
  }
  return sessionBest > previous ? { estimated1RM: sessionBest, previous1RM: previous } : undefined;
}
```

Agregar a `packages/core/src/index.ts`:

```ts
export * from './records';
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm vitest run packages/core/src/records.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/records.ts packages/core/src/records.test.ts packages/core/src/index.ts
git commit -m "feat(core): add strict personal record detection" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `core/volume` — volumen semanal por grupo muscular

**Files:**
- Create: `packages/core/src/volume.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/volume.test.ts`

**Interfaces:**
- Consumes: `MuscleGroup` (Task 2), `effectiveSets` (Task 2), `isoWeekKey` (Task 3).
- Produces: `weeklyVolumeByMuscleGroup(sets: ReadonlyArray<{ exerciseId: number; isWarmup: boolean; createdAt: Date }>, muscleGroupByExerciseId: ReadonlyMap<number, MuscleGroup>, options: { weekKey: string; timeZone: string }): Map<MuscleGroup, number>`. Solo incluye grupos con ≥ 1 serie; lanza si un `exerciseId` no está en el mapa (invariante del llamador).

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/volume.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MuscleGroup } from './types';
import { weeklyVolumeByMuscleGroup } from './volume';

const groups: ReadonlyMap<number, MuscleGroup> = new Map([
  [1, 'chest'],
  [2, 'quads'],
  [3, 'chest'],
]);

const set = (exerciseId: number, iso: string, isWarmup = false) => ({
  exerciseId,
  isWarmup,
  createdAt: new Date(iso),
});

describe('weeklyVolumeByMuscleGroup', () => {
  it('counts effective sets of the given ISO week grouped by muscle', () => {
    const sets = [
      set(1, '2026-01-12T10:00:00Z'),
      set(1, '2026-01-12T10:05:00Z'),
      set(3, '2026-01-14T10:00:00Z'),
      set(2, '2026-01-13T10:00:00Z'),
      set(2, '2026-01-13T10:05:00Z'),
      set(2, '2026-01-13T09:55:00Z', true), // warmup: excluded
      set(1, '2026-01-19T10:00:00Z'), // W04: excluded
    ];
    const result = weeklyVolumeByMuscleGroup(sets, groups, { weekKey: '2026-W03', timeZone: 'UTC' });
    expect(result).toEqual(new Map([['chest', 3], ['quads', 2]]));
  });

  it('omits muscle groups with zero sets', () => {
    const result = weeklyVolumeByMuscleGroup(
      [set(1, '2026-01-12T10:00:00Z')],
      groups,
      { weekKey: '2026-W03', timeZone: 'UTC' },
    );
    expect(result.has('quads')).toBe(false);
  });

  it('returns an empty map for no sets', () => {
    const result = weeklyVolumeByMuscleGroup([], groups, { weekKey: '2026-W03', timeZone: 'UTC' });
    expect(result.size).toBe(0);
  });

  it('throws when a set references an exercise missing from the map', () => {
    expect(() =>
      weeklyVolumeByMuscleGroup([set(99, '2026-01-12T10:00:00Z')], groups, {
        weekKey: '2026-W03',
        timeZone: 'UTC',
      }),
    ).toThrow(/99/);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm vitest run packages/core/src/volume.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

`packages/core/src/volume.ts`:

```ts
import { effectiveSets } from './effective-sets';
import type { MuscleGroup } from './types';
import { isoWeekKey } from './weeks';

export function weeklyVolumeByMuscleGroup(
  sets: ReadonlyArray<{ exerciseId: number; isWarmup: boolean; createdAt: Date }>,
  muscleGroupByExerciseId: ReadonlyMap<number, MuscleGroup>,
  options: { weekKey: string; timeZone: string },
): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>();
  for (const set of effectiveSets(sets)) {
    if (isoWeekKey(set.createdAt, options.timeZone) !== options.weekKey) {
      continue;
    }
    const group = muscleGroupByExerciseId.get(set.exerciseId);
    if (group === undefined) {
      throw new Error(`Unknown exerciseId ${set.exerciseId} in muscleGroupByExerciseId map`);
    }
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}
```

Agregar a `packages/core/src/index.ts`:

```ts
export * from './volume';
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm vitest run packages/core/src/volume.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/volume.ts packages/core/src/volume.test.ts packages/core/src/index.ts
git commit -m "feat(core): add weekly volume per muscle group" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: `core/stagnation` — detección de estancamiento

**Files:**
- Create: `packages/core/src/stagnation.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/stagnation.test.ts`

**Interfaces:**
- Consumes: `effectiveSets` (Task 2), `isoWeekKey`, `compareWeekKeys` (Task 3), `estimate1RM` (Task 4).
- Produces:

```ts
interface StagnationOptions { timeZone: string; weeks?: number } // weeks default 3, entero >= 1
type StagnationResult =
  | { stagnant: false }
  | { stagnant: true; recordWeekKey: string; record1RM: number; weeksWithoutImprovement: number; best1RMSinceRecord: number };
detectStagnation(sets, options): StagnationResult
```

  `sets` es `ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean; createdAt: Date }>` **de un solo ejercicio**. Nota: el diseño listaba un parámetro `now`; el algoritmo no lo necesita (solo cuenta semanas presentes en los datos) y se elimina del contrato — registrarlo en `DECISIONS.md` en este mismo task.

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/stagnation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectStagnation } from './stagnation';

// Semanas ISO 2026 usadas (lunes): W02=ene05, W03=ene12, W04=ene19, W05=ene26, W06=feb02.
const set = (weightKg: number, reps: number, iso: string, isWarmup = false) => ({
  weightKg,
  reps,
  isWarmup,
  createdAt: new Date(iso),
});
const UTC = { timeZone: 'UTC' };

describe('detectStagnation', () => {
  it('is not stagnant with no sets', () => {
    expect(detectStagnation([], UTC)).toEqual({ stagnant: false });
  });

  it('is not stagnant with a single trained week', () => {
    expect(detectStagnation([set(100, 1, '2026-01-05T12:00:00Z')], UTC)).toEqual({ stagnant: false });
  });

  it('is not stagnant with fewer trained weeks after the record than the threshold', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record 100
      set(80, 5, '2026-01-12T12:00:00Z'), // W03: 93.3
      set(80, 5, '2026-01-19T12:00:00Z'), // W04: 93.3
    ];
    expect(detectStagnation(sets, UTC)).toEqual({ stagnant: false });
  });

  it('is stagnant with exactly 3 trained weeks after the record without beating it', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record
      set(80, 5, '2026-01-12T12:00:00Z'), // W03
      set(82.5, 5, '2026-01-19T12:00:00Z'), // W04: 96.25
      set(80, 5, '2026-01-26T12:00:00Z'), // W05
    ];
    expect(detectStagnation(sets, UTC)).toEqual({
      stagnant: true,
      recordWeekKey: '2026-W02',
      record1RM: 100,
      weeksWithoutImprovement: 3,
      best1RMSinceRecord: 82.5 * (1 + 5 / 30),
    });
  });

  it('ignores calendar weeks without training (gaps do not count)', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record
      set(80, 5, '2026-01-19T12:00:00Z'), // W04 (W03 sin entrenar)
      set(80, 5, '2026-02-02T12:00:00Z'), // W06
      set(80, 5, '2026-02-16T12:00:00Z'), // W08
    ];
    const result = detectStagnation(sets, UTC);
    expect(result.stagnant).toBe(true);
    expect(result.stagnant && result.weeksWithoutImprovement).toBe(3);
  });

  it('does not renew the record when it is merely equaled later', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record
      set(100, 1, '2026-01-12T12:00:00Z'), // W03: iguala, no renueva
      set(80, 5, '2026-01-19T12:00:00Z'), // W04
      set(80, 5, '2026-01-26T12:00:00Z'), // W05
    ];
    const result = detectStagnation(sets, UTC);
    expect(result).toEqual({
      stagnant: true,
      recordWeekKey: '2026-W02',
      record1RM: 100,
      weeksWithoutImprovement: 3,
      best1RMSinceRecord: 100,
    });
  });

  it('resets the count when the record is strictly beaten', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02
      set(90, 1, '2026-01-12T12:00:00Z'), // W03
      set(102, 1, '2026-01-19T12:00:00Z'), // W04: nuevo record
      set(95, 1, '2026-01-26T12:00:00Z'), // W05
      set(96, 1, '2026-02-02T12:00:00Z'), // W06
    ];
    expect(detectStagnation(sets, UTC)).toEqual({ stagnant: false }); // solo 2 semanas tras W04
  });

  it('honors a custom weeks threshold', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'),
      set(80, 5, '2026-01-12T12:00:00Z'),
      set(80, 5, '2026-01-19T12:00:00Z'),
    ];
    expect(detectStagnation(sets, { timeZone: 'UTC', weeks: 2 }).stagnant).toBe(true);
  });

  it('excludes warmup sets from 1RM computation', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record 100
      set(80, 5, '2026-01-12T12:00:00Z', false),
      set(150, 1, '2026-01-12T11:00:00Z', true), // warmup pesado: no cuenta
      set(80, 5, '2026-01-19T12:00:00Z'),
      set(80, 5, '2026-01-26T12:00:00Z'),
    ];
    const result = detectStagnation(sets, UTC);
    expect(result.stagnant).toBe(true);
    expect(result.stagnant && result.record1RM).toBe(100);
  });

  it('buckets by local week: same data differs between UTC and UTC-6', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record
      set(80, 5, '2026-01-12T12:00:00Z'), // W03 en ambas zonas
      set(80, 5, '2026-01-21T12:00:00Z'), // W04 en ambas zonas
      set(80, 5, '2026-01-26T03:00:00Z'), // lunes 03:00 UTC = domingo 21:00 en Guatemala
    ];
    expect(detectStagnation(sets, { timeZone: 'UTC' }).stagnant).toBe(true); // W03,W04,W05
    expect(detectStagnation(sets, { timeZone: 'America/Guatemala' }).stagnant).toBe(false); // W03,W04
  });

  it('keeps the best 1RM per week when a week has several sets', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'),
      set(60, 8, '2026-01-12T10:00:00Z'), // 76
      set(90, 2, '2026-01-12T10:10:00Z'), // 96 (mejor de W03)
      set(80, 5, '2026-01-19T12:00:00Z'),
      set(80, 5, '2026-01-26T12:00:00Z'),
    ];
    const result = detectStagnation(sets, UTC);
    expect(result.stagnant && result.best1RMSinceRecord).toBe(96);
  });

  it('throws on an invalid weeks threshold', () => {
    expect(() => detectStagnation([], { timeZone: 'UTC', weeks: 0 })).toThrow();
    expect(() => detectStagnation([], { timeZone: 'UTC', weeks: 1.5 })).toThrow();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm vitest run packages/core/src/stagnation.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

`packages/core/src/stagnation.ts`:

```ts
import { effectiveSets } from './effective-sets';
import { estimate1RM } from './one-rep-max';
import { compareWeekKeys, isoWeekKey } from './weeks';

export interface StagnationOptions {
  timeZone: string;
  /** Semanas entrenadas sin superar el récord para considerar estancamiento. Default 3. */
  weeks?: number;
}

export type StagnationResult =
  | { stagnant: false }
  | {
      stagnant: true;
      recordWeekKey: string;
      record1RM: number;
      weeksWithoutImprovement: number;
      best1RMSinceRecord: number;
    };

export function detectStagnation(
  sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean; createdAt: Date }>,
  options: StagnationOptions,
): StagnationResult {
  const weeks = options.weeks ?? 3;
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new Error(`weeks must be a positive integer, got ${weeks}`);
  }

  const bestByWeek = new Map<string, number>();
  for (const set of effectiveSets(sets)) {
    const weekKey = isoWeekKey(set.createdAt, options.timeZone);
    const estimated = estimate1RM(set.weightKg, set.reps);
    const currentBest = bestByWeek.get(weekKey);
    if (currentBest === undefined || estimated > currentBest) {
      bestByWeek.set(weekKey, estimated);
    }
  }
  if (bestByWeek.size === 0) {
    return { stagnant: false };
  }

  const orderedWeeks = [...bestByWeek.entries()].sort(([a], [b]) => compareWeekKeys(a, b));

  // Con comparación estricta (>), los empates conservan la semana más antigua:
  // la "semana del récord" es la PRIMERA que alcanzó el máximo histórico.
  let recordWeekKey = '';
  let record1RM = 0;
  for (const [weekKey, best] of orderedWeeks) {
    if (best > record1RM) {
      record1RM = best;
      recordWeekKey = weekKey;
    }
  }

  const weeksAfterRecord = orderedWeeks.filter(([weekKey]) => compareWeekKeys(weekKey, recordWeekKey) > 0);
  if (weeksAfterRecord.length < weeks) {
    return { stagnant: false };
  }

  // record1RM es el máximo global, así que ninguna semana posterior pudo superarlo:
  // basta con contar cuántas semanas entrenadas hay después del récord.
  let best1RMSinceRecord = 0;
  for (const [, best] of weeksAfterRecord) {
    if (best > best1RMSinceRecord) {
      best1RMSinceRecord = best;
    }
  }
  return {
    stagnant: true,
    recordWeekKey,
    record1RM,
    weeksWithoutImprovement: weeksAfterRecord.length,
    best1RMSinceRecord,
  };
}
```

Agregar a `packages/core/src/index.ts`:

```ts
export * from './stagnation';
```

Agregar al final de la sección "2026-07-23 — Fase 0" de `DECISIONS.md`:

```markdown
- **`detectStagnation` no recibe `now`**: el diseño lo listaba, pero el algoritmo solo cuenta
  semanas presentes en los datos; un parámetro sin uso es superficie de confusión.
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm vitest run packages/core/src/stagnation.test.ts`
Expected: 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/stagnation.ts packages/core/src/stagnation.test.ts packages/core/src/index.ts DECISIONS.md
git commit -m "feat(core): add stagnation detection with configurable threshold" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: `core/set-parser` — parser de texto libre

**Files:**
- Create: `packages/core/src/set-parser.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/set-parser.test.ts`

**Interfaces:**
- Consumes: nada de otros módulos.
- Produces:

```ts
interface ParsedSet { exerciseName?: string; weightKg: number; reps: number; rpe?: number }
type ParseErrorReason = 'empty_input' | 'no_set_found' | 'missing_reps' | 'invalid_weight' | 'invalid_reps' | 'invalid_rpe'
type ParseResult = { ok: true; value: ParsedSet } | { ok: false; reason: ParseErrorReason }
parseSetInput(text: string): ParseResult
```

  Nunca lanza. Los códigos de `reason` los traduce el bot a español (Fase 1).

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/set-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseSetInput } from './set-parser';

describe('parseSetInput — valid inputs', () => {
  const cases: Array<[string, object]> = [
    ['60x8', { weightKg: 60, reps: 8 }],
    ['60 x 8', { weightKg: 60, reps: 8 }],
    ['60X8', { weightKg: 60, reps: 8 }],
    ['60×8', { weightKg: 60, reps: 8 }],
    ['  60x8  ', { weightKg: 60, reps: 8 }],
    ['32,5x10', { weightKg: 32.5, reps: 10 }],
    ['32.5x10', { weightKg: 32.5, reps: 10 }],
    ['100kg x 5', { weightKg: 100, reps: 5 }],
    ['60x8 rpe8', { weightKg: 60, reps: 8, rpe: 8 }],
    ['60x8 rpe 8.5', { weightKg: 60, reps: 8, rpe: 8.5 }],
    ['60x8 RPE8,5', { weightKg: 60, reps: 8, rpe: 8.5 }],
    ['press inclinado 32.5x10', { exerciseName: 'press inclinado', weightKg: 32.5, reps: 10 }],
    ['Press Banca 60x8 rpe9', { exerciseName: 'Press Banca', weightKg: 60, reps: 8, rpe: 9 }],
    ['extension x cuerda 30x10', { exerciseName: 'extension x cuerda', weightKg: 30, reps: 10 }],
  ];

  it.each(cases)('parses %s', (input, expected) => {
    expect(parseSetInput(input)).toEqual({ ok: true, value: expected });
  });
});

describe('parseSetInput — invalid inputs', () => {
  const cases: Array<[string, string]> = [
    ['', 'empty_input'],
    ['   ', 'empty_input'],
    ['x8', 'no_set_found'],
    ['hola que tal', 'no_set_found'],
    ['60x8 extra', 'no_set_found'],
    ['60x', 'missing_reps'],
    ['0x8', 'invalid_weight'],
    ['-10x8', 'invalid_weight'],
    ['60x0', 'invalid_reps'],
    ['60x8 rpe15', 'invalid_rpe'],
    ['60x8 rpe0', 'invalid_rpe'],
  ];

  it.each(cases)('rejects %s with %s', (input, reason) => {
    expect(parseSetInput(input)).toEqual({ ok: false, reason });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm vitest run packages/core/src/set-parser.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

`packages/core/src/set-parser.ts`:

```ts
export interface ParsedSet {
  exerciseName?: string;
  weightKg: number;
  reps: number;
  rpe?: number;
}

export type ParseErrorReason =
  | 'empty_input'
  | 'no_set_found'
  | 'missing_reps'
  | 'invalid_weight'
  | 'invalid_reps'
  | 'invalid_rpe';

export type ParseResult = { ok: true; value: ParsedSet } | { ok: false; reason: ParseErrorReason };

// [nombre] peso [kg] x reps [rpe N] — siempre peso primero, tolerante a espacios,
// mayúsculas y coma decimal. El nombre queda como texto crudo (matching en Fase 1).
const SET_PATTERN =
  /^(?<name>.*?)\s*(?<weight>\d+(?:[.,]\d+)?)\s*(?:kg)?\s*[x×]\s*(?<reps>\d+)(?:\s*rpe\s*(?<rpe>\d+(?:[.,]\d+)?))?$/i;

const toNumber = (raw: string): number => Number(raw.replace(',', '.'));

export function parseSetInput(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'empty_input' };
  }
  // Un "-" inicial es un peso negativo, no un nombre de ejercicio.
  if (trimmed.startsWith('-')) {
    return { ok: false, reason: 'invalid_weight' };
  }
  const match = SET_PATTERN.exec(trimmed);
  if (!match?.groups) {
    return { ok: false, reason: /[x×]\s*$/i.test(trimmed) ? 'missing_reps' : 'no_set_found' };
  }
  const { name, weight, reps: rawReps, rpe: rawRpe } = match.groups;
  if (weight === undefined || rawReps === undefined) {
    return { ok: false, reason: 'no_set_found' };
  }

  const weightKg = toNumber(weight);
  if (!(weightKg > 0)) {
    return { ok: false, reason: 'invalid_weight' };
  }
  const reps = Number(rawReps);
  if (reps < 1) {
    return { ok: false, reason: 'invalid_reps' };
  }

  const value: ParsedSet = { weightKg, reps };
  const exerciseName = name?.trim();
  if (exerciseName) {
    value.exerciseName = exerciseName;
  }
  if (rawRpe !== undefined) {
    const rpe = toNumber(rawRpe);
    if (rpe < 1 || rpe > 10) {
      return { ok: false, reason: 'invalid_rpe' };
    }
    value.rpe = rpe;
  }
  return { ok: true, value };
}
```

Agregar a `packages/core/src/index.ts`:

```ts
export * from './set-parser';
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm vitest run packages/core/src/set-parser.test.ts`
Expected: 25 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/set-parser.ts packages/core/src/set-parser.test.ts packages/core/src/index.ts
git commit -m "feat(core): add free-text set parser" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: `core/rest` — descanso derivado

**Files:**
- Create: `packages/core/src/rest.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/rest.test.ts`

**Interfaces:**
- Consumes: nada de otros módulos.
- Produces: `deriveRestSeconds(sets: ReadonlyArray<{ position: number; createdAt: Date }>): Array<number | undefined>` — resultado alineado con los sets ordenados por `position`; la primera serie es `undefined`.

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/rest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveRestSeconds } from './rest';

describe('deriveRestSeconds', () => {
  it('derives rest from consecutive createdAt gaps, ordered by position', () => {
    const sets = [
      { position: 2, createdAt: new Date('2026-01-12T10:02:30Z') },
      { position: 1, createdAt: new Date('2026-01-12T10:00:00Z') },
      { position: 3, createdAt: new Date('2026-01-12T10:04:00Z') },
    ];
    expect(deriveRestSeconds(sets)).toEqual([undefined, 150, 90]);
  });

  it('returns [undefined] for a single set and [] for none', () => {
    expect(deriveRestSeconds([{ position: 1, createdAt: new Date() }])).toEqual([undefined]);
    expect(deriveRestSeconds([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm vitest run packages/core/src/rest.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

`packages/core/src/rest.ts`:

```ts
export function deriveRestSeconds(
  sets: ReadonlyArray<{ position: number; createdAt: Date }>,
): Array<number | undefined> {
  const ordered = [...sets].sort((a, b) => a.position - b.position);
  return ordered.map((set, index) => {
    const previous = ordered[index - 1];
    if (previous === undefined) {
      return undefined;
    }
    return Math.round((set.createdAt.getTime() - previous.createdAt.getTime()) / 1000);
  });
}
```

Agregar a `packages/core/src/index.ts`:

```ts
export * from './rest';
```

- [ ] **Step 4: Verificar suite completa de core y typecheck**

Run: `pnpm vitest run packages/core`
Expected: todos los tests de core PASS.
Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rest.ts packages/core/src/rest.test.ts packages/core/src/index.ts
git commit -m "feat(core): derive rest seconds from consecutive set timestamps" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: `packages/db` — esquema Drizzle y migración generada

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/index.ts`
- Create (generados): `packages/db/drizzle/0000_*.sql`, `packages/db/drizzle/meta/*`

**Interfaces:**
- Consumes: `MUSCLE_GROUPS` de `@gym-tracker/core` (Task 2).
- Produces: tablas Drizzle exportadas (`users`, `exercises`, `routines`, `routineDays`, `routineExercises`, `workouts`, `sets`, `processedUpdates`) y la migración SQL inicial versionada. La verificación ejecutable llega en Task 11 (runner + tests); aquí se valida por inspección del SQL generado.

- [ ] **Step 1: Crear el paquete e instalar dependencias**

`packages/db/package.json`:

```json
{
  "name": "@gym-tracker/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "generate": "drizzle-kit generate"
  }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "drizzle.config.ts"]
}
```

Run: `pnpm --filter @gym-tracker/db add drizzle-orm @gym-tracker/core`
Run: `pnpm --filter @gym-tracker/db add -D drizzle-kit @types/node`
Expected: `@gym-tracker/core` queda como `workspace:` en `package.json`. (Dependencias ya justificadas en `DECISIONS.md` / SPEC §3.)

- [ ] **Step 2: Escribir esquema y config**

`packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
});
```

`packages/db/src/schema.ts`:

```ts
import { MUSCLE_GROUPS } from '@gym-tracker/core';
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const muscleGroupList = MUSCLE_GROUPS.map((group) => `'${group}'`).join(', ');

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramUserId: integer('telegram_user_id').notNull().unique(),
  timezone: text('timezone').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const exercises = sqliteTable(
  'exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id),
    name: text('name').notNull(),
    muscleGroup: text('muscle_group', { enum: MUSCLE_GROUPS }).notNull(),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [check('exercises_muscle_group_check', sql.raw(`muscle_group IN (${muscleGroupList})`))],
);

export const routines = sqliteTable('routines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const routineDays = sqliteTable('routine_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  routineId: integer('routine_id').notNull().references(() => routines.id),
  name: text('name').notNull(),
  position: integer('position').notNull(),
});

export const routineExercises = sqliteTable('routine_exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  routineDayId: integer('routine_day_id').notNull().references(() => routineDays.id),
  exerciseId: integer('exercise_id').notNull().references(() => exercises.id),
  position: integer('position').notNull(),
  targetSets: integer('target_sets'),
  targetRepsMin: integer('target_reps_min'),
  targetRepsMax: integer('target_reps_max'),
  targetRestSeconds: integer('target_rest_seconds'),
});

export const workouts = sqliteTable(
  'workouts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id),
    routineDayId: integer('routine_day_id').references(() => routineDays.id),
    dayNameSnapshot: text('day_name_snapshot'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
  },
  (table) => [index('workouts_user_started_idx').on(table.userId, table.startedAt)],
);

export const sets = sqliteTable(
  'sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutId: integer('workout_id').notNull().references(() => workouts.id),
    exerciseId: integer('exercise_id').notNull().references(() => exercises.id),
    position: integer('position').notNull(),
    weightKg: real('weight_kg').notNull(),
    reps: integer('reps').notNull(),
    rpe: real('rpe'),
    restSeconds: integer('rest_seconds'),
    isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('sets_workout_idx').on(table.workoutId),
    index('sets_exercise_created_idx').on(table.exerciseId, table.createdAt),
  ],
);

export const processedUpdates = sqliteTable('processed_updates', {
  updateId: integer('update_id').primaryKey(),
  processedAt: integer('processed_at', { mode: 'timestamp_ms' }).notNull(),
});
```

`packages/db/src/index.ts`:

```ts
export * from './schema';
```

- [ ] **Step 3: Generar la migración**

Run: `pnpm --filter @gym-tracker/db generate`
Expected: crea `packages/db/drizzle/0000_<tag>.sql` y `packages/db/drizzle/meta/_journal.json` sin errores. (Si drizzle-kit no resuelve el import de `@gym-tracker/core`, repórtalo: no dupliques el enum en `db`.)

- [ ] **Step 4: Inspeccionar el SQL generado**

Abrir `packages/db/drizzle/0000_*.sql` y verificar: 8 sentencias `CREATE TABLE` (users, exercises, routines, routine_days, routine_exercises, workouts, sets, processed_updates), los 3 `CREATE INDEX` (`workouts_user_started_idx`, `sets_workout_idx`, `sets_exercise_created_idx`), el `UNIQUE` de `telegram_user_id` y un `CHECK` con los 17 grupos musculares. Si falta el CHECK, detente e investiga la versión de drizzle-kit antes de continuar.

- [ ] **Step 5: Typecheck y commit**

Run: `pnpm typecheck`
Expected: sin errores.

```bash
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): add drizzle schema and initial migration" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: `db` — apertura de base y runner de migraciones

**Files:**
- Create: `packages/db/src/database.ts`
- Create: `packages/db/src/migrations.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/migrations.test.ts`

**Interfaces:**
- Consumes: migración generada en Task 10 (`packages/db/drizzle/`).
- Produces: `openDatabase(path: string): DatabaseSync` (activa `PRAGMA foreign_keys = ON`); `runMigrations(db: DatabaseSync, migrationsDir: string): string[]` (aplica pendientes según `meta/_journal.json`, transaccional por migración, idempotente; devuelve los tags aplicados); `MIGRATIONS_DIR: string` (ruta absoluta al directorio `drizzle/` del paquete). El server (Fase 1) llamará `runMigrations(openDatabase(dbPath), MIGRATIONS_DIR)` en cada arranque (SPEC §9).

- [ ] **Step 1: Escribir los tests que fallan**

`packages/db/src/migrations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from './index';

const EXPECTED_TABLES = [
  'exercises',
  'processed_updates',
  'routine_days',
  'routine_exercises',
  'routines',
  'sets',
  'users',
  'workouts',
];

function migratedDb() {
  const db = openDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('runMigrations', () => {
  it('creates all tables from SPEC §4', () => {
    const db = migratedDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(rows.map((row) => row.name)).toEqual(EXPECTED_TABLES);
  });

  it('creates the analytics indexes', () => {
    const db = migratedDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    const names = rows.map((row) => row.name);
    expect(names).toContain('sets_workout_idx');
    expect(names).toContain('sets_exercise_created_idx');
    expect(names).toContain('workouts_user_started_idx');
  });

  it('is idempotent: a second run applies nothing', () => {
    const db = openDatabase(':memory:');
    const first = runMigrations(db, MIGRATIONS_DIR);
    expect(first.length).toBeGreaterThan(0);
    expect(runMigrations(db, MIGRATIONS_DIR)).toEqual([]);
  });

  it('rejects a muscle_group outside the enum via CHECK', () => {
    const db = migratedDb();
    const insert = db.prepare('INSERT INTO exercises (name, muscle_group) VALUES (?, ?)');
    expect(() => insert.run('Press banca', 'legs')).toThrow();
    expect(() => insert.run('Press banca', 'chest')).not.toThrow();
  });

  it('enforces foreign keys', () => {
    const db = migratedDb();
    const insert = db.prepare(
      'INSERT INTO sets (workout_id, exercise_id, position, weight_kg, reps, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    expect(() => insert.run(999, 999, 1, 60, 8, Date.now())).toThrow(/FOREIGN KEY|constraint/i);
  });

  it('applies boolean defaults', () => {
    const db = migratedDb();
    db.prepare('INSERT INTO exercises (name, muscle_group) VALUES (?, ?)').run('Sentadilla', 'quads');
    const row = db.prepare('SELECT is_custom, archived FROM exercises').get() as {
      is_custom: number;
      archived: number;
    };
    expect(row).toEqual({ is_custom: 0, archived: 0 });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm vitest run packages/db`
Expected: FAIL — `openDatabase`/`runMigrations` no existen.

- [ ] **Step 3: Implementar**

`packages/db/src/database.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}
```

`packages/db/src/migrations.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'drizzle');

interface JournalEntry {
  idx: number;
  tag: string;
}

export function runMigrations(db: DatabaseSync, migrationsDir: string): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  const appliedRows = db.prepare('SELECT tag FROM schema_migrations').all() as Array<{ tag: string }>;
  const applied = new Set(appliedRows.map((row) => row.tag));
  const insertApplied = db.prepare('INSERT INTO schema_migrations (tag, applied_at) VALUES (?, ?)');

  const newlyApplied: string[] = [];
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    if (applied.has(entry.tag)) {
      continue;
    }
    // Los "--> statement-breakpoint" de drizzle-kit son comentarios SQL (--),
    // así que el archivo completo se puede ejecutar tal cual.
    const migrationSql = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(migrationSql);
      insertApplied.run(entry.tag, Date.now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    newlyApplied.push(entry.tag);
  }
  return newlyApplied;
}
```

`packages/db/src/index.ts` queda:

```ts
export * from './schema';
export { openDatabase } from './database';
export { MIGRATIONS_DIR, runMigrations } from './migrations';
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm vitest run packages/db`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/database.ts packages/db/src/migrations.ts packages/db/src/migrations.test.ts packages/db/src/index.ts
git commit -m "feat(db): add node:sqlite database opener and migration runner" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Verificación final de la Fase 0

**Files:**
- Modify: ninguno salvo que la verificación encuentre fallos.

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: evidencia del criterio de aceptación de la fase.

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: todos los tests de `core` y `db` PASS, cero skips.

- [ ] **Step 2: Typecheck completo**

Run: `pnpm typecheck`
Expected: sin errores en ambos paquetes.

- [ ] **Step 3: Verificar el criterio de aceptación**

Confirmar que la suite cubre, sobre datos ficticios: volumen (`volume.test.ts`), 1RM (`one-rep-max.test.ts`), récords (`records.test.ts`) y estancamiento (`stagnation.test.ts`). Confirmar que `packages/core` no tiene dependencias de runtime (`dependencies` ausente en su `package.json`) y que ningún archivo de `core/src` importa `node:*`, `drizzle-orm` ni `@gym-tracker/db` (buscar con grep).

- [ ] **Step 4: Reportar**

Reportar al usuario: resultado de la suite, número de tests, y que la Fase 0 queda lista. **No empezar la Fase 1** (SPEC §11: detenerse y reportar al terminar cada fase).
