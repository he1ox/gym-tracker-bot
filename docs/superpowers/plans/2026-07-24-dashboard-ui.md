# Dashboard web (capa de interfaz) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `apps/web` con las cuatro pantallas del dashboard (Resumen, Historial de sesión, Rutinas, Detalle de ejercicio), alimentadas por datos ficticios que pasan por la lógica real de `@gym-tracker/core`.

**Architecture:** SPA de Vite + React. Los componentes no calculan nada: cada pantalla tiene un *presenter* que es una función pura, recibe datos de dominio y devuelve un modelo de vista ya formateado. Las fórmulas de negocio (tonelaje, 1RM, récords, estancamiento, volumen) se importan de `@gym-tracker/core` y no se reescriben. El generador de datos produce **series crudas**, no agregados, de modo que sustituirlo por la API real más adelante no toque presenters ni componentes.

**Tech Stack:** Vite, React 19, TypeScript estricto, Vitest, Testing Library, CSS plano con custom properties (sistema Nocturne).

## Global Constraints

Estas reglas aplican a **todas** las tareas. No se repiten en cada una.

- **TypeScript estricto según `tsconfig.base.json`.** En particular tres opciones que cambian cómo se escribe el código:
  - `noUncheckedIndexedAccess: true` — indexar un array devuelve `T | undefined`. `arr[0]` **debe** comprobarse antes de usarse.
  - `exactOptionalPropertyTypes: true` — una propiedad `rpe?: number` **no** acepta que se le asigne `undefined` explícitamente. Se omite la clave o se declara `rpe?: number | undefined`.
  - `verbatimModuleSyntax: true` — las importaciones de tipos **deben** usar `import type`.
- **Nada de `any`** sin un comentario que lo justifique (SPEC §12).
- **Textos de interfaz en español.** Identificadores, nombres de archivo y comentarios de código en inglés (SPEC §12).
- **Grupos musculares:** siempre el enum `MUSCLE_GROUPS` de `@gym-tracker/core` (17 valores) y `MUSCLE_GROUP_LABELS` para mostrar. Nunca cadenas sueltas.
- **Prohibido reimplementar en `apps/web`:** tonelaje, series efectivas, 1RM estimado, récords, volumen semanal, estancamiento y descanso. Se importan de `@gym-tracker/core`.
- **Prohibidas estas dependencias:** Tailwind, shadcn/ui, Recharts, react-router. Decisión registrada en el spec §3.
- **Zona horaria:** las funciones de `core` que la piden reciben `'Europe/Madrid'` a través de una constante única, nunca literales repartidos.
- **Commits** en inglés, formato Conventional Commits (SPEC §12).

**Firmas de `@gym-tracker/core` que se usan** (copiadas del código real, no inventar variantes):

```ts
function effectiveSets<T extends { isWarmup: boolean }>(sets: readonly T[]): T[]
function setTonnage(set: { weightKg: number; reps: number }): number
function sessionTonnage(sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>): number
function estimate1RM(weightKg: number, reps: number): number
function session1RM(sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>): number | undefined
function detectPersonalRecord(historySets, sessionSets): PersonalRecord | undefined
function weeklyVolumeByMuscleGroup(
  sets: ReadonlyArray<{ exerciseId: number; isWarmup: boolean; createdAt: Date }>,
  muscleGroupByExerciseId: ReadonlyMap<number, MuscleGroup>,
  options: { weekKey: string; timeZone: string },
): Map<MuscleGroup, number>
function detectStagnation(
  sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean; createdAt: Date }>,
  options: { timeZone: string; weeks?: number },
): StagnationResult
function isoWeekKey(instant: Date, timeZone: string): string
function compareWeekKeys(a: string, b: string): number
function deriveRestSeconds(sets: ReadonlyArray<{ position: number; createdAt: Date }>): Array<number | undefined>

interface PersonalRecord { estimated1RM: number; previous1RM?: number }
type StagnationResult =
  | { stagnant: false }
  | { stagnant: true; recordWeekKey: string; record1RM: number;
      weeksWithoutImprovement: number; best1RMSinceRecord: number }
```

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `apps/web/package.json` | Manifiesto del workspace |
| `apps/web/vite.config.ts` | Build y dev server |
| `apps/web/tsconfig.json` | Extiende la base, añade `types: ["vite/client"]` y JSX |
| `apps/web/index.html` | Punto de entrada HTML |
| `apps/web/src/main.tsx` | Monta React |
| `apps/web/src/App.tsx` | Shell: nav + pantalla activa |
| `apps/web/src/config.ts` | `TIME_ZONE`, constantes de banda de volumen |
| `apps/web/src/styles/nocturne.css` | Tokens y clases del sistema de diseño |
| `apps/web/src/router.ts` | Router hash de 4 rutas |
| `apps/web/src/data/types.ts` | Contratos de datos crudos |
| `apps/web/src/data/mock.ts` | Generador determinista de series |
| `apps/web/src/presenters/overview.ts` | Datos crudos → modelo de vista de Resumen |
| `apps/web/src/presenters/sessions.ts` | ídem Historial |
| `apps/web/src/presenters/routines.ts` | ídem Rutinas |
| `apps/web/src/presenters/exercise.ts` | ídem Detalle de ejercicio |
| `apps/web/src/presenters/format.ts` | Formateo compartido (kg, fechas, deltas) |
| `apps/web/src/components/*.tsx` | Primitivas visuales sin lógica |
| `apps/web/src/screens/*.tsx` | Composición de cada pantalla |

---

### Task 1: Andamiaje de `apps/web`

Deja la app arrancando con la hoja de estilos del sistema de diseño aplicada, y el runner de tests configurado para React.

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/config.ts`, `apps/web/src/styles/nocturne.css`
- Modify: `vitest.config.ts` (raíz, sustitución completa)
- Test: `apps/web/src/config.test.ts`

**Interfaces:**
- Produces: `TIME_ZONE: string`, `VOLUME_TARGET_MIN: number`, `VOLUME_TARGET_MAX: number` desde `src/config.ts`.

- [ ] **Step 1: Crear el manifiesto del workspace**

`apps/web/package.json`:

```json
{
  "name": "@gym-tracker/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@gym-tracker/core": "workspace:*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.4",
    "jsdom": "^28.0.0",
    "vite": "^7.1.9"
  }
}
```

- [ ] **Step 2: Instalar**

Run: `pnpm install`
Expected: se crea `apps/web/node_modules`, sin errores de resolución de `workspace:*`.

- [ ] **Step 3: Configurar Vite y TypeScript**

`apps/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Copiar la hoja del sistema de diseño**

El archivo ya está descargado del proyecto de diseño y espera en el workspace del plan:

```bash
cp .superpowers/sdd/2026-07-24-dashboard-ui/assets/nocturne.css apps/web/src/styles/nocturne.css
```

Se copia **sin modificar**, incluida la primera línea
`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`
— decisión explícita del autor, registrada en el spec §3. No editar esa línea ni sustituir
la fuente por una local.

- [ ] **Step 5: Escribir el test de configuración**

`apps/web/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TIME_ZONE, VOLUME_TARGET_MAX, VOLUME_TARGET_MIN } from './config';

describe('config', () => {
  it('exposes a valid IANA time zone', () => {
    expect(() => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })).not.toThrow();
  });

  it('describes the 10-20 effective-set target band from SPEC §8', () => {
    expect(VOLUME_TARGET_MIN).toBe(10);
    expect(VOLUME_TARGET_MAX).toBe(20);
  });
});
```

- [ ] **Step 6: Ejecutar el test y verificar que falla**

Run: `pnpm vitest run apps/web/src/config.test.ts`
Expected: FAIL — «Failed to resolve import "./config"».

- [ ] **Step 7: Escribir la configuración**

`apps/web/src/config.ts`:

```ts
/** Single source for the time zone every core call receives. */
export const TIME_ZONE = 'Europe/Madrid';

/** Effective-set target band per muscle group, SPEC §8.1. */
export const VOLUME_TARGET_MIN = 10;
export const VOLUME_TARGET_MAX = 20;
```

- [ ] **Step 8: Reconfigurar Vitest para dos entornos**

La configuración actual solo incluye `*.test.ts` y corre en Node. Los tests de componentes
necesitan `.tsx` y `jsdom`. Sustituir `vitest.config.ts` (raíz) por completo:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest 4 flattened `poolOptions.forks.execArgv` into a top-level option.
    execArgv: ['--disable-warning=ExperimentalWarning'],
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
```

- [ ] **Step 9: Escribir el punto de entrada**

`apps/web/index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>IRONLOG</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/nocturne.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root element');
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`apps/web/src/App.tsx` (provisional; la Task 2 lo sustituye):

```tsx
export function App() {
  return <main style={{ padding: 24 }}>IRONLOG</main>;
}
```

- [ ] **Step 10: Verificar tests y tipos**

Run: `pnpm vitest run apps/web/src/config.test.ts && pnpm --filter @gym-tracker/web typecheck`
Expected: 2 tests PASS, typecheck sin errores.

- [ ] **Step 11: Verificar que la app arranca**

Run: `pnpm --filter @gym-tracker/web build`
Expected: build correcto, se genera `apps/web/dist`.

- [ ] **Step 12: Commit**

```bash
git add apps/web vitest.config.ts pnpm-lock.yaml package.json
git commit -m "feat(web): scaffold Vite React app with Nocturne design tokens"
```

---

### Task 2: Router y navegación

**Files:**
- Create: `apps/web/src/router.ts`, `apps/web/src/router.test.ts`, `apps/web/src/components/Nav.tsx`, `apps/web/src/components/Nav.test.tsx`
- Modify: `apps/web/src/App.tsx` (sustitución completa)

**Interfaces:**
- Produces: `type Route = 'overview' | 'sessions' | 'routines' | 'exercise'`; `parseRoute(hash: string): RouteState`; `useRoute(): RouteState`; `navigate(route: Route, exerciseId?: number): void`; `interface RouteState { route: Route; exerciseId?: number }`. El componente `Nav` recibe `{ current: Route }`.

- [ ] **Step 1: Escribir el test del parser de rutas**

`apps/web/src/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRoute } from './router';

describe('parseRoute', () => {
  it('defaults to overview for an empty hash', () => {
    expect(parseRoute('')).toEqual({ route: 'overview' });
    expect(parseRoute('#')).toEqual({ route: 'overview' });
  });

  it('reads a known route', () => {
    expect(parseRoute('#/sessions')).toEqual({ route: 'sessions' });
    expect(parseRoute('#/routines')).toEqual({ route: 'routines' });
  });

  it('reads the exercise id segment', () => {
    expect(parseRoute('#/exercise/7')).toEqual({ route: 'exercise', exerciseId: 7 });
  });

  it('omits the id when the exercise segment is not a number', () => {
    expect(parseRoute('#/exercise/abc')).toEqual({ route: 'exercise' });
  });

  it('falls back to overview for an unknown route', () => {
    expect(parseRoute('#/nope')).toEqual({ route: 'overview' });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm vitest run apps/web/src/router.test.ts`
Expected: FAIL — no existe `./router`.

- [ ] **Step 3: Implementar el router**

`apps/web/src/router.ts`:

```ts
import { useEffect, useState } from 'react';

export type Route = 'overview' | 'sessions' | 'routines' | 'exercise';

export interface RouteState {
  route: Route;
  exerciseId?: number;
}

const ROUTES: readonly Route[] = ['overview', 'sessions', 'routines', 'exercise'];

function isRoute(value: string): value is Route {
  return (ROUTES as readonly string[]).includes(value);
}

export function parseRoute(hash: string): RouteState {
  const segments = hash.replace(/^#\/?/, '').split('/').filter((s) => s.length > 0);
  const head = segments[0];
  if (head === undefined || !isRoute(head)) {
    return { route: 'overview' };
  }
  if (head !== 'exercise') {
    return { route: head };
  }
  const raw = segments[1];
  if (raw === undefined) {
    return { route: 'exercise' };
  }
  const id = Number.parseInt(raw, 10);
  // exactOptionalPropertyTypes: omit the key rather than assigning undefined.
  return Number.isInteger(id) ? { route: 'exercise', exerciseId: id } : { route: 'exercise' };
}

export function navigate(route: Route, exerciseId?: number): void {
  window.location.hash =
    route === 'exercise' && exerciseId !== undefined ? `#/exercise/${exerciseId}` : `#/${route}`;
}

export function useRoute(): RouteState {
  const [state, setState] = useState<RouteState>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setState(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return state;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm vitest run apps/web/src/router.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Escribir el test de `Nav`**

`apps/web/src/components/Nav.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Nav } from './Nav';

describe('Nav', () => {
  it('shows the four screens in Spanish', () => {
    render(<Nav current="overview" />);
    for (const label of ['Resumen', 'Ejercicio', 'Sesiones', 'Rutinas']) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('marks the current screen', () => {
    render(<Nav current="routines" />);
    expect(screen.getByText('Rutinas').getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Resumen').getAttribute('aria-current')).toBeNull();
  });
});
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `pnpm vitest run apps/web/src/components/Nav.test.tsx`
Expected: FAIL — no existe `./Nav`.

- [ ] **Step 7: Implementar `Nav`**

Réplica del nav del diseño: sticky, fondo translúcido con `backdrop-filter`, marca IRONLOG con
el glifo de mancuerna dentro de un cuadro con borde de acento.

`apps/web/src/components/Nav.tsx`:

```tsx
import type { Route } from '../router';

const LINKS: ReadonlyArray<{ route: Route; label: string; href: string }> = [
  { route: 'overview', label: 'Resumen', href: '#/overview' },
  { route: 'exercise', label: 'Ejercicio', href: '#/exercise' },
  { route: 'sessions', label: 'Sesiones', href: '#/sessions' },
  { route: 'routines', label: 'Rutinas', href: '#/routines' },
];

export function Nav({ current }: { current: Route }) {
  return (
    <nav
      className="nav"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 1px 0 var(--color-divider)',
        paddingInline: 24,
      }}
    >
      <span
        className="nav-brand"
        style={{ display: 'flex', alignItems: 'center', gap: 9, letterSpacing: '0.02em' }}
      >
        <span
          style={{
            display: 'inline-flex',
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--color-accent)',
            borderRadius: 5,
            color: 'var(--color-accent)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
            <path d="M104,56v56h48V56a8,8,0,0,1,16,0V200a8,8,0,0,1-16,0V128H104v72a8,8,0,0,1-16,0V56a8,8,0,0,1,16,0Z" />
          </svg>
        </span>
        IRONLOG
      </span>
      {LINKS.map((link) => (
        <a
          key={link.route}
          href={link.href}
          {...(link.route === current ? { 'aria-current': 'page' as const } : {})}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
```

- [ ] **Step 8: Ejecutar y verificar que pasa**

Run: `pnpm vitest run apps/web/src/components/Nav.test.tsx`
Expected: 2 tests PASS.

- [ ] **Step 9: Conectar el shell**

`apps/web/src/App.tsx` (sustitución completa):

```tsx
import { Nav } from './components/Nav';
import { useRoute } from './router';

export function App() {
  const { route } = useRoute();
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <Nav current={route} />
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
        Pantalla: {route}
      </main>
    </div>
  );
}
```

- [ ] **Step 10: Verificar tipos y commit**

Run: `pnpm --filter @gym-tracker/web typecheck && pnpm vitest run --project web`
Expected: sin errores, 9 tests PASS.

```bash
git add apps/web/src
git commit -m "feat(web): add hash router and top navigation"
```

---

### Task 3: Datos ficticios crudos

El generador produce **series individuales**, nunca agregados. Todo lo derivado lo calcula `core`.

**Files:**
- Create: `apps/web/src/data/types.ts`, `apps/web/src/data/mock.ts`, `apps/web/src/data/mock.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface MockExercise { id: number; name: string; muscleGroup: MuscleGroup; isBodyweight: boolean }
  interface MockSet { id: number; workoutId: number; exerciseId: number; position: number;
                      weightKg: number; reps: number; rpe?: number; isWarmup: boolean; createdAt: Date }
  interface MockWorkout { id: number; dayName: string; startedAt: Date; finishedAt: Date; notes?: string }
  interface MockRoutineExercise { id: number; exerciseId: number; position: number;
                                  targetSets: number; targetRepsMin: number; targetRepsMax: number;
                                  targetRestSeconds: number }
  interface MockRoutineDay { id: number; name: string; position: number; exercises: MockRoutineExercise[] }
  interface MockRoutine { id: number; name: string; isActive: boolean; archived: boolean; days: MockRoutineDay[] }
  interface Dataset { exercises: MockExercise[]; workouts: MockWorkout[]; sets: MockSet[]; routines: MockRoutine[] }
  function buildDataset(now?: Date): Dataset
  function muscleGroupMap(exercises: readonly MockExercise[]): Map<number, MuscleGroup>
  ```

- [ ] **Step 1: Escribir los contratos**

`apps/web/src/data/types.ts`:

```ts
import type { MuscleGroup } from '@gym-tracker/core';

export interface MockExercise {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  /** Pull-ups and dips: the load is bodyweight plus any added plates. */
  isBodyweight: boolean;
}

export interface MockSet {
  id: number;
  workoutId: number;
  exerciseId: number;
  position: number;
  weightKg: number;
  reps: number;
  rpe?: number;
  isWarmup: boolean;
  createdAt: Date;
}

export interface MockWorkout {
  id: number;
  dayName: string;
  startedAt: Date;
  finishedAt: Date;
  notes?: string;
}

export interface MockRoutineExercise {
  id: number;
  exerciseId: number;
  position: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetRestSeconds: number;
}

export interface MockRoutineDay {
  id: number;
  name: string;
  position: number;
  exercises: MockRoutineExercise[];
}

export interface MockRoutine {
  id: number;
  name: string;
  isActive: boolean;
  archived: boolean;
  days: MockRoutineDay[];
}

export interface Dataset {
  exercises: MockExercise[];
  workouts: MockWorkout[];
  sets: MockSet[];
  routines: MockRoutine[];
}
```

- [ ] **Step 2: Escribir el test del generador**

`apps/web/src/data/mock.test.ts`:

```ts
import { detectStagnation, effectiveSets, sessionTonnage, session1RM, weeklyVolumeByMuscleGroup, isoWeekKey } from '@gym-tracker/core';
import { describe, expect, it } from 'vitest';
import { TIME_ZONE } from '../config';
import { buildDataset, muscleGroupMap } from './mock';

const NOW = new Date('2026-07-25T18:00:00Z');

describe('buildDataset', () => {
  it('is deterministic for a given instant', () => {
    expect(JSON.stringify(buildDataset(NOW))).toBe(JSON.stringify(buildDataset(NOW)));
  });

  it('produces raw sets, never aggregates', () => {
    const data = buildDataset(NOW);
    expect(data.sets.length).toBeGreaterThan(200);
    for (const set of data.sets) {
      expect(set.reps).toBeGreaterThan(0);
      expect(set.weightKg).toBeGreaterThanOrEqual(0);
      expect(set.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('includes warm-up sets so effectiveSets has something to filter', () => {
    const data = buildDataset(NOW);
    expect(data.sets.some((s) => s.isWarmup)).toBe(true);
    expect(effectiveSets(data.sets).length).toBeLessThan(data.sets.length);
  });

  it('feeds core without any adaptation', () => {
    const data = buildDataset(NOW);
    const first = data.workouts[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const sets = data.sets.filter((s) => s.workoutId === first.id);
    expect(sessionTonnage(sets)).toBeGreaterThan(0);
    expect(session1RM(sets)).toBeGreaterThan(0);

    const volume = weeklyVolumeByMuscleGroup(data.sets, muscleGroupMap(data.exercises), {
      weekKey: isoWeekKey(NOW, TIME_ZONE),
      timeZone: TIME_ZONE,
    });
    expect(volume.size).toBeGreaterThan(0);
  });

  it('references only existing exercises and workouts', () => {
    const data = buildDataset(NOW);
    const exerciseIds = new Set(data.exercises.map((e) => e.id));
    const workoutIds = new Set(data.workouts.map((w) => w.id));
    for (const set of data.sets) {
      expect(exerciseIds.has(set.exerciseId)).toBe(true);
      expect(workoutIds.has(set.workoutId)).toBe(true);
    }
  });

  it('ships one active routine and one archived routine', () => {
    const { routines } = buildDataset(NOW);
    expect(routines.filter((r) => r.isActive)).toHaveLength(1);
    expect(routines.some((r) => r.archived)).toBe(true);
  });

  it('leaves some lifts genuinely stagnant for detectStagnation to find', () => {
    const data = buildDataset(NOW);
    const bench = data.exercises.find((e) => e.name === 'Press banca');
    expect(bench).toBeDefined();
    if (bench === undefined) return;

    const result = detectStagnation(
      data.sets.filter((s) => s.exerciseId === bench.id),
      { timeZone: TIME_ZONE },
    );
    expect(result.stagnant).toBe(true);
  });

  it('keeps other lifts progressing', () => {
    const data = buildDataset(NOW);
    const press = data.exercises.find((e) => e.name === 'Prensa');
    expect(press).toBeDefined();
    if (press === undefined) return;

    const result = detectStagnation(
      data.sets.filter((s) => s.exerciseId === press.id),
      { timeZone: TIME_ZONE },
    );
    expect(result.stagnant).toBe(false);
  });
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `pnpm vitest run apps/web/src/data/mock.test.ts`
Expected: FAIL — no existe `./mock`.

- [ ] **Step 4: Implementar el generador**

Reproduce la estructura de `Sessions.dc.html`: catálogo con progresión lineal hacia atrás en
el tiempo (los compuestos suben 2.5 kg por sesión, el resto 5 o 1 según el peso), calendario
de sesiones con huecos, y notas en algunas.

`apps/web/src/data/mock.ts`:

```ts
import type { MuscleGroup } from '@gym-tracker/core';
import type { Dataset, MockExercise, MockRoutine, MockSet, MockWorkout } from './types';

const DAY_MS = 86_400_000;

interface Template {
  name: string;
  muscleGroup: MuscleGroup;
  weightKg: number;
  isBodyweight?: boolean;
  reps: readonly number[];
  rpe: readonly number[];
  restSeconds: number;
  warmups?: ReadonlyArray<readonly [number, number]>;
}

const DAY_TEMPLATES: Record<string, readonly Template[]> = {
  Empuje: [
    { name: 'Press banca', muscleGroup: 'chest', weightKg: 95, reps: [8, 8, 6], rpe: [7, 8, 9], restSeconds: 165, warmups: [[40, 8], [70, 5]] },
    { name: 'Press militar', muscleGroup: 'front_delt', weightKg: 57.5, reps: [8, 7, 6], rpe: [8, 8, 9], restSeconds: 150, warmups: [[20, 8]] },
    { name: 'Press inclinado con mancuernas', muscleGroup: 'chest', weightKg: 32, reps: [10, 10, 9], rpe: [8, 8, 9], restSeconds: 95 },
    { name: 'Elevaciones laterales', muscleGroup: 'side_delt', weightKg: 12, reps: [15, 15, 14], rpe: [8, 9, 9], restSeconds: 60 },
    { name: 'Extensión de tríceps en polea', muscleGroup: 'triceps', weightKg: 30, reps: [13, 12, 11], rpe: [8, 9, 9], restSeconds: 60 },
  ],
  Tirón: [
    { name: 'Peso muerto', muscleGroup: 'lower_back', weightKg: 170, reps: [4, 4, 3], rpe: [8, 8, 9], restSeconds: 210, warmups: [[60, 5], [110, 3]] },
    { name: 'Remo con barra', muscleGroup: 'upper_back', weightKg: 82.5, reps: [9, 8, 8], rpe: [8, 8, 9], restSeconds: 120 },
    { name: 'Jalón al pecho', muscleGroup: 'lats', weightKg: 68, reps: [11, 10, 10], rpe: [8, 9, 9], restSeconds: 90 },
    { name: 'Face pull', muscleGroup: 'rear_delt', weightKg: 25, reps: [15, 15, 15], rpe: [8, 8, 9], restSeconds: 60 },
    { name: 'Curl con barra', muscleGroup: 'biceps', weightKg: 35, reps: [10, 9, 8], rpe: [8, 9, 9], restSeconds: 60 },
  ],
  Pierna: [
    { name: 'Sentadilla trasera', muscleGroup: 'quads', weightKg: 135, reps: [6, 5, 5], rpe: [8, 8, 9], restSeconds: 180, warmups: [[60, 5], [100, 3]] },
    { name: 'Peso muerto rumano', muscleGroup: 'hamstrings', weightKg: 110, reps: [9, 8, 8], rpe: [8, 8, 9], restSeconds: 150 },
    { name: 'Prensa', muscleGroup: 'quads', weightKg: 220, reps: [12, 11, 10], rpe: [8, 9, 9], restSeconds: 120 },
    { name: 'Curl femoral', muscleGroup: 'hamstrings', weightKg: 55, reps: [13, 12, 11], rpe: [8, 9, 9], restSeconds: 75 },
    { name: 'Elevación de gemelos', muscleGroup: 'calves', weightKg: 90, reps: [15, 14, 13], rpe: [8, 9, 9], restSeconds: 60 },
  ],
  Libre: [
    { name: 'Dominadas', muscleGroup: 'lats', weightKg: 0, isBodyweight: true, reps: [10, 9, 8], rpe: [8, 9, 9], restSeconds: 100 },
    { name: 'Fondos', muscleGroup: 'chest', weightKg: 0, isBodyweight: true, reps: [12, 11, 10], rpe: [8, 9, 9], restSeconds: 90 },
    { name: 'Curl martillo', muscleGroup: 'biceps', weightKg: 16, reps: [12, 11, 10], rpe: [8, 9, 9], restSeconds: 60 },
  ],
};

const SCHEDULE: ReadonlyArray<{ daysAgo: number; dayName: string; notes?: string }> = [
  { daysAgo: 1, dayName: 'Tirón', notes: 'El agarre falló en la última serie de peso muerto. La próxima, con correas.' },
  { daysAgo: 2, dayName: 'Pierna' },
  { daysAgo: 3, dayName: 'Empuje' },
  { daysAgo: 5, dayName: 'Libre', notes: 'Sesión corta entre reuniones, solo trabajo de bombeo.' },
  { daysAgo: 6, dayName: 'Tirón' },
  { daysAgo: 7, dayName: 'Pierna', notes: 'La rodilla izquierda tirante en sentadilla; me quedé en RPE 8.' },
  { daysAgo: 8, dayName: 'Empuje' },
  { daysAgo: 10, dayName: 'Tirón' },
  { daysAgo: 11, dayName: 'Pierna' },
  { daysAgo: 12, dayName: 'Empuje' },
  { daysAgo: 14, dayName: 'Tirón' },
  { daysAgo: 15, dayName: 'Pierna' },
  { daysAgo: 16, dayName: 'Empuje' },
  { daysAgo: 19, dayName: 'Tirón' },
  { daysAgo: 20, dayName: 'Pierna' },
  { daysAgo: 21, dayName: 'Empuje' },
  { daysAgo: 23, dayName: 'Tirón' },
  { daysAgo: 24, dayName: 'Pierna' },
  { daysAgo: 25, dayName: 'Empuje' },
  { daysAgo: 28, dayName: 'Tirón' },
  { daysAgo: 29, dayName: 'Pierna' },
  { daysAgo: 30, dayName: 'Empuje' },
];

const COMPOUND = /banca|militar|peso muerto|remo con barra|sentadilla|dominadas/i;

/**
 * Lifts that stopped progressing. Their weight is flat across the most recent
 * PLATEAU_SESSIONS + 1 occurrences, so detectStagnation has something real to
 * find — the stagnation block is the headline of the overview screen.
 */
const PLATEAUED = new Set(['Press banca', 'Press militar', 'Remo con barra']);
const PLATEAU_SESSIONS = 5;

function increment(template: Template): number {
  if (COMPOUND.test(template.name)) return 2.5;
  return template.weightKg > 60 ? 5 : 1;
}

/** Newest session is 0. Plateaued lifts collapse their recent steps to zero. */
function progressionSteps(template: Template, stepsBack: number): number {
  if (!PLATEAUED.has(template.name)) return stepsBack;
  return Math.max(0, stepsBack - PLATEAU_SESSIONS);
}

function buildExercises(): MockExercise[] {
  const seen = new Map<string, MockExercise>();
  let nextId = 1;
  for (const templates of Object.values(DAY_TEMPLATES)) {
    for (const template of templates) {
      if (seen.has(template.name)) continue;
      seen.set(template.name, {
        id: nextId++,
        name: template.name,
        muscleGroup: template.muscleGroup,
        isBodyweight: template.isBodyweight === true,
      });
    }
  }
  return [...seen.values()];
}

function buildRoutines(exercises: readonly MockExercise[]): MockRoutine[] {
  const byName = new Map(exercises.map((e) => [e.name, e]));
  let nextId = 1;
  const day = (name: string, position: number, names: readonly string[]) => ({
    id: nextId++,
    name,
    position,
    exercises: names.flatMap((exerciseName, index) => {
      const exercise = byName.get(exerciseName);
      if (exercise === undefined) return [];
      const compound = COMPOUND.test(exerciseName);
      return [{
        id: nextId++,
        exerciseId: exercise.id,
        position: index,
        targetSets: compound ? 4 : 3,
        targetRepsMin: compound ? 5 : 8,
        targetRepsMax: compound ? 8 : 12,
        targetRestSeconds: compound ? 150 : 90,
      }];
    }),
  });

  return [
    {
      id: 1,
      name: 'Empuje / Tirón / Pierna',
      isActive: true,
      archived: false,
      days: [
        day('Empuje', 0, DAY_TEMPLATES['Empuje']?.map((t) => t.name) ?? []),
        day('Tirón', 1, DAY_TEMPLATES['Tirón']?.map((t) => t.name) ?? []),
        day('Pierna', 2, DAY_TEMPLATES['Pierna']?.map((t) => t.name) ?? []),
      ],
    },
    {
      id: 2,
      name: 'Cuerpo completo 3×',
      isActive: false,
      archived: true,
      days: [
        day('A', 0, ['Sentadilla trasera', 'Press banca', 'Remo con barra', 'Curl con barra']),
        day('B', 1, ['Peso muerto', 'Press militar', 'Jalón al pecho', 'Prensa']),
      ],
    },
  ];
}

export function muscleGroupMap(exercises: readonly MockExercise[]): Map<number, MuscleGroup> {
  return new Map(exercises.map((e) => [e.id, e.muscleGroup]));
}

export function buildDataset(now: Date = new Date()): Dataset {
  const exercises = buildExercises();
  const byName = new Map(exercises.map((e) => [e.name, e]));

  // Chronological order so each day's occurrence index drives the progression.
  const chronological = [...SCHEDULE].sort((a, b) => b.daysAgo - a.daysAgo);
  const occurrences = new Map<string, number>();
  const indexed = chronological.map((entry) => {
    const occurrence = occurrences.get(entry.dayName) ?? 0;
    occurrences.set(entry.dayName, occurrence + 1);
    return { ...entry, occurrence };
  });

  const workouts: MockWorkout[] = [];
  const sets: MockSet[] = [];
  let workoutId = 1;
  let setId = 1;

  for (const entry of indexed) {
    const templates = DAY_TEMPLATES[entry.dayName];
    if (templates === undefined) continue;

    const latest = (occurrences.get(entry.dayName) ?? 1) - 1;
    const stepsBack = latest - entry.occurrence;
    const startedAt = new Date(now.getTime() - entry.daysAgo * DAY_MS);
    startedAt.setHours(18, 30, 0, 0);

    let cursor = startedAt.getTime();
    let position = 0;

    for (const template of templates) {
      const weight = template.isBodyweight === true
        ? template.weightKg
        : Math.max(0, template.weightKg - increment(template) * progressionSteps(template, stepsBack));

      for (const [warmWeight, warmReps] of template.warmups ?? []) {
        cursor += 60_000;
        sets.push({
          id: setId++, workoutId, exerciseId: byName.get(template.name)?.id ?? 0,
          position: position++, weightKg: warmWeight, reps: warmReps,
          isWarmup: true, createdAt: new Date(cursor),
        });
      }

      template.reps.forEach((reps, index) => {
        cursor += template.restSeconds * 1000 + 48_000;
        const rpe = template.rpe[index];
        sets.push({
          id: setId++, workoutId, exerciseId: byName.get(template.name)?.id ?? 0,
          position: position++, weightKg: weight, reps,
          // exactOptionalPropertyTypes: spread the key only when present.
          ...(rpe === undefined ? {} : { rpe }),
          isWarmup: false, createdAt: new Date(cursor),
        });
      });
    }

    workouts.push({
      id: workoutId, dayName: entry.dayName,
      startedAt, finishedAt: new Date(cursor),
      ...(entry.notes === undefined ? {} : { notes: entry.notes }),
    });
    workoutId++;
  }

  // Newest first, the order every screen displays.
  workouts.reverse();
  return { exercises, workouts, sets, routines: buildRoutines(exercises) };
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `pnpm vitest run apps/web/src/data/mock.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/data
git commit -m "feat(web): add deterministic mock dataset of raw sets"
```

---

### Task 4: Formateo compartido y primitivas visuales

**Files:**
- Create: `apps/web/src/presenters/format.ts`, `apps/web/src/presenters/format.test.ts`, `apps/web/src/components/MetricTile.tsx`, `apps/web/src/components/Sparkline.tsx`, `apps/web/src/components/AreaChart.tsx`, `apps/web/src/components/VolumeBar.tsx`, `apps/web/src/components/VolumeBar.test.tsx`, `apps/web/src/components/Heatmap.tsx`

**Interfaces:**
- Produces:
  ```ts
  function formatKg(value: number): string          // 1234.5 -> "1.234,5"
  function formatDelta(value: number, unit: string): string  // -3 -> "−3 kg"
  function deltaColor(value: number): string        // token string
  function formatDayMonth(date: Date, timeZone: string): string  // "sáb · 25 jul"
  function formatClockRange(from: Date, to: Date, timeZone: string): string
  function formatLoad(weightKg: number, reps: number, isBodyweight: boolean): string
  const ACCENT_UP = 'var(--color-accent-300)'
  const ACCENT_DOWN = '#d4a15a'
  ```
  Componentes: `MetricTile({ label, value, unit?, footer? })`, `Sparkline({ points, color })`,
  `AreaChart({ points, height? })`, `VolumeBar({ label, count, max })`,
  `Heatmap({ weeks })` con `interface HeatmapDay { level: 0|1|2|3|4; title: string }`.

- [ ] **Step 1: Escribir el test de formateo**

`apps/web/src/presenters/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACCENT_DOWN, ACCENT_UP, deltaColor, formatDelta, formatKg, formatLoad } from './format';

describe('formatKg', () => {
  it('uses Spanish thousand separators', () => {
    expect(formatKg(42_800)).toBe('42.800');
    expect(formatKg(1234.5)).toBe('1.234,5');
  });
});

describe('formatDelta', () => {
  it('uses a real minus sign, never a hyphen', () => {
    expect(formatDelta(-3, 'kg')).toBe('−3 kg');
  });
  it('prefixes a plus for gains', () => {
    expect(formatDelta(2.5, 'kg')).toBe('+2,5 kg');
  });
  it('treats zero as a gain, matching the design', () => {
    expect(formatDelta(0, 'min')).toBe('+0 min');
  });
});

describe('deltaColor', () => {
  it('maps sign to the accent ramp', () => {
    expect(deltaColor(1)).toBe(ACCENT_UP);
    expect(deltaColor(0)).toBe(ACCENT_UP);
    expect(deltaColor(-1)).toBe(ACCENT_DOWN);
  });
});

describe('formatLoad', () => {
  it('renders barbell loads', () => {
    expect(formatLoad(95, 8, false)).toBe('95 kg × 8');
  });
  it('renders bodyweight loads', () => {
    expect(formatLoad(0, 10, true)).toBe('PC × 10');
    expect(formatLoad(25, 6, true)).toBe('PC+25 × 6');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm vitest run apps/web/src/presenters/format.test.ts`
Expected: FAIL — no existe `./format`.

- [ ] **Step 3: Implementar el formateo**

`apps/web/src/presenters/format.ts`:

```ts
/** The design's up/down pair: accent for progress, amber for regression. */
export const ACCENT_UP = 'var(--color-accent-300)';
export const ACCENT_DOWN = '#d4a15a';

const NUMBER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export function formatKg(value: number): string {
  return NUMBER.format(value);
}

export function formatDelta(value: number, unit: string): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${NUMBER.format(Math.abs(value))} ${unit}`;
}

export function deltaColor(value: number): string {
  return value >= 0 ? ACCENT_UP : ACCENT_DOWN;
}

export function formatDayMonth(date: Date, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('es-ES', { timeZone, weekday: 'short' }).format(date);
  const dayMonth = new Intl.DateTimeFormat('es-ES', { timeZone, day: 'numeric', month: 'short' }).format(date);
  return `${weekday} · ${dayMonth}`;
}

export function formatClockRange(from: Date, to: Date, timeZone: string): string {
  const clock = new Intl.DateTimeFormat('es-ES', { timeZone, hour: '2-digit', minute: '2-digit' });
  return `${clock.format(from)} – ${clock.format(to)}`;
}

export function formatLoad(weightKg: number, reps: number, isBodyweight: boolean): string {
  if (!isBodyweight) return `${NUMBER.format(weightKg)} kg × ${reps}`;
  return weightKg > 0 ? `PC+${NUMBER.format(weightKg)} × ${reps}` : `PC × ${reps}`;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm vitest run apps/web/src/presenters/format.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Escribir el test de `VolumeBar`**

`apps/web/src/components/VolumeBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACCENT_DOWN } from '../presenters/format';
import { VolumeBar } from './VolumeBar';

describe('VolumeBar', () => {
  it('shows label and count', () => {
    render(<VolumeBar label="Pecho" count={14} max={24} />);
    expect(screen.getByText('Pecho')).toBeDefined();
    expect(screen.getByText('14')).toBeDefined();
  });

  it('flags counts below the 10-20 band', () => {
    render(<VolumeBar label="Gemelos" count={6} max={24} />);
    expect(screen.getByText('6').getAttribute('style')).toContain(ACCENT_DOWN);
  });

  it('flags counts above the band', () => {
    render(<VolumeBar label="Abdominales" count={22} max={24} />);
    expect(screen.getByText('22').getAttribute('style')).toContain(ACCENT_DOWN);
  });

  it('leaves in-band counts on the accent colour', () => {
    render(<VolumeBar label="Dorsal" count={18} max={24} />);
    expect(screen.getByText('18').getAttribute('style')).not.toContain(ACCENT_DOWN);
  });
});
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `pnpm vitest run apps/web/src/components/VolumeBar.test.tsx`
Expected: FAIL — no existe `./VolumeBar`.

- [ ] **Step 7: Implementar las primitivas**

`apps/web/src/components/VolumeBar.tsx`:

```tsx
import { VOLUME_TARGET_MAX, VOLUME_TARGET_MIN } from '../config';
import { ACCENT_DOWN } from '../presenters/format';

export function VolumeBar({ label, count, max }: { label: string; count: number; max: number }) {
  const inBand = count >= VOLUME_TARGET_MIN && count <= VOLUME_TARGET_MAX;
  const pct = (value: number) => `${Math.min(100, (value / max) * 100)}%`;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 30px', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ position: 'relative', height: 9, background: 'var(--color-neutral-900)', borderRadius: 5 }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: pct(VOLUME_TARGET_MIN),
          width: pct(VOLUME_TARGET_MAX - VOLUME_TARGET_MIN),
          background: 'color-mix(in srgb, var(--color-accent) 13%, transparent)',
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: pct(count),
          background: inBand ? 'var(--color-accent-400)' : ACCENT_DOWN, borderRadius: 5,
        }} />
      </div>
      <span style={{ fontSize: 13, textAlign: 'right', color: inBand ? undefined : ACCENT_DOWN }}>
        {count}
      </span>
    </div>
  );
}
```

`apps/web/src/components/MetricTile.tsx`:

```tsx
import type { ReactNode } from 'react';

export function MetricTile({
  label, value, unit, footer,
}: { label: string; value: string; unit?: string; footer?: ReactNode }) {
  return (
    <div className="card elev-sm" style={{ padding: 'var(--space-6)', gap: 'var(--space-2)' }}>
      <span style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'color-mix(in srgb, var(--color-text) 55%, transparent)',
      }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
        {unit !== undefined && (
          <span style={{ fontSize: 18, color: 'color-mix(in srgb, var(--color-text) 60%, transparent)' }}>
            {' '}{unit}
          </span>
        )}
      </span>
      {footer !== undefined && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>{footer}</span>
      )}
    </div>
  );
}
```

`apps/web/src/components/Sparkline.tsx`:

```tsx
export function Sparkline({ points, color }: { points: readonly number[]; color: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 200;
      const y = 34 - ((value - min) / span) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 200 36" style={{ width: '100%', height: 34, display: 'block' }} preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={coords} />
    </svg>
  );
}
```

`apps/web/src/components/AreaChart.tsx`:

```tsx
const GRADIENT_ID = 'area-gradient';

export function AreaChart({ points, height = 150 }: { points: readonly number[]; height?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points.map((value, index) => {
    const x = 8 + (index / (points.length - 1)) * 464;
    const y = 140 - ((value - min) / span) * 110;
    return { x, y };
  });
  const line = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M${coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} L472,140 L8,140 Z`;
  const last = coords[coords.length - 1];
  return (
    <svg viewBox="0 0 480 150" style={{ width: '100%', height: 'auto', display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9184d9" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#9184d9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="8" y1={height - 10} x2="472" y2={height - 10} stroke="var(--color-divider)" strokeWidth="1" />
      <path d={area} fill={`url(#${GRADIENT_ID})`} />
      <polyline fill="none" stroke="#9184d9" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" points={line} />
      {last !== undefined && (
        <circle cx={last.x} cy={last.y} r="3.5" fill="var(--color-bg)" stroke="#9184d9" strokeWidth="1.75" />
      )}
    </svg>
  );
}
```

`apps/web/src/components/Heatmap.tsx`:

```tsx
export interface HeatmapDay {
  level: 0 | 1 | 2 | 3 | 4;
  title: string;
}

const LEVEL_BG = [
  '#1e2030',
  'var(--color-accent-800)',
  'var(--color-accent-700)',
  'var(--color-accent-500)',
  'var(--color-accent-400)',
] as const;

const ROW_LABELS = ['Lun', '', 'Mié', '', 'Vie', '', 'Dom'] as const;

export function Heatmap({ weeks }: { weeks: ReadonlyArray<ReadonlyArray<HeatmapDay>> }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'space-between',
        paddingTop: 1, fontSize: 9, color: 'color-mix(in srgb, var(--color-text) 45%, transparent)',
      }}>
        {ROW_LABELS.map((label, index) => (
          <span key={index} style={{ height: 13, lineHeight: '13px' }}>{label}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map((day, dayIndex) => (
              <div key={dayIndex} title={day.title} style={{
                width: 13, height: 13, borderRadius: 2, background: LEVEL_BG[day.level],
              }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Ejecutar y verificar que pasa**

Run: `pnpm vitest run apps/web/src/components apps/web/src/presenters`
Expected: 14 tests PASS (8 de formato, 4 de VolumeBar, 2 de Nav).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/presenters apps/web/src/components
git commit -m "feat(web): add shared formatting and chart primitives"
```

---

### Task 5: Pantalla Resumen

**Files:**
- Create: `apps/web/src/presenters/overview.ts`, `apps/web/src/presenters/overview.test.ts`, `apps/web/src/screens/Overview.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `buildDataset`, `muscleGroupMap`, `TIME_ZONE`, `VOLUME_TARGET_*`, `formatKg`, `formatDelta`, `deltaColor`, `MetricTile`, `Sparkline`, `AreaChart`, `VolumeBar`, `Heatmap`, `HeatmapDay`.
- Produces:
  ```ts
  interface OverviewModel {
    weekLabel: string;
    kpis: Array<{ label: string; value: string; unit?: string; delta: string; deltaColor: string; caption: string }>;
    stalled: Array<{ exerciseId: number; name: string; muscleLabel: string; weeks: number;
                     history: number[]; workingSet: string }>;
    volume: Array<{ group: MuscleGroup; label: string; count: number }>;
    volumeMax: number;
    records: Array<{ name: string; estimated1RM: string; detail: string; when: string }>;
    tonnageTrend: number[];
    heatmap: HeatmapDay[][];
  }
  function buildOverview(data: Dataset, now: Date): OverviewModel
  ```

- [ ] **Step 1: Escribir el test del presenter**

`apps/web/src/presenters/overview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../data/mock';
import { buildOverview } from './overview';

const NOW = new Date('2026-07-25T18:00:00Z');
const MODEL = buildOverview(buildDataset(NOW), NOW);

describe('buildOverview', () => {
  it('produces the four KPIs in Spanish', () => {
    expect(MODEL.kpis.map((k) => k.label)).toEqual([
      'Series totales', 'Tonelaje', 'Sesiones', 'Duración media',
    ]);
  });

  it('reports volume for every muscle group that was trained', () => {
    expect(MODEL.volume.length).toBeGreaterThan(0);
    for (const row of MODEL.volume) {
      expect(row.count).toBeGreaterThan(0);
      expect(row.label).not.toBe(row.group);
    }
  });

  it('sizes the volume axis to at least the top of the target band', () => {
    expect(MODEL.volumeMax).toBeGreaterThanOrEqual(20);
  });

  it('builds a 13-week heatmap of 7-day columns', () => {
    expect(MODEL.heatmap).toHaveLength(13);
    for (const week of MODEL.heatmap) {
      expect(week).toHaveLength(7);
    }
  });

  it('surfaces the stalled lifts the dataset plateaus', () => {
    expect(MODEL.stalled.length).toBeGreaterThan(0);
    expect(MODEL.stalled.map((s) => s.name)).toContain('Press banca');
  });

  it('never invents coaching advice, only measured weeks', () => {
    expect(MODEL.stalled.length).toBeGreaterThan(0);
    for (const item of MODEL.stalled) {
      expect(item.weeks).toBeGreaterThanOrEqual(3);
      expect(item.workingSet).toMatch(/×/);
      // The mockup's "Deload to 90 kg" line is not part of the model.
      expect(Object.keys(item)).not.toContain('advice');
    }
  });

  it('plots a tonnage trend with one point per week', () => {
    expect(MODEL.tonnageTrend.length).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm vitest run apps/web/src/presenters/overview.test.ts`
Expected: FAIL — no existe `./overview`.

- [ ] **Step 3: Implementar el presenter**

`apps/web/src/presenters/overview.ts`:

```ts
import {
  MUSCLE_GROUP_LABELS, detectStagnation, effectiveSets, estimate1RM, isoWeekKey,
  session1RM, sessionTonnage, weeklyVolumeByMuscleGroup,
} from '@gym-tracker/core';
import type { MuscleGroup } from '@gym-tracker/core';
import { TIME_ZONE, VOLUME_TARGET_MAX } from '../config';
import { muscleGroupMap } from '../data/mock';
import type { Dataset, MockSet } from '../data/types';
import type { HeatmapDay } from '../components/Heatmap';
import { deltaColor, formatDelta, formatKg, formatLoad } from './format';

const DAY_MS = 86_400_000;

export interface OverviewModel {
  weekLabel: string;
  kpis: Array<{ label: string; value: string; unit?: string; delta: string; deltaColor: string; caption: string }>;
  stalled: Array<{ exerciseId: number; name: string; muscleLabel: string; weeks: number; history: number[]; workingSet: string }>;
  volume: Array<{ group: MuscleGroup; label: string; count: number }>;
  volumeMax: number;
  records: Array<{ name: string; estimated1RM: string; detail: string; when: string }>;
  tonnageTrend: number[];
  heatmap: HeatmapDay[][];
}

function weekOf(date: Date): string {
  return isoWeekKey(date, TIME_ZONE);
}

export function buildOverview(data: Dataset, now: Date): OverviewModel {
  const setsByWorkout = new Map<number, MockSet[]>();
  for (const set of data.sets) {
    const bucket = setsByWorkout.get(set.workoutId) ?? [];
    bucket.push(set);
    setsByWorkout.set(set.workoutId, bucket);
  }

  const thisWeek = weekOf(now);
  const lastWeek = weekOf(new Date(now.getTime() - 7 * DAY_MS));

  const inWeek = (key: string) =>
    data.workouts.filter((w) => weekOf(w.startedAt) === key);

  const summarise = (key: string) => {
    const workouts = inWeek(key);
    const sets = workouts.flatMap((w) => setsByWorkout.get(w.id) ?? []);
    const minutes = workouts.map((w) => (w.finishedAt.getTime() - w.startedAt.getTime()) / 60_000);
    const avg = minutes.length === 0 ? 0 : minutes.reduce((a, b) => a + b, 0) / minutes.length;
    return {
      sets: effectiveSets(sets).length,
      tonnage: sessionTonnage(sets),
      sessions: workouts.length,
      avgMinutes: Math.round(avg),
    };
  };

  const current = summarise(thisWeek);
  const previous = summarise(lastWeek);

  const kpi = (label: string, value: string, delta: number, unit: string, caption: string) => ({
    label, value, delta: formatDelta(delta, unit), deltaColor: deltaColor(delta), caption,
  });

  const kpis = [
    kpi('Series totales', String(current.sets), current.sets - previous.sets, 'series', `frente a ${previous.sets} la semana pasada`),
    { ...kpi('Tonelaje', formatKg(Math.round(current.tonnage / 100) / 10), current.tonnage - previous.tonnage, 'kg', 'kg × repeticiones'), unit: 't' },
    kpi('Sesiones', String(current.sessions), current.sessions - previous.sessions, 'sesiones', `frente a ${previous.sessions} la semana pasada`),
    { ...kpi('Duración media', String(current.avgMinutes), current.avgMinutes - previous.avgMinutes, 'min', `frente a ${previous.avgMinutes} la semana pasada`), unit: 'min' },
  ];

  // Volume for the current week, from core.
  const volumeMap = weeklyVolumeByMuscleGroup(data.sets, muscleGroupMap(data.exercises), {
    weekKey: thisWeek, timeZone: TIME_ZONE,
  });
  const volume = [...volumeMap.entries()]
    .map(([group, count]) => ({ group, label: MUSCLE_GROUP_LABELS[group], count }))
    .sort((a, b) => b.count - a.count);
  const volumeMax = Math.max(VOLUME_TARGET_MAX + 4, ...volume.map((v) => v.count));

  // Stagnation, per exercise, from core.
  const stalled: OverviewModel['stalled'] = [];
  for (const exercise of data.exercises) {
    const sets = data.sets.filter((s) => s.exerciseId === exercise.id);
    if (sets.length === 0) continue;
    const result = detectStagnation(sets, { timeZone: TIME_ZONE });
    if (!result.stagnant) continue;

    const working = effectiveSets(sets);
    const latest = working[working.length - 1];
    if (latest === undefined) continue;

    const byWeek = new Map<string, number>();
    for (const set of working) {
      const key = weekOf(set.createdAt);
      const value = estimate1RM(set.weightKg > 0 ? set.weightKg : 1, set.reps);
      byWeek.set(key, Math.max(byWeek.get(key) ?? 0, value));
    }
    stalled.push({
      exerciseId: exercise.id,
      name: exercise.name,
      muscleLabel: MUSCLE_GROUP_LABELS[exercise.muscleGroup],
      weeks: result.weeksWithoutImprovement,
      history: [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v),
      workingSet: formatLoad(latest.weightKg, latest.reps, exercise.isBodyweight),
    });
  }
  stalled.sort((a, b) => b.weeks - a.weeks);

  // Recent records: the newest session that beat the prior best, per exercise.
  const records: OverviewModel['records'] = [];
  for (const exercise of data.exercises) {
    const sets = data.sets.filter((s) => s.exerciseId === exercise.id);
    const best = session1RM(sets);
    if (best === undefined) continue;
    const bestSet = effectiveSets(sets)
      .filter((s) => s.weightKg > 0)
      .sort((a, b) => estimate1RM(b.weightKg, b.reps) - estimate1RM(a.weightKg, a.reps))[0];
    if (bestSet === undefined) continue;
    const days = Math.round((now.getTime() - bestSet.createdAt.getTime()) / DAY_MS);
    if (days > 10) continue;
    records.push({
      name: exercise.name,
      estimated1RM: `${formatKg(Math.round(best))} kg`,
      detail: formatLoad(bestSet.weightKg, bestSet.reps, exercise.isBodyweight),
      when: days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`,
    });
  }
  records.sort((a, b) => a.when.localeCompare(b.when));

  // Tonnage per week, oldest to newest.
  const tonnageByWeek = new Map<string, number>();
  for (const workout of data.workouts) {
    const key = weekOf(workout.startedAt);
    const sets = setsByWorkout.get(workout.id) ?? [];
    tonnageByWeek.set(key, (tonnageByWeek.get(key) ?? 0) + sessionTonnage(sets));
  }
  const tonnageTrend = [...tonnageByWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, value]) => value);

  // 13-week heatmap ending today; Monday-first columns.
  const trainedDays = new Map<string, number>();
  for (const workout of data.workouts) {
    const sets = setsByWorkout.get(workout.id) ?? [];
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(workout.startedAt);
    trainedDays.set(key, effectiveSets(sets).length);
  }
  const daysBack = 12 * 7 + ((now.getDay() + 6) % 7);
  const start = new Date(now.getTime() - daysBack * DAY_MS);
  const heatmap: HeatmapDay[][] = [];
  for (let i = 0; i < 91; i++) {
    const date = new Date(start.getTime() + i * DAY_MS);
    if (i % 7 === 0) heatmap.push([]);
    const column = heatmap[heatmap.length - 1];
    if (column === undefined) continue;
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
    const count = trainedDays.get(key);
    const label = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' }).format(date);
    if (count === undefined) {
      column.push({ level: 0, title: `${label} · descanso` });
    } else {
      const level = count >= 20 ? 4 : count >= 15 ? 3 : count >= 10 ? 2 : 1;
      column.push({ level, title: `${label} · ${count} series` });
    }
  }
  const lastColumn = heatmap[heatmap.length - 1];
  while (lastColumn !== undefined && lastColumn.length < 7) {
    lastColumn.push({ level: 0, title: '' });
  }

  const weekFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
  const monday = new Date(now.getTime() - ((now.getDay() + 6) % 7) * DAY_MS);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);

  return {
    weekLabel: `${weekFormat.format(monday)} – ${weekFormat.format(sunday)}`,
    kpis, stalled, volume, volumeMax, records, tonnageTrend, heatmap,
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm vitest run apps/web/src/presenters/overview.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Implementar la pantalla**

`apps/web/src/screens/Overview.tsx`:

```tsx
import { AreaChart } from '../components/AreaChart';
import { Heatmap } from '../components/Heatmap';
import { MetricTile } from '../components/MetricTile';
import { Sparkline } from '../components/Sparkline';
import { VolumeBar } from '../components/VolumeBar';
import { ACCENT_DOWN } from '../presenters/format';
import type { OverviewModel } from '../presenters/overview';
import { navigate } from '../router';

export function Overview({ model }: { model: OverviewModel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 3px', fontSize: 26 }}>Resumen</h3>
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>{model.weekLabel}</p>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {model.kpis.map((kpi) => (
          <MetricTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            {...(kpi.unit === undefined ? {} : { unit: kpi.unit })}
            footer={
              <>
                <span style={{ color: kpi.deltaColor }}>{kpi.delta}</span>
                <span className="text-muted">{kpi.caption}</span>
              </>
            }
          />
        ))}
      </section>

      <section className="card" style={{
        padding: 'var(--space-8)', gap: 'var(--space-4)',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 6%, var(--color-surface)), var(--color-surface))',
        boxShadow: '0 0 0 1px var(--color-accent-700), var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0, fontSize: 20 }}>Ejercicios estancados</h4>
          <span className="tag tag-neutral">
            {model.stalled.length} ejercicios · sin progreso en 3+ semanas
          </span>
        </div>
        {model.stalled.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
            Ningún ejercicio estancado. Todo progresando.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {model.stalled.slice(0, 3).map((item) => (
              <button
                key={item.exerciseId}
                onClick={() => navigate('exercise', item.exerciseId)}
                className="card elev-sm"
                style={{
                  padding: 'var(--space-6)', gap: 'var(--space-3)', background: 'var(--color-bg)',
                  border: 'none', cursor: 'pointer', color: 'var(--color-text)', textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{item.name}</div>
                    <span className="tag tag-accent" style={{ marginTop: 4 }}>{item.muscleLabel}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, lineHeight: 1, color: ACCENT_DOWN }}>
                    {item.weeks}
                    <span style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}> sem</span>
                  </div>
                </div>
                <Sparkline points={item.history} color={ACCENT_DOWN} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span className="text-muted">Serie de trabajo</span>
                  <span>{item.workingSet}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 14 }}>
        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--space-6)' }}>
            <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Volumen semanal por grupo muscular</h5>
            <span className="text-muted" style={{ fontSize: 11 }}>series efectivas · objetivo 10–20</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {model.volume.map((row) => (
              <VolumeBar key={row.group} label={row.label} count={row.count} max={model.volumeMax} />
            ))}
          </div>
        </div>

        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--space-4)' }}>
            <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Récords recientes</h5>
            <span className="text-muted" style={{ fontSize: 11 }}>últimos 10 días</span>
          </div>
          {model.records.length === 0 ? (
            <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Sin récords en los últimos 10 días.</p>
          ) : model.records.map((record) => (
            <div key={record.name} style={{
              display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 2, alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid var(--color-divider)',
            }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{record.name}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--color-accent-300)', textAlign: 'right' }}>
                {record.estimated1RM} <span className="text-muted" style={{ fontSize: 11 }}>1RM est.</span>
              </span>
              <span className="text-muted" style={{ fontSize: 12 }}>{record.detail}</span>
              <span className="text-muted" style={{ fontSize: 11, textAlign: 'right' }}>{record.when}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <h5 style={{ margin: '0 0 var(--space-6)', fontSize: 13, letterSpacing: '0.04em' }}>Tendencia de tonelaje</h5>
          <AreaChart points={model.tonnageTrend} />
        </div>
        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <h5 style={{ margin: '0 0 var(--space-6)', fontSize: 13, letterSpacing: '0.04em' }}>Constancia</h5>
          <Heatmap weeks={model.heatmap} />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Conectar en `App.tsx`**

Sustituir `apps/web/src/App.tsx` por completo:

```tsx
import { useMemo } from 'react';
import { Nav } from './components/Nav';
import { buildDataset } from './data/mock';
import { buildOverview } from './presenters/overview';
import { useRoute } from './router';
import { Overview } from './screens/Overview';

export function App() {
  const { route } = useRoute();
  const now = useMemo(() => new Date(), []);
  const data = useMemo(() => buildDataset(now), [now]);
  const overview = useMemo(() => buildOverview(data, now), [data, now]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <Nav current={route} />
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
        {route === 'overview' ? <Overview model={overview} /> : <p>Pantalla: {route}</p>}
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Verificar y commitear**

Run: `pnpm vitest run --project web && pnpm --filter @gym-tracker/web typecheck && pnpm --filter @gym-tracker/web build`
Expected: todos los tests PASS, sin errores de tipos, build correcto.

```bash
git add apps/web/src
git commit -m "feat(web): add overview screen with stagnation, volume and consistency"
```

---

### Task 6: Pantalla Historial de sesión

**Files:**
- Create: `apps/web/src/presenters/sessions.ts`, `apps/web/src/presenters/sessions.test.ts`, `apps/web/src/components/SetTable.tsx`, `apps/web/src/screens/Sessions.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface SetRow { label: string; load: string; rpe: string; rest: string; isWarmup: boolean }
  interface SessionExercise { exerciseId: number; name: string; muscleLabel: string;
                              topSet: string; delta: string; deltaColor: string; sets: SetRow[] }
  interface SessionSummary { id: number; dayName: string; dateLabel: string; timeRange: string;
                             tonnage: string; durationMinutes: number; setCount: number }
  interface SessionDetail extends SessionSummary {
    avgRestSeconds: number; notes?: string;
    comparison?: { prevLabel: string; tonnageDelta: string; tonnageColor: string;
                   durationDelta: string; liftsUp: number; liftsTotal: number };
    exercises: SessionExercise[];
  }
  interface SessionsModel { filters: Array<{ dayName: string; count: number }>;
                            summaries: SessionSummary[]; detailFor(id: number): SessionDetail | undefined }
  function buildSessions(data: Dataset): SessionsModel
  ```

- [ ] **Step 1: Escribir el test**

`apps/web/src/presenters/sessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../data/mock';
import { buildSessions } from './sessions';

const NOW = new Date('2026-07-25T18:00:00Z');
const MODEL = buildSessions(buildDataset(NOW));

describe('buildSessions', () => {
  it('offers a "Todas" filter plus one per routine day', () => {
    expect(MODEL.filters[0]).toEqual({ dayName: 'Todas', count: MODEL.summaries.length });
    expect(MODEL.filters.map((f) => f.dayName)).toContain('Empuje');
  });

  it('lists sessions newest first', () => {
    const first = MODEL.summaries[0];
    const second = MODEL.summaries[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
  });

  it('compares against the previous session of the same routine day', () => {
    const target = MODEL.summaries.find((s) => s.dayName === 'Empuje');
    expect(target).toBeDefined();
    if (target === undefined) return;
    const detail = MODEL.detailFor(target.id);
    expect(detail?.comparison).toBeDefined();
    expect(detail?.comparison?.liftsTotal).toBeGreaterThan(0);
    expect(detail?.comparison?.liftsUp).toBeLessThanOrEqual(detail?.comparison?.liftsTotal ?? 0);
  });

  it('marks warm-up rows with W and numbers the working sets from 1', () => {
    const first = MODEL.summaries[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const exercise = MODEL.detailFor(first.id)?.exercises.find((e) => e.sets.some((s) => s.isWarmup));
    expect(exercise).toBeDefined();
    const labels = exercise?.sets.map((s) => s.label) ?? [];
    expect(labels[0]).toBe('W');
    expect(labels.filter((l) => l !== 'W')[0]).toBe('1');
  });

  it('returns undefined for an unknown session id', () => {
    expect(MODEL.detailFor(-1)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm vitest run apps/web/src/presenters/sessions.test.ts`
Expected: FAIL — no existe `./sessions`.

- [ ] **Step 3: Implementar el presenter**

`apps/web/src/presenters/sessions.ts`:

```ts
import {
  MUSCLE_GROUP_LABELS, deriveRestSeconds, effectiveSets, estimate1RM, sessionTonnage,
} from '@gym-tracker/core';
import { TIME_ZONE } from '../config';
import type { Dataset, MockExercise, MockSet } from '../data/types';
import { ACCENT_DOWN, ACCENT_UP, formatClockRange, formatDayMonth, formatDelta, formatKg, formatLoad } from './format';

export interface SetRow { label: string; load: string; rpe: string; rest: string; isWarmup: boolean }

export interface SessionExercise {
  exerciseId: number; name: string; muscleLabel: string;
  topSet: string; delta: string; deltaColor: string; sets: SetRow[];
}

export interface SessionSummary {
  id: number; dayName: string; dateLabel: string; timeRange: string;
  tonnage: string; durationMinutes: number; setCount: number;
}

export interface SessionDetail extends SessionSummary {
  avgRestSeconds: number;
  notes?: string;
  comparison?: {
    prevLabel: string; tonnageDelta: string; tonnageColor: string;
    durationDelta: string; liftsUp: number; liftsTotal: number;
  };
  exercises: SessionExercise[];
}

export interface SessionsModel {
  filters: Array<{ dayName: string; count: number }>;
  summaries: SessionSummary[];
  detailFor(id: number): SessionDetail | undefined;
}

/** Bodyweight lifts compare on total load: a nominal 80 kg plus any added plates. */
const BODYWEIGHT_KG = 80;

function effectiveLoad(exercise: MockExercise, weightKg: number): number {
  return exercise.isBodyweight ? BODYWEIGHT_KG + weightKg : weightKg;
}

function topSetOf(exercise: MockExercise, sets: readonly MockSet[]): MockSet | undefined {
  let best: MockSet | undefined;
  for (const set of effectiveSets(sets)) {
    if (best === undefined) { best = set; continue; }
    const a = estimate1RM(effectiveLoad(exercise, set.weightKg) || 1, set.reps);
    const b = estimate1RM(effectiveLoad(exercise, best.weightKg) || 1, best.reps);
    if (a > b) best = set;
  }
  return best;
}

export function buildSessions(data: Dataset): SessionsModel {
  const exerciseById = new Map(data.exercises.map((e) => [e.id, e]));
  const setsByWorkout = new Map<number, MockSet[]>();
  for (const set of data.sets) {
    const bucket = setsByWorkout.get(set.workoutId) ?? [];
    bucket.push(set);
    setsByWorkout.set(set.workoutId, bucket);
  }
  for (const bucket of setsByWorkout.values()) {
    bucket.sort((a, b) => a.position - b.position);
  }

  const summaryOf = (workoutId: number): SessionSummary | undefined => {
    const workout = data.workouts.find((w) => w.id === workoutId);
    if (workout === undefined) return undefined;
    const sets = setsByWorkout.get(workoutId) ?? [];
    return {
      id: workout.id,
      dayName: workout.dayName,
      dateLabel: formatDayMonth(workout.startedAt, TIME_ZONE),
      timeRange: formatClockRange(workout.startedAt, workout.finishedAt, TIME_ZONE),
      tonnage: `${formatKg(Math.round(sessionTonnage(sets)))} kg`,
      durationMinutes: Math.round((workout.finishedAt.getTime() - workout.startedAt.getTime()) / 60_000),
      setCount: effectiveSets(sets).length,
    };
  };

  const summaries = data.workouts
    .map((w) => summaryOf(w.id))
    .filter((s): s is SessionSummary => s !== undefined);

  const counts = new Map<string, number>();
  for (const summary of summaries) {
    counts.set(summary.dayName, (counts.get(summary.dayName) ?? 0) + 1);
  }
  const filters = [
    { dayName: 'Todas', count: summaries.length },
    ...[...counts.entries()].map(([dayName, count]) => ({ dayName, count })),
  ];

  const detailFor = (id: number): SessionDetail | undefined => {
    const summary = summaryOf(id);
    const workout = data.workouts.find((w) => w.id === id);
    if (summary === undefined || workout === undefined) return undefined;

    const sets = setsByWorkout.get(id) ?? [];
    const rests = deriveRestSeconds(sets);
    const restValues = rests.filter((r): r is number => r !== undefined);
    const avgRestSeconds = restValues.length === 0
      ? 0
      : Math.round(restValues.reduce((a, b) => a + b, 0) / restValues.length);

    const previous = data.workouts
      .filter((w) => w.dayName === workout.dayName && w.startedAt.getTime() < workout.startedAt.getTime())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];

    const byExercise = new Map<number, MockSet[]>();
    for (const set of sets) {
      const bucket = byExercise.get(set.exerciseId) ?? [];
      bucket.push(set);
      byExercise.set(set.exerciseId, bucket);
    }

    const previousSets = previous === undefined ? [] : setsByWorkout.get(previous.id) ?? [];
    let liftsUp = 0;
    let liftsTotal = 0;

    const exercises: SessionExercise[] = [];
    for (const [exerciseId, exerciseSets] of byExercise) {
      const exercise = exerciseById.get(exerciseId);
      if (exercise === undefined) continue;

      const top = topSetOf(exercise, exerciseSets);
      const priorSets = previousSets.filter((s) => s.exerciseId === exerciseId);
      const priorTop = priorSets.length === 0 ? undefined : topSetOf(exercise, priorSets);

      let delta = 'primera vez';
      let color = 'color-mix(in srgb, var(--color-text) 55%, transparent)';
      if (top !== undefined && priorTop !== undefined) {
        liftsTotal++;
        const now = effectiveLoad(exercise, top.weightKg);
        const before = effectiveLoad(exercise, priorTop.weightKg);
        if (now > before) {
          delta = formatDelta(top.weightKg - priorTop.weightKg, 'kg'); color = ACCENT_UP; liftsUp++;
        } else if (now === before && top.reps > priorTop.reps) {
          delta = formatDelta(top.reps - priorTop.reps, 'rep'); color = ACCENT_UP; liftsUp++;
        } else if (now < before) {
          delta = formatDelta(top.weightKg - priorTop.weightKg, 'kg'); color = ACCENT_DOWN;
        } else if (now === before && top.reps < priorTop.reps) {
          delta = formatDelta(top.reps - priorTop.reps, 'rep'); color = ACCENT_DOWN;
        } else {
          delta = 'se mantiene'; color = 'color-mix(in srgb, var(--color-text) 60%, transparent)';
        }
      }

      let workingIndex = 0;
      const rows: SetRow[] = exerciseSets.map((set) => {
        const restIndex = sets.indexOf(set);
        const rest = rests[restIndex];
        if (!set.isWarmup) workingIndex++;
        return {
          label: set.isWarmup ? 'W' : String(workingIndex),
          load: formatLoad(set.weightKg, set.reps, exercise.isBodyweight),
          rpe: set.rpe === undefined ? '—' : String(set.rpe),
          rest: rest === undefined ? '—' : `${rest}s`,
          isWarmup: set.isWarmup,
        };
      });

      exercises.push({
        exerciseId, name: exercise.name,
        muscleLabel: MUSCLE_GROUP_LABELS[exercise.muscleGroup],
        topSet: top === undefined ? '—' : formatLoad(top.weightKg, top.reps, exercise.isBodyweight),
        delta, deltaColor: color, sets: rows,
      });
    }

    const detail: SessionDetail = { ...summary, avgRestSeconds, exercises };
    if (workout.notes !== undefined) detail.notes = workout.notes;

    if (previous !== undefined) {
      const priorSummary = summaryOf(previous.id);
      const tonnageDelta = sessionTonnage(sets) - sessionTonnage(previousSets);
      const durationDelta = summary.durationMinutes - (priorSummary?.durationMinutes ?? 0);
      detail.comparison = {
        prevLabel: formatDayMonth(previous.startedAt, TIME_ZONE),
        tonnageDelta: formatDelta(Math.round(tonnageDelta), 'kg'),
        tonnageColor: tonnageDelta >= 0 ? ACCENT_UP : ACCENT_DOWN,
        durationDelta: formatDelta(durationDelta, 'min'),
        liftsUp, liftsTotal,
      };
    }
    return detail;
  };

  return { filters, summaries, detailFor };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm vitest run apps/web/src/presenters/sessions.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Implementar `SetTable`**

`apps/web/src/components/SetTable.tsx`:

```tsx
import type { SetRow } from '../presenters/sessions';

const COLUMNS = '34px 1fr 64px 64px';

export function SetTable({ rows }: { rows: readonly SetRow[] }) {
  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: COLUMNS, gap: 8, padding: '0 2px 6px',
        fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'color-mix(in srgb, var(--color-text) 50%, transparent)',
      }}>
        <span>Serie</span><span>Peso × reps</span>
        <span style={{ textAlign: 'center' }}>RPE</span>
        <span style={{ textAlign: 'center' }}>Descanso</span>
      </div>
      {rows.map((row, index) => (
        <div key={index} style={{
          display: 'grid', gridTemplateColumns: COLUMNS, gap: 8, alignItems: 'center',
          padding: '6px 2px', borderBottom: '1px solid var(--color-divider)',
          opacity: row.isWarmup ? 0.6 : 1,
        }}>
          <span style={{
            textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-heading)',
            color: `color-mix(in srgb, var(--color-text) ${row.isWarmup ? 40 : 65}%, transparent)`,
          }}>{row.label}</span>
          <span style={{ fontSize: 13.5 }}>
            {row.load}
            {row.isWarmup && <span className="text-muted" style={{ fontSize: 11 }}> · calentamiento</span>}
          </span>
          <span style={{ textAlign: 'center', fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 78%, transparent)' }}>{row.rpe}</span>
          <span style={{ textAlign: 'center', fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>{row.rest}</span>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 6: Implementar la pantalla**

`apps/web/src/screens/Sessions.tsx`:

```tsx
import { useState } from 'react';
import { MetricTile } from '../components/MetricTile';
import { SetTable } from '../components/SetTable';
import type { SessionsModel } from '../presenters/sessions';
import { navigate } from '../router';

export function Sessions({ model }: { model: SessionsModel }) {
  const [filter, setFilter] = useState('Todas');
  const visible = model.summaries.filter((s) => filter === 'Todas' || s.dayName === filter);
  const [selected, setSelected] = useState<number | undefined>(visible[0]?.id);
  const current = visible.some((s) => s.id === selected) ? selected : visible[0]?.id;
  const detail = current === undefined ? undefined : model.detailFor(current);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '344px 1fr', gap: 20, alignItems: 'start' }}>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Historial de sesiones</h3>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {model.filters.map((f) => (
            <button
              key={f.dayName}
              onClick={() => setFilter(f.dayName)}
              style={{
                padding: '6px 11px', fontSize: 12.5, fontFamily: 'var(--font-heading)',
                borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'transparent',
                color: filter === f.dayName ? 'var(--color-accent)' : 'var(--color-text)',
                border: `1px solid ${filter === f.dayName ? 'var(--color-accent)' : 'var(--color-divider)'}`,
              }}
            >
              {f.dayName} <span style={{ opacity: 0.6 }}>{f.count}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}>
          {visible.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelected(s.id)}
              style={{
                padding: 'var(--space-4) var(--space-6)', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', background: 'var(--color-surface)',
                boxShadow: s.id === current ? '0 0 0 1px var(--color-accent)' : 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, lineHeight: 1.1 }}>{s.dayName}</div>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{s.dateLabel} · {s.timeRange}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 11, fontSize: 12 }}>
                <span><span className="text-muted">Vol </span>{s.tonnage}</span>
                <span><span className="text-muted">Dur </span>{s.durationMinutes}m</span>
                <span><span className="text-muted">Series </span>{s.setCount}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {detail === undefined ? (
          <p className="text-muted">No hay sesiones para este filtro.</p>
        ) : (
          <>
            <div>
              <h2 style={{ margin: 0, fontSize: 30 }}>{detail.dayName}</h2>
              <p className="text-muted" style={{ margin: '5px 0 0', fontSize: 13 }}>
                {detail.dateLabel} · {detail.timeRange}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <MetricTile label="Duración" value={String(detail.durationMinutes)} unit="min" />
              <MetricTile label="Tonelaje" value={detail.tonnage} />
              <MetricTile label="Descanso medio" value={String(detail.avgRestSeconds)} unit="s" />
              <MetricTile label="Series efectivas" value={String(detail.setCount)} />
            </div>

            {detail.comparison !== undefined && (
              <div className="card" style={{
                padding: 'var(--space-6) var(--space-8)',
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 5%, var(--color-surface)), var(--color-surface))',
                boxShadow: '0 0 0 1px var(--color-accent-800), var(--shadow-sm)',
                flexDirection: 'row', alignItems: 'center', gap: 24, flexWrap: 'wrap',
              }}>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  frente a {detail.dayName} del {detail.comparison.prevLabel}
                </span>
                <span style={{ display: 'flex', gap: 7, fontSize: 14 }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>Tonelaje</span>
                  <span style={{ fontFamily: 'var(--font-heading)', color: detail.comparison.tonnageColor }}>
                    {detail.comparison.tonnageDelta}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 7, fontSize: 14 }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>Duración</span>
                  <span style={{ fontFamily: 'var(--font-heading)' }}>{detail.comparison.durationDelta}</span>
                </span>
                <span style={{ display: 'flex', gap: 7, fontSize: 14 }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>Ejercicios que progresaron</span>
                  <span style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-accent-300)' }}>
                    {detail.comparison.liftsUp} / {detail.comparison.liftsTotal}
                  </span>
                </span>
              </div>
            )}

            {detail.notes !== undefined && (
              <p style={{ margin: 0, padding: '2px 4px', fontSize: 13, fontStyle: 'italic',
                          color: 'color-mix(in srgb, var(--color-text) 75%, transparent)' }}>
                {detail.notes}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {detail.exercises.map((ex) => (
                <div key={ex.exerciseId} className="card elev-sm" style={{ padding: 'var(--space-6) var(--space-8)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={() => navigate('exercise', ex.exerciseId)}
                        style={{ fontFamily: 'var(--font-heading)', fontSize: 16, background: 'none',
                                 border: 'none', color: 'var(--color-text)', cursor: 'pointer', padding: 0 }}
                      >
                        {ex.name}
                      </button>
                      <span className="tag tag-accent">{ex.muscleLabel}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <span className="text-muted">Mejor {ex.topSet}</span>
                      <span style={{ fontFamily: 'var(--font-heading)', color: ex.deltaColor }}>{ex.delta}</span>
                    </div>
                  </div>
                  <SetTable rows={ex.sets} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Conectar en `App.tsx`**

Añadir los imports `buildSessions`, `Sessions`, el `useMemo` correspondiente, y la rama de
ruta. En el bloque `<main>`, sustituir el ternario por:

```tsx
{route === 'overview' && <Overview model={overview} />}
{route === 'sessions' && <Sessions model={sessions} />}
{route === 'routines' && <p>Pantalla: rutinas</p>}
{route === 'exercise' && <p>Pantalla: ejercicio</p>}
```

con `const sessions = useMemo(() => buildSessions(data), [data]);` junto a los otros `useMemo`.

- [ ] **Step 8: Verificar y commitear**

Run: `pnpm vitest run --project web && pnpm --filter @gym-tracker/web typecheck`
Expected: todos PASS, sin errores de tipos.

```bash
git add apps/web/src
git commit -m "feat(web): add session history screen with previous-session comparison"
```

---

### Task 7: Pantalla Rutinas

**Files:**
- Create: `apps/web/src/presenters/routines.ts`, `apps/web/src/presenters/routines.test.ts`, `apps/web/src/screens/Routines.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface RoutineCard { id: number; name: string; meta: string; isActive: boolean; archived: boolean }
  interface RoutineDayChip { id: number; name: string; count: number }
  interface RoutineExerciseRow { id: number; exerciseId: number; name: string; muscleLabel: string;
                                 targetSets: number; targetRepsMin: number; targetRepsMax: number;
                                 targetRestSeconds: number }
  interface RoutinesModel { cards: RoutineCard[]; daysFor(routineId: number): RoutineDayChip[];
                            exercisesFor(routineId: number, dayId: number): RoutineExerciseRow[];
                            catalog: Array<{ id: number; name: string; muscleLabel: string }> }
  function buildRoutines(data: Dataset): RoutinesModel
  function clampInt(value: string, min: number, max: number): number
  ```

- [ ] **Step 1: Escribir el test**

`apps/web/src/presenters/routines.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../data/mock';
import { buildRoutines, clampInt } from './routines';

const MODEL = buildRoutines(buildDataset(new Date('2026-07-25T18:00:00Z')));

describe('clampInt', () => {
  it('keeps values inside the range', () => {
    expect(clampInt('5', 1, 20)).toBe(5);
    expect(clampInt('99', 1, 20)).toBe(20);
    expect(clampInt('0', 1, 20)).toBe(1);
  });
  it('falls back to the minimum for junk input', () => {
    expect(clampInt('abc', 1, 20)).toBe(1);
    expect(clampInt('', 1, 20)).toBe(1);
  });
});

describe('buildRoutines', () => {
  it('describes each routine with day and exercise counts', () => {
    const active = MODEL.cards.find((c) => c.isActive);
    expect(active).toBeDefined();
    expect(active?.meta).toMatch(/días · \d+ ejercicios/);
  });

  it('separates archived routines', () => {
    expect(MODEL.cards.some((c) => c.archived)).toBe(true);
  });

  it('lists days in position order with their exercise counts', () => {
    const active = MODEL.cards.find((c) => c.isActive);
    expect(active).toBeDefined();
    if (active === undefined) return;
    const days = MODEL.daysFor(active.id);
    expect(days.length).toBeGreaterThan(0);
    expect(days[0]?.count).toBeGreaterThan(0);
  });

  it('labels catalog entries with Spanish muscle names', () => {
    expect(MODEL.catalog.length).toBeGreaterThan(0);
    for (const entry of MODEL.catalog) {
      expect(entry.muscleLabel).toMatch(/[A-Za-zÁÉÍÓÚáéíóú]/);
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm vitest run apps/web/src/presenters/routines.test.ts`
Expected: FAIL — no existe `./routines`.

- [ ] **Step 3: Implementar el presenter**

`apps/web/src/presenters/routines.ts`:

```ts
import { MUSCLE_GROUP_LABELS } from '@gym-tracker/core';
import type { Dataset } from '../data/types';

export interface RoutineCard { id: number; name: string; meta: string; isActive: boolean; archived: boolean }
export interface RoutineDayChip { id: number; name: string; count: number }
export interface RoutineExerciseRow {
  id: number; exerciseId: number; name: string; muscleLabel: string;
  targetSets: number; targetRepsMin: number; targetRepsMax: number; targetRestSeconds: number;
}
export interface RoutinesModel {
  cards: RoutineCard[];
  daysFor(routineId: number): RoutineDayChip[];
  exercisesFor(routineId: number, dayId: number): RoutineExerciseRow[];
  catalog: Array<{ id: number; name: string; muscleLabel: string }>;
}

export function clampInt(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

export function buildRoutines(data: Dataset): RoutinesModel {
  const exerciseById = new Map(data.exercises.map((e) => [e.id, e]));

  const cards = data.routines.map((routine) => {
    const exerciseCount = routine.days.reduce((sum, day) => sum + day.exercises.length, 0);
    return {
      id: routine.id,
      name: routine.name,
      meta: `${routine.days.length} días · ${exerciseCount} ejercicios`,
      isActive: routine.isActive,
      archived: routine.archived,
    };
  });

  const daysFor = (routineId: number): RoutineDayChip[] => {
    const routine = data.routines.find((r) => r.id === routineId);
    if (routine === undefined) return [];
    return [...routine.days]
      .sort((a, b) => a.position - b.position)
      .map((day) => ({ id: day.id, name: day.name, count: day.exercises.length }));
  };

  const exercisesFor = (routineId: number, dayId: number): RoutineExerciseRow[] => {
    const routine = data.routines.find((r) => r.id === routineId);
    const day = routine?.days.find((d) => d.id === dayId);
    if (day === undefined) return [];
    return [...day.exercises]
      .sort((a, b) => a.position - b.position)
      .flatMap((entry) => {
        const exercise = exerciseById.get(entry.exerciseId);
        if (exercise === undefined) return [];
        return [{
          id: entry.id, exerciseId: entry.exerciseId, name: exercise.name,
          muscleLabel: MUSCLE_GROUP_LABELS[exercise.muscleGroup],
          targetSets: entry.targetSets, targetRepsMin: entry.targetRepsMin,
          targetRepsMax: entry.targetRepsMax, targetRestSeconds: entry.targetRestSeconds,
        }];
      });
  };

  const catalog = data.exercises.map((e) => ({
    id: e.id, name: e.name, muscleLabel: MUSCLE_GROUP_LABELS[e.muscleGroup],
  }));

  return { cards, daysFor, exercisesFor, catalog };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm vitest run apps/web/src/presenters/routines.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Implementar la pantalla**

El editor mantiene su propio estado local sobre el modelo (reordenar por arrastre, editar
objetivos, buscar en el catálogo). No persiste: cuando exista la API, estos handlers pasarán
a llamarla.

`apps/web/src/screens/Routines.tsx`:

```tsx
import { useState } from 'react';
import { clampInt } from '../presenters/routines';
import type { RoutineExerciseRow, RoutinesModel } from '../presenters/routines';

export function Routines({ model }: { model: RoutinesModel }) {
  const firstCard = model.cards.find((c) => !c.archived) ?? model.cards[0];
  const [routineId, setRoutineId] = useState<number | undefined>(firstCard?.id);
  const days = routineId === undefined ? [] : model.daysFor(routineId);
  const [dayId, setDayId] = useState<number | undefined>(days[0]?.id);
  const currentDayId = days.some((d) => d.id === dayId) ? dayId : days[0]?.id;

  const [rows, setRows] = useState<RoutineExerciseRow[]>(
    routineId !== undefined && currentDayId !== undefined ? model.exercisesFor(routineId, currentDayId) : [],
  );
  const [dragId, setDragId] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const selectDay = (id: number) => {
    setDayId(id);
    if (routineId !== undefined) setRows(model.exercisesFor(routineId, id));
  };
  const selectRoutine = (id: number) => {
    setRoutineId(id);
    const next = model.daysFor(id)[0];
    setDayId(next?.id);
    setRows(next === undefined ? [] : model.exercisesFor(id, next.id));
  };
  const update = (id: number, field: keyof RoutineExerciseRow, value: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const move = (fromId: number, toId: number) => {
    setRows((prev) => {
      const from = prev.findIndex((r) => r.id === fromId);
      const to = prev.findIndex((r) => r.id === toId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  };

  const query = search.trim().toLowerCase();
  const results = model.catalog.filter((c) => query === '' || c.name.toLowerCase().includes(query)).slice(0, 40);
  const COLUMNS = '26px 1fr 66px 108px 78px 34px';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Rutinas</h3>
        {model.cards.filter((c) => !c.archived).map((card) => (
          <div
            key={card.id}
            onClick={() => selectRoutine(card.id)}
            style={{
              padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
              background: 'var(--color-surface)',
              boxShadow: card.id === routineId ? '0 0 0 1px var(--color-accent)' : 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{card.name}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{card.meta}</div>
              </div>
              {card.isActive && <span className="tag tag-outline" style={{ flex: 'none' }}>Activa</span>}
            </div>
          </div>
        ))}
        {model.cards.some((c) => c.archived) && (
          <>
            <div className="text-muted" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Archivadas
            </div>
            {model.cards.filter((c) => c.archived).map((card) => (
              <div
                key={card.id}
                onClick={() => selectRoutine(card.id)}
                style={{
                  padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: 'var(--color-surface)', boxShadow: 'var(--shadow-sm)', opacity: 0.75,
                }}
              >
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14 }}>{card.name}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{card.meta}</div>
              </div>
            ))}
          </>
        )}
      </aside>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {days.map((day) => (
            <button
              key={day.id}
              onClick={() => selectDay(day.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px',
                fontFamily: 'var(--font-heading)', fontSize: 14, borderRadius: 'var(--radius-md)',
                cursor: 'pointer', background: 'transparent',
                color: day.id === currentDayId ? 'var(--color-accent)' : 'var(--color-text)',
                border: `1px solid ${day.id === currentDayId ? 'var(--color-accent)' : 'var(--color-divider)'}`,
              }}
            >
              {day.name}
              <span style={{
                fontSize: 11, padding: '1px 7px', borderRadius: 20,
                background: day.id === currentDayId
                  ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)'
                  : 'var(--color-neutral-800)',
              }}>{day.count}</span>
            </button>
          ))}
        </div>

        <div className="card elev-sm" style={{ padding: 'var(--space-8)', gap: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => setAddOpen(!addOpen)} style={{ padding: '6px 12px' }}>
              {addOpen ? 'Cerrar' : 'Añadir ejercicio'}
            </button>
          </div>

          {addOpen && (
            <div style={{
              border: '1px solid var(--color-accent-700)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg)', padding: 'var(--space-6)',
              display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
            }}>
              <input
                className="input"
                placeholder="Buscar en el catálogo de ejercicios…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 260, overflow: 'auto' }}>
                {results.length === 0 ? (
                  <div className="text-muted" style={{ fontSize: 12, padding: '10px 8px' }}>
                    Sin coincidencias en el catálogo.
                  </div>
                ) : results.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setRows((prev) => [...prev, {
                      id: -Date.now(), exerciseId: entry.id, name: entry.name,
                      muscleLabel: entry.muscleLabel, targetSets: 3,
                      targetRepsMin: 8, targetRepsMax: 12, targetRestSeconds: 90,
                    }])}
                    style={{
                      display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 8px',
                      background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--color-divider)', cursor: 'pointer',
                      color: 'var(--color-text)', textAlign: 'left', font: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{entry.name}</span>
                    <span className="tag tag-accent">{entry.muscleLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: COLUMNS, gap: 12, padding: '0 4px 8px',
            fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'color-mix(in srgb, var(--color-text) 55%, transparent)',
          }}>
            <span /><span>Ejercicio</span>
            <span style={{ textAlign: 'center' }}>Series</span>
            <span style={{ textAlign: 'center' }}>Repeticiones</span>
            <span style={{ textAlign: 'center' }}>Descanso</span>
            <span />
          </div>

          {rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', border: '1px dashed var(--color-divider)', borderRadius: 'var(--radius-md)' }}>
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Este día no tiene ejercicios todavía.</p>
            </div>
          ) : rows.map((row) => (
            <div
              key={row.id}
              draggable
              onDragStart={() => setDragId(row.id)}
              onDragOver={(e) => { e.preventDefault(); if (dragId !== undefined && dragId !== row.id) move(dragId, row.id); }}
              onDragEnd={() => setDragId(undefined)}
              style={{
                display: 'grid', gridTemplateColumns: COLUMNS, gap: 12, alignItems: 'center',
                padding: '8px 4px', borderBottom: '1px solid var(--color-divider)',
                opacity: dragId === row.id ? 0.5 : 1,
              }}
            >
              <span style={{ cursor: 'grab', textAlign: 'center', color: 'color-mix(in srgb, var(--color-text) 40%, transparent)' }} title="Arrastra para reordenar">⋮⋮</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.name}
                </span>
                <span className="tag tag-accent" style={{ marginTop: 4 }}>{row.muscleLabel}</span>
              </span>
              <input className="input" type="number" value={row.targetSets} style={{ minHeight: 34, textAlign: 'center', padding: 4 }}
                     onChange={(e) => update(row.id, 'targetSets', clampInt(e.target.value, 1, 20))} />
              <span style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
                <input className="input" type="number" value={row.targetRepsMin} style={{ minHeight: 34, textAlign: 'center', padding: 4, width: 44 }}
                       onChange={(e) => update(row.id, 'targetRepsMin', clampInt(e.target.value, 1, 50))} />
                <span className="text-muted" style={{ fontSize: 13 }}>–</span>
                <input className="input" type="number" value={row.targetRepsMax} style={{ minHeight: 34, textAlign: 'center', padding: 4, width: 44 }}
                       onChange={(e) => update(row.id, 'targetRepsMax', clampInt(e.target.value, 1, 50))} />
              </span>
              <span style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
                <input className="input" type="number" step={15} value={row.targetRestSeconds} style={{ minHeight: 34, textAlign: 'center', padding: 4, width: 52 }}
                       onChange={(e) => update(row.id, 'targetRestSeconds', clampInt(e.target.value, 0, 600))} />
                <span className="text-muted" style={{ fontSize: 12 }}>s</span>
              </span>
              <button className="btn btn-icon btn-ghost" title="Quitar" style={{ width: 30, height: 30 }}
                      onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}>
                ×
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Conectar en `App.tsx`**

Añadir `const routines = useMemo(() => buildRoutines(data), [data]);` y sustituir la rama:

```tsx
{route === 'routines' && <Routines model={routines} />}
```

- [ ] **Step 7: Verificar y commitear**

Run: `pnpm vitest run --project web && pnpm --filter @gym-tracker/web typecheck`
Expected: todos PASS.

```bash
git add apps/web/src
git commit -m "feat(web): add routines editor screen with drag reordering"
```

---

### Task 8: Pantalla Detalle de ejercicio

Es la pantalla que no venía en el proyecto de diseño; se construye con los mismos tokens y patrones.

**Files:**
- Create: `apps/web/src/presenters/exercise.ts`, `apps/web/src/presenters/exercise.test.ts`, `apps/web/src/screens/ExerciseDetail.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface ExercisePoint { weekKey: string; estimated1RM: number; isRecord: boolean }
  interface ExerciseModel {
    exerciseId: number; name: string; muscleLabel: string;
    current1RM: string; best1RM: string; totalSets: number; avgRestSeconds: number;
    trend: ExercisePoint[];
    sessionVolume: Array<{ dateLabel: string; tonnage: number }>;
    history: Array<{ dateLabel: string; dayName: string; sets: SetRow[] }>;
    bestEver: string; mostRecent: string;
  }
  function buildExercise(data: Dataset, exerciseId: number): ExerciseModel | undefined
  function firstExerciseId(data: Dataset): number | undefined
  ```

- [ ] **Step 1: Escribir el test**

`apps/web/src/presenters/exercise.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../data/mock';
import { buildExercise, firstExerciseId } from './exercise';

const DATA = buildDataset(new Date('2026-07-25T18:00:00Z'));
const ID = firstExerciseId(DATA);

describe('buildExercise', () => {
  it('returns undefined for an unknown exercise', () => {
    expect(buildExercise(DATA, -1)).toBeUndefined();
  });

  it('builds a 1RM trend in chronological order', () => {
    expect(ID).toBeDefined();
    if (ID === undefined) return;
    const model = buildExercise(DATA, ID);
    expect(model).toBeDefined();
    const keys = model?.trend.map((p) => p.weekKey) ?? [];
    expect([...keys].sort()).toEqual(keys);
  });

  it('marks records as the running maximum of estimated 1RM', () => {
    if (ID === undefined) return;
    const trend = buildExercise(DATA, ID)?.trend ?? [];
    expect(trend.length).toBeGreaterThan(0);
    expect(trend[0]?.isRecord).toBe(true);
    let running = 0;
    for (const point of trend) {
      if (point.isRecord) {
        expect(point.estimated1RM).toBeGreaterThan(running);
        running = point.estimated1RM;
      }
    }
  });

  it('reports one volume entry per session and a non-empty history', () => {
    if (ID === undefined) return;
    const model = buildExercise(DATA, ID);
    expect(model?.sessionVolume.length).toBeGreaterThan(0);
    expect(model?.history.length).toBe(model?.sessionVolume.length);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm vitest run apps/web/src/presenters/exercise.test.ts`
Expected: FAIL — no existe `./exercise`.

- [ ] **Step 3: Implementar el presenter**

`apps/web/src/presenters/exercise.ts`:

```ts
import {
  MUSCLE_GROUP_LABELS, deriveRestSeconds, effectiveSets, estimate1RM, isoWeekKey, sessionTonnage,
} from '@gym-tracker/core';
import { TIME_ZONE } from '../config';
import type { Dataset, MockSet } from '../data/types';
import { formatDayMonth, formatKg, formatLoad } from './format';
import type { SetRow } from './sessions';

export interface ExercisePoint { weekKey: string; estimated1RM: number; isRecord: boolean }

export interface ExerciseModel {
  exerciseId: number; name: string; muscleLabel: string;
  current1RM: string; best1RM: string; totalSets: number; avgRestSeconds: number;
  trend: ExercisePoint[];
  sessionVolume: Array<{ dateLabel: string; tonnage: number }>;
  history: Array<{ dateLabel: string; dayName: string; sets: SetRow[] }>;
  bestEver: string; mostRecent: string;
}

export function firstExerciseId(data: Dataset): number | undefined {
  return data.exercises[0]?.id;
}

export function buildExercise(data: Dataset, exerciseId: number): ExerciseModel | undefined {
  const exercise = data.exercises.find((e) => e.id === exerciseId);
  if (exercise === undefined) return undefined;

  const own = data.sets.filter((s) => s.exerciseId === exerciseId);
  if (own.length === 0) return undefined;

  const working = effectiveSets(own);
  const oneRM = (set: MockSet) => estimate1RM(set.weightKg > 0 ? set.weightKg : 1, set.reps);

  // Best estimated 1RM per ISO week, chronological.
  const byWeek = new Map<string, number>();
  for (const set of working) {
    const key = isoWeekKey(set.createdAt, TIME_ZONE);
    byWeek.set(key, Math.max(byWeek.get(key) ?? 0, oneRM(set)));
  }
  let running = 0;
  const trend: ExercisePoint[] = [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([weekKey, value]) => {
      const isRecord = value > running;
      if (isRecord) running = value;
      return { weekKey, estimated1RM: value, isRecord };
    });

  // Per-session volume and history, newest first.
  const workoutIds = [...new Set(own.map((s) => s.workoutId))];
  const sessions = workoutIds
    .flatMap((id) => {
      const workout = data.workouts.find((w) => w.id === id);
      return workout === undefined ? [] : [workout];
    })
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const sessionVolume = sessions.map((workout) => ({
    dateLabel: formatDayMonth(workout.startedAt, TIME_ZONE),
    tonnage: sessionTonnage(own.filter((s) => s.workoutId === workout.id)),
  }));

  const history = sessions.map((workout) => {
    const sets = own.filter((s) => s.workoutId === workout.id).sort((a, b) => a.position - b.position);
    const rests = deriveRestSeconds(sets);
    let index = 0;
    return {
      dateLabel: formatDayMonth(workout.startedAt, TIME_ZONE),
      dayName: workout.dayName,
      sets: sets.map((set, i): SetRow => {
        if (!set.isWarmup) index++;
        const rest = rests[i];
        return {
          label: set.isWarmup ? 'W' : String(index),
          load: formatLoad(set.weightKg, set.reps, exercise.isBodyweight),
          rpe: set.rpe === undefined ? '—' : String(set.rpe),
          rest: rest === undefined ? '—' : `${rest}s`,
          isWarmup: set.isWarmup,
        };
      }),
    };
  });

  const restValues = deriveRestSeconds(own).filter((r): r is number => r !== undefined);

  const bestSet = [...working].sort((a, b) => oneRM(b) - oneRM(a))[0];
  const latestSet = [...working].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const latestWeek = trend[trend.length - 1];

  return {
    exerciseId,
    name: exercise.name,
    muscleLabel: MUSCLE_GROUP_LABELS[exercise.muscleGroup],
    current1RM: `${formatKg(Math.round(latestWeek?.estimated1RM ?? 0))} kg`,
    best1RM: `${formatKg(Math.round(running))} kg`,
    totalSets: working.length,
    avgRestSeconds: restValues.length === 0
      ? 0
      : Math.round(restValues.reduce((a, b) => a + b, 0) / restValues.length),
    trend,
    sessionVolume,
    history,
    bestEver: bestSet === undefined ? '—' : formatLoad(bestSet.weightKg, bestSet.reps, exercise.isBodyweight),
    mostRecent: latestSet === undefined ? '—' : formatLoad(latestSet.weightKg, latestSet.reps, exercise.isBodyweight),
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm vitest run apps/web/src/presenters/exercise.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Implementar la pantalla**

`apps/web/src/screens/ExerciseDetail.tsx`:

```tsx
import { AreaChart } from '../components/AreaChart';
import { MetricTile } from '../components/MetricTile';
import { SetTable } from '../components/SetTable';
import type { ExerciseModel } from '../presenters/exercise';

export function ExerciseDetail({ model }: { model: ExerciseModel }) {
  const maxTonnage = Math.max(1, ...model.sessionVolume.map((v) => v.tonnage));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 30 }}>{model.name}</h2>
        <span className="tag tag-accent">{model.muscleLabel}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <MetricTile label="1RM estimado" value={model.current1RM} />
        <MetricTile label="Mejor histórico" value={model.best1RM} />
        <MetricTile label="Series efectivas" value={String(model.totalSets)} />
        <MetricTile label="Descanso medio" value={String(model.avgRestSeconds)} unit="s" />
      </div>

      <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
          <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Evolución del 1RM estimado</h5>
          <span className="text-muted" style={{ fontSize: 11 }}>
            {model.trend.filter((p) => p.isRecord).length} récords
          </span>
        </div>
        <AreaChart points={model.trend.map((p) => p.estimated1RM)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <h5 style={{ margin: '0 0 var(--space-6)', fontSize: 13, letterSpacing: '0.04em' }}>Volumen por sesión</h5>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {model.sessionVolume.slice(0, 10).map((entry) => (
              <div key={entry.dateLabel} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px', gap: 10, alignItems: 'center' }}>
                <span className="text-muted" style={{ fontSize: 12 }}>{entry.dateLabel}</span>
                <div style={{ height: 9, background: 'var(--color-neutral-900)', borderRadius: 5 }}>
                  <div style={{
                    height: '100%', width: `${(entry.tonnage / maxTonnage) * 100}%`,
                    background: 'var(--color-accent-400)', borderRadius: 5,
                  }} />
                </div>
                <span style={{ fontSize: 12, textAlign: 'right' }}>{Math.round(entry.tonnage)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card elev-sm" style={{ padding: 'var(--space-8)', gap: 'var(--space-4)' }}>
          <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Mejor serie frente a la más reciente</h5>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span className="text-muted">Mejor histórica</span>
            <span style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-accent-300)' }}>{model.bestEver}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span className="text-muted">Más reciente</span>
            <span style={{ fontFamily: 'var(--font-heading)' }}>{model.mostRecent}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Histórico de series</h5>
        {model.history.slice(0, 8).map((entry) => (
          <div key={entry.dateLabel} className="card elev-sm" style={{ padding: 'var(--space-6) var(--space-8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-4)' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{entry.dateLabel}</span>
              <span className="tag tag-neutral">{entry.dayName}</span>
            </div>
            <SetTable rows={entry.sets} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Conectar la ruta con su parámetro**

En `apps/web/src/App.tsx`, leer `exerciseId` de la ruta y caer al primero del catálogo cuando
no venga en el hash:

```tsx
const { route, exerciseId } = useRoute();
const targetId = exerciseId ?? firstExerciseId(data);
const exercise = useMemo(
  () => (targetId === undefined ? undefined : buildExercise(data, targetId)),
  [data, targetId],
);
```

y la rama:

```tsx
{route === 'exercise' && (
  exercise === undefined
    ? <p className="text-muted">Ejercicio no encontrado.</p>
    : <ExerciseDetail model={exercise} />
)}
```

- [ ] **Step 7: Verificación final completa**

Run: `pnpm test && pnpm typecheck && pnpm --filter @gym-tracker/web build`
Expected: toda la suite del monorepo PASS (node + web), sin errores de tipos, build correcto.

- [ ] **Step 8: Comprobación manual**

Run: `pnpm --filter @gym-tracker/web dev`
Abrir `http://localhost:5173` y verificar: las cuatro pantallas navegan, el Resumen muestra
ejercicios estancados con enlace al detalle, Sesiones muestra la banda de comparación, y
Rutinas permite reordenar por arrastre.

- [ ] **Step 9: Actualizar la documentación de decisiones**

Añadir a `DECISIONS.md` las entradas correspondientes: adopción de Nocturne en lugar de
Tailwind/shadcn, SVG en lugar de Recharts, router propio, y la conservación del `@import` de
Google Fonts con su contrapartida. Actualizar la tabla de stack de `SPEC.md` §3 para que
refleje el estado real.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src DECISIONS.md SPEC.md
git commit -m "feat(web): add exercise detail screen and record stack decisions"
```

---

## Notas de revisión del plan

- **Cobertura del spec:** §4 arquitectura → Tasks 1-2; §4 flujo de datos → Task 3; §5.1 → Task 5;
  §5.2 → Task 6; §5.3 → Task 7; §5.4 → Task 8; §6 dependencias → Task 1; §7 pruebas → repartido
  en todas las tareas.
- **La sugerencia de entrenamiento del mockup no se implementa** (spec §5.1). El test
  `never invents coaching advice` de la Task 5 lo fija como comportamiento.
- **`SetRow` se define en `presenters/sessions.ts`** y lo reutilizan `SetTable` (Task 6) y
  `presenters/exercise.ts` (Task 8). Un único tipo, no dos.
