# Gráficas en el bot y comando `/stagnant` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer visual el bot sin tocar el camino crítico de captura: barras de texto en la bienvenida, gráfica rasterizada de volumen semanal al cerrar el entrenamiento y bajo botón, gráfica de 1RM por ejercicio bajo botón, aviso de estancamiento en `/last` y comando nuevo `/stagnant`.

**Architecture:** Un directorio nuevo `apps/server/src/charts/` separa **qué se dibuja** (funciones puras que devuelven configuraciones de Chart.js, testeables sin canvas) de **cómo se pinta** (`render.ts`, único fichero que importa skia-canvas y chart.js, con carga diferida y degradación a `null`). Las fotos son siempre mensajes nuevos; las pantallas editables (bienvenida, detalle de `/last`, resumen de `/finish`) siguen siendo texto. Ninguna regla de negocio nueva: la banda 10–20 se mueve del dashboard a `packages/core` y todo lo demás sale de funciones de dominio que ya existen.

**Tech Stack:** TypeScript estricto (ESM), grammY 1.45, `chart.js` 4.x + `skia-canvas` (dependencias nuevas, justificadas en la Tarea 1), `node:sqlite`, i18next 26, Vitest 4, pnpm workspaces.

## Global Constraints

- **Node 24** (mínimo 23.4.0), **pnpm 11.x**, `engine-strict=true`.
- **Dos dependencias nuevas y solo dos**: `chart.js` y `skia-canvas`, ambas en `apps/server`. Cualquier otra (adaptadores de fecha, librerías de fechas, plugins de Chart.js, `canvas`, `@resvg/resvg-js`) **está prohibida**: para y pregunta al autor (SPEC §12). En particular, **no entra `chartjs-adapter-date-fns`**: el eje temporal se hace con `type: 'linear'` sobre epoch-ms.
- **`packages/core` no puede depender de nada nativo ni de I/O** (SPEC §3). Las gráficas viven en `apps/server`, nunca en `core`.
- **Sin cambios de esquema ni migraciones.** Nada nuevo en `packages/db/src/schema.ts` ni en `packages/db/drizzle/`.
- **Idioma:** identificadores, nombres de fichero y comentarios de código **en inglés**; textos de interfaz **en español e inglés**, siempre vía i18n; mensajes de commit **en inglés** (Conventional Commits con ámbito, p. ej. `feat(server):`).
- **Todo texto de interfaz vive en los dos catálogos** (`apps/server/src/i18n/locales/es.ts` y `en.ts`) y se expone en el objeto `T` de `apps/server/src/bot/texts.ts`. `parity.test.ts` falla si una clave existe en un idioma y no en el otro, o si usa variables distintas. Nunca literales en español dentro de un handler.
- **TypeScript estricto** con tres opciones que cambian cómo se escribe el código a diario:
  - `noUncheckedIndexedAccess` — `arr[0]` es `T | undefined`; compruébalo o justifica el `as`.
  - `exactOptionalPropertyTypes` — a `rpe?: number` no se le asigna `undefined`; se omite la clave.
  - `verbatimModuleSyntax` — las importaciones de solo-tipo van con `import type`. **Esto es crítico aquí:** los constructores de configuración importan tipos de `chart.js` con `import type`, que se borra al compilar y por tanto no carga el paquete.
- **Nada de `any` sin comentario que lo justifique.**
- **Los tests viven junto al código** (`foo.ts` → `foo.test.ts`), nunca en un árbol `__tests__`.
- **TDD:** en cada tarea el test se escribe primero, se ve fallar, y solo entonces se implementa.
- **Lienzo 1000×560 px**, `responsive: false`, `animation: false`, registro explícito de controladores (nunca `chart.js/auto`).
- **Mínimos tipográficos**: fuente ≥ 18 px para etiquetas, ≥ 16 px para cifras de eje, trazos ≥ 2 px. Viven como constantes con nombre en `charts/theme.ts`.
- **Colores literales** (no `var(--color-*)`, que no existen fuera del DOM): `bg #161826`, `text #e9e9ed`, `divider rgba(233,233,237,0.16)`, `track #292b31`, `accent #9184d9`, `barInBand #b5abfc`, `barOutOfBand #d4a15a`, `bandFill rgba(145,132,217,0.13)`.
- **Ninguna foto viaja en `/start`.** La bienvenida sigue costando un solo mensaje editable.
- **`render.ts` nunca lanza**: devuelve `Buffer` o `null`. Quien llama trata `null` como «no hay foto» y sigue con su texto.
- Comandos para verificar: `pnpm test` (toda la suite), `pnpm vitest run <ruta>` (un fichero), `pnpm typecheck` (los cuatro paquetes).

---

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `apps/server/package.json` | *(modificado)* `chart.js` y `skia-canvas` | 1 |
| `SPEC.md` | *(modificado)* §3 módulos nativos y fila «Gráficas»; §6 comandos | 1, 14 |
| `DECISIONS.md` | *(modificado)* entradas nuevas de esta fase | 1, 14 |
| `packages/core/src/volume.ts` | *(modificado)* `VOLUME_TARGET_MIN/MAX`, `isVolumeInBand` | 2 |
| `apps/web/src/config.ts`, `presenters/volume.ts`, `presenters/overview.ts`, `components/VolumeBar.tsx` | *(modificados/borrados)* pasan a importar la banda de `core` | 2 |
| `packages/db/src/repositories/sets.ts` | *(modificado)* `muscle_group` en `listEffectiveSetsBetween`; `listEffectiveSetsForUser` nuevo | 3, 13 |
| `apps/server/src/services/weekly-volume.ts` | **(nuevo)** `weeklyGroupCounts`, `isoWeekRange` | 4, 8 |
| `apps/server/src/services/overview-service.ts` | *(modificado)* `buildUserSummary` devuelve resumen + volumen semanal | 4 |
| `apps/server/src/charts/volume-bars.ts` | **(nuevo)** barras de texto para el `<pre>` de la bienvenida | 5 |
| `apps/server/src/bot/welcome.ts` | *(modificado)* bloque de barras; botón `📊 Semana`; `COMMAND_ORDER` | 5, 9, 13 |
| `apps/server/src/charts/theme.ts` | **(nuevo)** paleta y mínimos tipográficos | 6 |
| `apps/server/src/charts/render.ts` | **(nuevo)** configuración → `Buffer` PNG, carga diferida, no lanza | 6 |
| `apps/server/src/charts/weekly-volume.ts` | **(nuevo)** datos → configuración de barras | 7 |
| `apps/server/src/bot/weekly-chart.ts` | **(nuevo)** envío de la gráfica semanal (compartido por `/finish` y el botón) | 8 |
| `apps/server/src/bot/capture.ts` | *(modificado)* `handleFinish` envía la foto tras el resumen | 8 |
| `apps/server/src/bot/test-harness.ts` | *(modificado)* observa `sendPhoto` | 8 |
| `apps/server/src/services/exercise-sessions.ts` | **(nuevo)** 1RM por sesión y marcado de récords | 10 |
| `apps/server/src/charts/exercise-1rm.ts` | **(nuevo)** datos → configuración de línea con eje temporal | 11 |
| `apps/server/src/bot/last.ts` | *(modificado)* aviso de estancamiento, botón de gráfica, locale del eje | 12 |
| `apps/server/src/bot/callback-data.ts` | *(modificado)* `CB.wcChart`, `CB.chart(id)` | 9, 12 |
| `apps/server/src/bot/stagnant.ts` | **(nuevo)** comando `/stagnant` | 13 |
| `apps/server/src/bot/bot.ts` | *(modificado)* registra `/stagnant` | 13 |
| `apps/server/src/i18n/locales/{es,en}.ts`, `bot/texts.ts` | *(modificados)* claves nuevas | 5, 8, 9, 12, 13 |
| `CONTRIBUTING.md` | *(modificado)* cifra de referencia de la suite | 14 |

Cada tarea deja la suite entera en verde antes de commitear.

---

### Task 1: Spike de skia-canvas y Chart.js

Va primero porque **todo el diseño depende de que este spike salga bien** (spec §7, riesgo 1). Si skia-canvas no carga en Windows dentro de Vitest, hay que revisar el diseño aquí y no en la tarea 8.

**Files:**
- Modify: `apps/server/package.json` (dependencias)
- Create: `apps/server/src/charts/spike.test.ts` *(temporal: la Tarea 6 lo sustituye por `render.test.ts`)*
- Modify: `SPEC.md` (§3)
- Modify: `DECISIONS.md`

**Interfaces:**
- Consumes: nada.
- Produces: la **receta de render validada** (qué hay que pasarle a `new Chart(...)` para que funcione headless) y las versiones exactas instaladas. La Tarea 6 la convierte en `charts/render.ts`.

- [ ] **Step 1: Instala las dos dependencias**

```bash
pnpm --filter @gym-tracker/server add chart.js skia-canvas
```

Anota las versiones que hayan quedado en `apps/server/package.json`: se citan en `DECISIONS.md` en el paso 6.

- [ ] **Step 2: Escribe el test del spike**

Crea `apps/server/src/charts/spike.test.ts`. Es un test de verdad, no un script: comprueba a la vez que el paquete carga **dentro de Vitest** y que produce un PNG del tamaño pedido.

```ts
import { Chart, BarController, BarElement, CategoryScale, LinearScale } from 'chart.js';
import { Canvas } from 'skia-canvas';
import { describe, expect, it } from 'vitest';

// Cabecera PNG: firma de 8 bytes, luego el chunk IHDR con ancho y alto en big-endian.
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect([...buffer.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('spike: chart.js sobre skia-canvas', () => {
  it('dibuja un PNG de 1000×560 sin DOM', async () => {
    Chart.register(BarController, BarElement, CategoryScale, LinearScale);
    const canvas = new Canvas(1000, 560);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#161826';
    ctx.fillRect(0, 0, 1000, 560);

    const chart = new Chart(ctx as unknown as CanvasRenderingContext2D, {
      type: 'bar',
      data: {
        labels: ['Pecho', 'Cuádriceps', 'Bíceps'],
        datasets: [{ data: [14, 22, 6], backgroundColor: '#b5abfc' }],
      },
      options: {
        indexAxis: 'y',
        responsive: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#e9e9ed', font: { size: 16 } } },
          y: { ticks: { color: '#e9e9ed', font: { size: 18 } } },
        },
      },
    });

    const buffer = await canvas.toBuffer('png');
    chart.destroy();

    expect(pngSize(buffer)).toEqual({ width: 1000, height: 560 });
    // Guarda el PNG para mirarlo en el móvil (paso 5).
    const { writeFile } = await import('node:fs/promises');
    await writeFile('spike-chart.png', buffer);
  });
});
```

- [ ] **Step 3: Ejecuta el test**

Run: `pnpm vitest run apps/server/src/charts/spike.test.ts`
Expected: PASS, y un `spike-chart.png` en la raíz del repo.

Si falla:
- **`Cannot find module` del `.node`** → skia-canvas no trae binario para esta plataforma. **Para y reporta al autor**: el diseño se revisa antes de seguir.
- **`Cannot read properties of undefined (reading 'style')`** o similar → Chart.js está intentando detectar plataforma DOM. Añade `platform: BasicPlatform` (importándolo de `chart.js`) dentro de `options` y vuelve a probar. Anota si hizo falta: la Tarea 6 copia la receta exacta.
- **Las etiquetas salen vacías en el PNG** → falta una fuente `sans-serif` en el sistema. Anótalo; es la contrapartida que la Fase 4 tendrá que resolver en la imagen Docker.

- [ ] **Step 4: Comprueba si hay binario para musl**

Run: `npm view skia-canvas optionalDependencies` y `ls node_modules/@skia-canvas 2>/dev/null || ls node_modules/skia-canvas/lib`

Busca un paquete o binario cuyo nombre contenga `musl` (p. ej. `linux-x64-musl`). Anota **sí** o **no**: si no lo hay, la imagen Docker de la Fase 4 no puede basarse en Alpine y tiene que ir sobre `debian-slim`. Es un dato para `DECISIONS.md`, no un bloqueo de esta fase.

- [ ] **Step 5: Mira el PNG en el móvil**

Los mínimos tipográficos existen para sobrevivir a la recompresión de Telegram, y eso **solo se mide en una foto recibida de verdad** (spec §7, riesgo 3). Con el token del bot a mano (`TELEGRAM_BOT_TOKEN`, el mismo que usa `apps/server/src/config.ts`) y el id de chat del autor:

```bash
curl -F "chat_id=<ALLOWED_TELEGRAM_ID>" -F "photo=@spike-chart.png" \
  "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendPhoto"
```

Si no tienes acceso al token, **detente y pide al autor** que envíe el PNG a su propio chat y confirme que las etiquetas se leen en el móvil. No sigas a la Tarea 6 sin esa confirmación: es el criterio de aceptación del spike.

- [ ] **Step 6: Actualiza SPEC.md y DECISIONS.md**

En `SPEC.md`, sustituye el párrafo de la prohibición (línea ~78) por:

```markdown
**Prohibido usar `better-sqlite3`** ni cualquier otro módulo nativo que **exija un compilador**
en la máquina del usuario: rompe las instalaciones de quien no lo tiene. Sí se admiten módulos
nativos que distribuyan **binarios precompilados por plataforma** y no compilen nada al
instalarse; `skia-canvas`, que rasteriza las gráficas del bot, entra por esa puerta
(ver `DECISIONS.md`).
```

Y en la tabla del stack, cambia la fila de gráficas:

```markdown
| Gráficas | SVG escrito a mano en el dashboard; Chart.js sobre skia-canvas en el bot |
```

En `DECISIONS.md`, abre una sección `## 2026-07-26 — Gráficas en el bot` y añade la primera entrada:

```markdown
- **Chart.js sobre skia-canvas para rasterizar las gráficas del bot.** Telegram no renderiza SVG
  dentro de un mensaje: solo imágenes rasterizadas enviadas como foto. Descartadas:
  `@resvg/resvg-js` (mismo coste de módulo nativo y habría que escribir las gráficas a mano otra
  vez), generar el PNG a mano con `node:zlib` (semanas de trabajo para peor resultado) y usar
  bloques Unicode como sustituto total del raster (no da ejes, escalas ni series temporales).
  Contrapartidas asumidas: contradice el SPEC §3 original (por eso el SPEC se edita, no se
  ignora), el árbol crece decenas de MB, y la Fase 4 no podrá empaquetar un binario
  autocontenido sin arrastrar el `.node`. Versiones instaladas: chart.js <X>, skia-canvas <Y>.
  Binario para musl: <sí/no> — si no lo hay, la imagen Docker de la Fase 4 va sobre
  `debian-slim`, no sobre Alpine.
```

Sustituye `<X>`, `<Y>` y `<sí/no>` por lo que hayas medido en los pasos 1 y 4.

- [ ] **Step 7: Borra el PNG del spike y commitea**

`spike-chart.png` **no se versiona**.

```bash
rm spike-chart.png
git add apps/server/package.json pnpm-lock.yaml apps/server/src/charts/spike.test.ts SPEC.md DECISIONS.md
git commit -m "chore(server): add chart.js and skia-canvas behind a render spike"
```

---

### Task 2: La banda 10–20 se mueve a `packages/core`

Cambio mecánico e independiente del resto. Se hace ahora para que el bot no redeclare la banda cuando llegue a la Tarea 7 (SPEC §7 prohíbe duplicar reglas de negocio entre las dos apps).

**Files:**
- Modify: `packages/core/src/volume.ts`
- Modify: `packages/core/src/volume.test.ts`
- Delete: `apps/web/src/presenters/volume.ts`, `apps/web/src/presenters/volume.test.ts`
- Modify: `apps/web/src/config.ts`, `apps/web/src/config.test.ts`, `apps/web/src/components/VolumeBar.tsx`, `apps/web/src/presenters/overview.ts`

**Interfaces:**
- Consumes: nada.
- Produces: desde `@gym-tracker/core`, `VOLUME_TARGET_MIN: number` (10), `VOLUME_TARGET_MAX: number` (20) e `isVolumeInBand(count: number): boolean`. Las tareas 5, 7 y 12 las importan de ahí.

- [ ] **Step 1: Escribe los tests que fallan**

Añade al final de `packages/core/src/volume.test.ts` (no borres lo que ya hay):

```ts
import { VOLUME_TARGET_MAX, VOLUME_TARGET_MIN, isVolumeInBand } from './volume';

describe('banda de volumen (SPEC §8.1)', () => {
  it('describe la banda 10-20', () => {
    expect(VOLUME_TARGET_MIN).toBe(10);
    expect(VOLUME_TARGET_MAX).toBe(20);
  });

  it('deja fuera una cuenta por debajo de la banda', () => {
    expect(isVolumeInBand(9)).toBe(false);
  });

  it('incluye el límite inferior', () => {
    expect(isVolumeInBand(10)).toBe(true);
  });

  it('incluye el límite superior', () => {
    expect(isVolumeInBand(20)).toBe(true);
  });

  it('deja fuera una cuenta por encima de la banda', () => {
    expect(isVolumeInBand(21)).toBe(false);
  });
});
```

Ajusta el `import` de arriba al que ya tenga el fichero (una sola línea de import por módulo).

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `pnpm vitest run packages/core/src/volume.test.ts`
Expected: FAIL — `VOLUME_TARGET_MIN` no está exportado.

- [ ] **Step 3: Implementa en core**

Añade al final de `packages/core/src/volume.ts`:

```ts
/** Series efectivas por grupo muscular y semana que persigue el SPEC §8.1. */
export const VOLUME_TARGET_MIN = 10;
export const VOLUME_TARGET_MAX = 20;

/** SPEC §8.1: la cuenta semanal de un grupo muscular debe caer en la banda 10-20. */
export function isVolumeInBand(count: number): boolean {
  return count >= VOLUME_TARGET_MIN && count <= VOLUME_TARGET_MAX;
}
```

`packages/core/src/index.ts` ya hace `export * from './volume'`: no hay que tocarlo.

- [ ] **Step 4: Ejecuta el test**

Run: `pnpm vitest run packages/core/src/volume.test.ts`
Expected: PASS.

- [ ] **Step 5: Repunta los cinco usos del dashboard**

`apps/web/src/config.ts` se queda solo con la zona horaria:

```ts
/** Single source for the time zone every core call receives. */
export const TIME_ZONE = 'Europe/Madrid';
```

`apps/web/src/config.test.ts` pierde el test de la banda (se movió a core) y se queda con:

```ts
import { describe, expect, it } from 'vitest';
import { TIME_ZONE } from './config';

describe('config', () => {
  it('exposes a valid IANA time zone', () => {
    expect(() => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })).not.toThrow();
  });
});
```

Borra `apps/web/src/presenters/volume.ts` y `apps/web/src/presenters/volume.test.ts`.

En `apps/web/src/components/VolumeBar.tsx`, sustituye las tres primeras líneas por:

```tsx
import { VOLUME_TARGET_MAX, VOLUME_TARGET_MIN, isVolumeInBand } from '@gym-tracker/core';
import { ACCENT_DOWN } from '../presenters/format';
```

En `apps/web/src/presenters/overview.ts`, mueve `VOLUME_TARGET_MAX` al import de core y deja el de config con solo `TIME_ZONE`:

```ts
import {
  MUSCLE_GROUP_LABELS, VOLUME_TARGET_MAX, detectStagnation, effectiveSets, estimate1RM, isoWeekKey,
  session1RM, sessionTonnage, weeklyVolumeByMuscleGroup,
} from '@gym-tracker/core';
import { TIME_ZONE } from '../config';
```

- [ ] **Step 6: Ejecuta la suite entera y el typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. Si algo importa `presenters/volume`, el typecheck lo señala.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/volume.ts packages/core/src/volume.test.ts apps/web/src
git commit -m "refactor(core): move the 10-20 volume band out of the dashboard"
```

---

### Task 3: `listEffectiveSetsBetween` devuelve el grupo muscular

Cambio aditivo en una consulta que ya hace el JOIN con `exercises`. Con esto, las barras de la bienvenida y la gráfica de `/finish` salen de datos que ya están en memoria, y desaparece el fallo del ejercicio archivado (spec §5.1).

**Files:**
- Modify: `packages/db/src/repositories/sets.ts:120-158`
- Test: `packages/db/src/repositories/sets.test.ts`

**Interfaces:**
- Consumes: `MuscleGroup` de `@gym-tracker/core`.
- Produces: `EffectiveSetWithName` gana el campo `muscleGroup: MuscleGroup`. La firma de `listEffectiveSetsBetween(db, { userId, fromMs, toMs })` no cambia.

- [ ] **Step 1: Escribe el test que falla**

Añade a `packages/db/src/repositories/sets.test.ts` (respeta los helpers de creación de datos que ya use el fichero; si crea el usuario y el workout con funciones propias, reutilízalas):

```ts
it('trae el grupo muscular de cada serie efectiva', () => {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
  const exercise = getExerciseById(d, 1)!;
  insertSet(d, { workoutId: w.id, exerciseId: exercise.id, position: 1, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: false, createdAt: 1_000 });

  const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 2_000 });

  expect(rows).toHaveLength(1);
  expect(rows[0]?.muscleGroup).toBe(exercise.muscleGroup);
  // El resto del contrato no cambia: buildOverview sigue recibiendo lo mismo.
  expect(rows[0]?.exerciseName).toBe(exercise.name);
  expect(rows[0]?.weightKg).toBe(60);
});

it('incluye las series de un ejercicio archivado, con su grupo', () => {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
  insertSet(d, { workoutId: w.id, exerciseId: 1, position: 1, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: false, createdAt: 1_000 });
  d.prepare('UPDATE exercises SET archived = 1 WHERE id = 1').run();

  const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 2_000 });

  expect(rows).toHaveLength(1);
  expect(rows[0]?.muscleGroup).toBe(getExerciseById(d, 1)!.muscleGroup);
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `pnpm vitest run packages/db/src/repositories/sets.test.ts`
Expected: FAIL — `muscleGroup` es `undefined` y TypeScript no conoce la propiedad.

- [ ] **Step 3: Implementa**

En `packages/db/src/repositories/sets.ts`, añade el import de tipo arriba del todo:

```ts
import type { MuscleGroup } from '@gym-tracker/core';
```

Y sustituye el bloque de `EffectiveSetWithName` y `listEffectiveSetsBetween` por:

```ts
/**
 * Superconjunto de `OverviewSet` de `@gym-tracker/core`, para pasarlo sin mapear:
 * `buildOverview` ignora `muscleGroup` y el bot lo usa para agrupar por músculo.
 */
export interface EffectiveSetWithName {
  createdAt: number;
  weightKg: number;
  reps: number;
  exerciseName: string;
  muscleGroup: MuscleGroup;
}

/**
 * Series efectivas (`is_warmup = 0`) del usuario en `[fromMs, toMs]`, ambos
 * inclusive, con el nombre y el grupo muscular del ejercicio ya unidos. Se pide una
 * sola vez sobre los 60 días completos; el reparto entre ventanas lo hace
 * `buildOverview` y el agrupamiento por músculo, `weeklyGroupCounts`.
 *
 * El grupo sale del propio JOIN, no de un mapa de ejercicios activos: así las
 * series de un ejercicio archivado siguen contando y no hay forma de que falte
 * la clave de un ejercicio.
 */
export function listEffectiveSetsBetween(
  db: DatabaseSync,
  params: { userId: number; fromMs: number; toMs: number },
): EffectiveSetWithName[] {
  const rows = db
    .prepare(
      `SELECT s.created_at, s.weight_kg, s.reps, e.name AS exercise_name, e.muscle_group AS muscle_group
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
    muscle_group: MuscleGroup;
  }>;
  return rows.map((r) => ({
    createdAt: r.created_at,
    weightKg: r.weight_kg,
    reps: r.reps,
    exerciseName: r.exercise_name,
    muscleGroup: r.muscle_group,
  }));
}
```

- [ ] **Step 4: Ejecuta los tests**

Run: `pnpm vitest run packages/db/src/repositories/sets.test.ts && pnpm typecheck`
Expected: PASS los dos.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/sets.ts packages/db/src/repositories/sets.test.ts
git commit -m "feat(db): return the muscle group with each effective set"
```

---

### Task 4: Volumen semanal por grupo, sin consultas nuevas

**Files:**
- Create: `apps/server/src/services/weekly-volume.ts`
- Test: `apps/server/src/services/weekly-volume.test.ts`
- Modify: `apps/server/src/services/overview-service.ts`
- Modify: `apps/server/src/services/overview-service.test.ts`
- Modify: `apps/server/src/bot/welcome.ts:127-139` (llamada renombrada)

**Interfaces:**
- Consumes: `EffectiveSetWithName` (Tarea 3); `isoWeekKey`, `MUSCLE_GROUPS`, `MuscleGroup` de core.
- Produces:
  - `interface GroupVolume { group: MuscleGroup; count: number }`
  - `weeklyGroupCounts(sets: ReadonlyArray<{ createdAt: number; muscleGroup: MuscleGroup }>, options: { weekKey: string; timeZone: string }): GroupVolume[]` — orden descendente por cuenta, desempate por orden anatómico.
  - `interface UserSummary { overview: Overview; weeklyVolume: GroupVolume[] }`
  - `buildUserSummary(db: DatabaseSync, params: { userId: number; timezone: string; now: number }): UserSummary` — **sustituye a `buildUserOverview`**, con una sola consulta.

- [ ] **Step 1: Escribe los tests que fallan**

Crea `apps/server/src/services/weekly-volume.test.ts`:

```ts
import { isoWeekKey } from '@gym-tracker/core';
import { describe, expect, it } from 'vitest';
import { weeklyGroupCounts } from './weekly-volume';

const TZ = 'UTC';
// 2026-07-22 es miércoles; 2026-07-15, el miércoles anterior.
const WEDNESDAY = Date.UTC(2026, 6, 22, 10, 0, 0);
const WEEK_BEFORE = Date.UTC(2026, 6, 15, 10, 0, 0);
const WEEK = isoWeekKey(new Date(WEDNESDAY), TZ);

const set = (at: number, group: 'chest' | 'quads' | 'biceps') => ({ createdAt: at, muscleGroup: group } as const);

describe('weeklyGroupCounts', () => {
  it('cuenta las series de la semana pedida, agrupadas por músculo', () => {
    const counts = weeklyGroupCounts(
      [set(WEDNESDAY, 'chest'), set(WEDNESDAY, 'chest'), set(WEDNESDAY, 'quads')],
      { weekKey: WEEK, timeZone: TZ },
    );
    expect(counts).toEqual([
      { group: 'chest', count: 2 },
      { group: 'quads', count: 1 },
    ]);
  });

  it('descarta las series de otras semanas', () => {
    const counts = weeklyGroupCounts([set(WEEK_BEFORE, 'chest'), set(WEDNESDAY, 'quads')], {
      weekKey: WEEK,
      timeZone: TZ,
    });
    expect(counts).toEqual([{ group: 'quads', count: 1 }]);
  });

  it('ordena de más a menos series y desempata por orden anatómico', () => {
    const counts = weeklyGroupCounts(
      [set(WEDNESDAY, 'biceps'), set(WEDNESDAY, 'chest')],
      { weekKey: WEEK, timeZone: TZ },
    );
    // Empate a 1: chest va antes que biceps en MUSCLE_GROUPS.
    expect(counts.map((c) => c.group)).toEqual(['chest', 'biceps']);
  });

  it('devuelve una lista vacía sin series', () => {
    expect(weeklyGroupCounts([], { weekKey: WEEK, timeZone: TZ })).toEqual([]);
  });
});
```

Añade a `apps/server/src/services/overview-service.test.ts` (y renombra en ese fichero las llamadas a `buildUserOverview` por `buildUserSummary`, leyendo `.overview` donde antes se usaba el valor entero):

```ts
it('devuelve el volumen de la semana en curso junto al resumen', () => {
  const d = db(); // el helper que ya use el fichero
  const now = Date.UTC(2026, 6, 22, 10, 0, 0);
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: now });
  insertSet(d, { workoutId: w.id, exerciseId: 1, position: 1, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: false, createdAt: now });
  insertSet(d, { workoutId: w.id, exerciseId: 1, position: 2, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: true, createdAt: now + 1 });

  const summary = buildUserSummary(d, { userId: 1, timezone: 'UTC', now });

  // El calentamiento no cuenta: la consulta ya filtra is_warmup = 0.
  expect(summary.weeklyVolume).toEqual([{ group: getExerciseById(d, 1)!.muscleGroup, count: 1 }]);
  expect(summary.overview.effectiveSets.current).toBe(1);
});
```

- [ ] **Step 2: Ejecuta los tests para verlos fallar**

Run: `pnpm vitest run apps/server/src/services`
Expected: FAIL — no existe `weekly-volume.ts` ni `buildUserSummary`.

- [ ] **Step 3: Implementa `weeklyGroupCounts`**

Crea `apps/server/src/services/weekly-volume.ts`:

```ts
import { MUSCLE_GROUPS, type MuscleGroup, isoWeekKey } from '@gym-tracker/core';

export interface GroupVolume {
  group: MuscleGroup;
  count: number;
}

/**
 * Series efectivas por grupo muscular dentro de una semana ISO.
 *
 * Recibe únicamente series EFECTIVAS: el filtro de calentamiento lo hace la
 * consulta (`listEffectiveSetsBetween`), igual que en `buildOverview`.
 *
 * No usa `weeklyVolumeByMuscleGroup` de core a propósito: esa función resuelve el
 * grupo con un mapa `exerciseId → muscle_group` y lanza si falta una clave (el caso
 * del ejercicio archivado). Aquí el grupo viene en la propia fila, del JOIN.
 */
export function weeklyGroupCounts(
  sets: ReadonlyArray<{ createdAt: number; muscleGroup: MuscleGroup }>,
  options: { weekKey: string; timeZone: string },
): GroupVolume[] {
  const counts = new Map<MuscleGroup, number>();
  for (const set of sets) {
    if (isoWeekKey(new Date(set.createdAt), options.timeZone) !== options.weekKey) {
      continue;
    }
    counts.set(set.muscleGroup, (counts.get(set.muscleGroup) ?? 0) + 1);
  }
  // Desempate por el orden anatómico de MUSCLE_GROUPS: sin él, dos grupos con la
  // misma cuenta saldrían en el orden de llegada de las filas y la pantalla
  // bailaría entre renders.
  const anatomical = (group: MuscleGroup): number => MUSCLE_GROUPS.indexOf(group);
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || anatomical(a.group) - anatomical(b.group));
}
```

- [ ] **Step 4: Implementa `buildUserSummary`**

En `apps/server/src/services/overview-service.ts`, cambia los imports y la función (conserva íntegro el comentario de cabecera que ya tiene sobre las ventanas y el horario de verano, y añádele el párrafo del volumen):

```ts
import { type Overview, buildOverview, isoWeekKey, startOfLocalDay } from '@gym-tracker/core';
import { listEffectiveSetsBetween, listWorkoutStartsBetween } from '@gym-tracker/db';
import type { DatabaseSync } from 'node:sqlite';
import { type GroupVolume, weeklyGroupCounts } from './weekly-volume';

export interface UserSummary {
  overview: Overview;
  /** Series efectivas por músculo de la semana ISO en curso, de más a menos. */
  weeklyVolume: GroupVolume[];
}

export function buildUserSummary(
  db: DatabaseSync,
  params: { userId: number; timezone: string; now: number },
): UserSummary {
  const currentTo = params.now;
  const currentFrom =
    startOfLocalDay(new Date(params.now), params.timezone) - (WINDOW_DAYS - 1) * MS_PER_DAY;
  const previousFrom = currentFrom - WINDOW_DAYS * MS_PER_DAY;

  const range = { userId: params.userId, fromMs: previousFrom, toMs: currentTo };
  // UNA sola consulta para las dos cosas: la semana ISO en curso cae dentro de la
  // ventana de 60 días, así que el volumen semanal no necesita ir a la base otra vez.
  const sets = listEffectiveSetsBetween(db, range);

  return {
    overview: buildOverview({
      sets,
      workoutStarts: listWorkoutStartsBetween(db, range),
      currentFrom,
      currentTo,
      previousFrom,
    }),
    weeklyVolume: weeklyGroupCounts(sets, {
      weekKey: isoWeekKey(new Date(params.now), params.timezone),
      timeZone: params.timezone,
    }),
  };
}
```

- [ ] **Step 5: Repunta `welcome.ts`**

En `apps/server/src/bot/welcome.ts`, cambia el import y `welcomeModel` para usar el nombre nuevo. De momento solo se lee `.overview`; el bloque de barras entra en la Tarea 5.

```ts
import { buildUserSummary } from '../services/overview-service';
// ...
export function welcomeModel(db: DatabaseSync, ctx: CustomContext, timezone: string): WelcomeModel {
  const firstName = ctx.from?.first_name?.trim();
  const summary = buildUserSummary(db, { userId: ctx.user.id, timezone, now: Date.now() });
  return {
    firstName: firstName === undefined || firstName === '' ? null : firstName,
    overview: summary.overview,
  };
}
```

- [ ] **Step 6: Ejecuta la suite y el typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. El typecheck es quien encuentra cualquier `buildUserOverview` que quede vivo.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services apps/server/src/bot/welcome.ts
git commit -m "feat(server): compute weekly volume per muscle from the overview query"
```

---

### Task 5: Barras de texto en la bienvenida

Cero dependencias, cero latencia, sin salir del mensaje editable (spec §4.1).

**Files:**
- Create: `apps/server/src/charts/volume-bars.ts`
- Test: `apps/server/src/charts/volume-bars.test.ts`
- Modify: `apps/server/src/bot/welcome.ts`
- Modify: `apps/server/src/bot/welcome.test.ts`
- Modify: `apps/server/src/i18n/locales/es.ts`, `apps/server/src/i18n/locales/en.ts`, `apps/server/src/bot/texts.ts`

**Interfaces:**
- Consumes: `GroupVolume` (Tarea 4), `VOLUME_TARGET_MAX` (Tarea 2), `groupLabel` de `../i18n/exercise-name`.
- Produces:
  - `interface VolumeBarRow { label: string; count: number }`
  - `volumeBars(rows: readonly VolumeBarRow[]): string[]` — una cadena por fila, ya alineadas entre sí. `[]` si no hay filas.
  - `WelcomeModel` gana `weeklyVolume: GroupVolume[]`.

- [ ] **Step 1: Escribe los tests que fallan**

Crea `apps/server/src/charts/volume-bars.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { volumeBars } from './volume-bars';

describe('volumeBars', () => {
  it('pinta una celda por cada dos series, con el separador tras la quinta', () => {
    expect(volumeBars([{ label: 'Pecho', count: 14 }])).toEqual(['Pecho █████│██░░░ 14']);
  });

  it('redondea al alza la media celda', () => {
    // 7 series → 3.5 celdas → 4.
    expect(volumeBars([{ label: 'X', count: 7 }])[0]).toContain('████░│░░░░░');
  });

  it('llena la barra a partir de 20 y no se pasa', () => {
    expect(volumeBars([{ label: 'X', count: 22 }])[0]).toContain('█████│█████');
    expect(volumeBars([{ label: 'X', count: 20 }])[0]).toContain('█████│█████');
  });

  it('pinta una celda con una sola serie, para que la fila no parezca vacía', () => {
    expect(volumeBars([{ label: 'X', count: 1 }])[0]).toContain('█░░░░│░░░░░');
  });

  it('calcula el ancho de etiqueta sobre las filas presentes', () => {
    const [long, short] = volumeBars([
      { label: 'Deltoides posterior', count: 4 },
      { label: 'Pecho', count: 12 },
    ]);
    expect(long?.startsWith('Deltoides posterior ')).toBe(true);
    expect(short?.startsWith('Pecho ')).toBe(true);
    // La barra arranca en la misma columna en las dos filas, y las dos miden igual.
    expect(short?.indexOf('█')).toBe(long?.indexOf('█'));
    expect(long?.length).toBe(short?.length);
  });

  it('alinea las cifras a la derecha', () => {
    const rows = volumeBars([{ label: 'A', count: 6 }, { label: 'B', count: 14 }]);
    expect(rows[0]?.endsWith(' 6')).toBe(true);
    expect(rows[1]?.endsWith('14')).toBe(true);
    expect(rows[0]?.length).toBe(rows[1]?.length);
  });

  it('no pinta nada sin filas', () => {
    expect(volumeBars([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `pnpm vitest run apps/server/src/charts/volume-bars.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementa `volume-bars.ts`**

```ts
import { VOLUME_TARGET_MAX } from '@gym-tracker/core';

export interface VolumeBarRow {
  label: string;
  count: number;
}

// Diez celdas: la barra llena equivale al techo de la banda del SPEC §8.1, así que
// cada celda son dos series. El '│' va tras la quinta y marca el mínimo de 10.
const CELLS = 10;
const SETS_PER_CELL = VOLUME_TARGET_MAX / CELLS;
const HALF = CELLS / 2;

/**
 * Barras de bloque para el `<pre>` de la bienvenida.
 *
 * Los tres glifos (`█░│`) y las etiquetas latinas son unidades UTF-16 simples, así
 * que `padEnd`/`padStart` cuadran igual que en la tabla de métricas de welcome.ts.
 *
 * Contrapartida registrada: la escala no dice nada por encima de 20 (la barra ya
 * está llena) y la cifra exacta, que va al lado, manda sobre la barra.
 */
export function volumeBars(rows: readonly VolumeBarRow[]): string[] {
  if (rows.length === 0) {
    return [];
  }
  // Ancho calculado, no constante: "Deltoide posterior" no cabe en los 14
  // caracteres que usa la tabla de métricas.
  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  const countWidth = Math.max(...rows.map((row) => String(row.count).length));

  return rows.map((row) => {
    const filled = Math.min(CELLS, Math.round(row.count / SETS_PER_CELL));
    const cells = '█'.repeat(filled) + '░'.repeat(CELLS - filled);
    const bar = `${cells.slice(0, HALF)}│${cells.slice(HALF)}`;
    return `${row.label.padEnd(labelWidth)} ${bar} ${String(row.count).padStart(countWidth)}`;
  });
}
```

- [ ] **Step 4: Ejecuta el test**

Run: `pnpm vitest run apps/server/src/charts/volume-bars.test.ts`
Expected: PASS.

- [ ] **Step 5: Añade la clave de i18n**

En `apps/server/src/i18n/locales/es.ts`, dentro de `ui`, junto a las claves de bienvenida:

```ts
    welcomeVolumeTitle: 'Series por músculo · esta semana',
```

En `en.ts`, en la misma posición:

```ts
    welcomeVolumeTitle: 'Sets per muscle · this week',
```

En `apps/server/src/bot/texts.ts`, junto a los demás getters de bienvenida:

```ts
  get welcomeVolumeTitle(): string {
    return t('welcomeVolumeTitle');
  },
```

- [ ] **Step 6: Escribe los tests de la bienvenida**

En `apps/server/src/bot/welcome.test.ts`: primero, **añade `weeklyVolume: []` a todas las llamadas existentes** a `renderWelcome({ firstName, overview })` (el modelo gana un campo obligatorio). Después añade:

```ts
describe('bloque de volumen semanal', () => {
  it('pinta un segundo <pre> con una fila por grupo entrenado', () => {
    const { text } = renderWelcome({
      firstName: 'George',
      overview: FULL,
      weeklyVolume: [
        { group: 'chest', count: 14 },
        { group: 'biceps', count: 6 },
      ],
    });
    expect(text.split('<pre>')).toHaveLength(3); // la tabla de métricas y las barras
    expect(text).toContain('Series por músculo');
    expect(text).toContain('Pecho');
    expect(text).toContain('█████│██░░░ 14');
    expect(text).toContain('Bíceps');
  });

  it('no pinta el bloque cuando la semana no tiene series', () => {
    const { text } = renderWelcome({ firstName: 'George', overview: FULL, weeklyVolume: [] });
    expect(text.split('<pre>')).toHaveLength(2); // solo la tabla de métricas
    expect(text).not.toContain('Series por músculo');
  });
});
```

- [ ] **Step 7: Ejecútalos para verlos fallar**

Run: `pnpm vitest run apps/server/src/bot/welcome.test.ts`
Expected: FAIL — `weeklyVolume` no existe en `WelcomeModel`.

- [ ] **Step 8: Integra en `welcome.ts`**

Añade los imports:

```ts
import { volumeBars } from '../charts/volume-bars';
import { groupLabel, localizeGroups } from '../i18n/exercise-name';
import type { GroupVolume } from '../services/weekly-volume';
```

Extiende el modelo:

```ts
export interface WelcomeModel {
  firstName: string | null;
  overview: Overview;
  weeklyVolume: GroupVolume[];
}
```

Añade el bloque justo debajo de `metricsBlock`:

```ts
/**
 * Barras de texto de la semana, en su propio <pre>. Las etiquetas salen del
 * catálogo de grupos musculares, no del usuario: no hay nada que escapar.
 */
function volumeBlock(rows: readonly GroupVolume[]): string | null {
  if (rows.length === 0) {
    return null;
  }
  const lines = volumeBars(rows.map((row) => ({ label: groupLabel(row.group), count: row.count })));
  return `<pre>${[T.welcomeVolumeTitle, ...lines].join('\n')}</pre>`;
}
```

Y en `renderWelcome`, monta el texto con el bloque opcional:

```ts
export function renderWelcome(model: WelcomeModel): Rendered {
  const volume = volumeBlock(model.weeklyVolume);
  const text = [
    escapeHtml(T.welcomeGreeting(model.firstName)),
    '',
    T.welcomeIntro,
    '',
    T.welcomeSettingsHint,
    '',
    metricsBlock(model.overview),
    ...(volume === null ? [] : ['', volume]),
  ].join('\n');
  // ... el teclado no cambia en esta tarea
```

Y en `welcomeModel`, devuelve el campo nuevo:

```ts
  return {
    firstName: firstName === undefined || firstName === '' ? null : firstName,
    overview: summary.overview,
    weeklyVolume: summary.weeklyVolume,
  };
```

- [ ] **Step 9: Ejecuta la suite y el typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/charts apps/server/src/bot/welcome.ts apps/server/src/bot/welcome.test.ts apps/server/src/i18n apps/server/src/bot/texts.ts
git commit -m "feat(server): show weekly volume as text bars in the welcome screen"
```

---

### Task 6: El renderizador aislado

Único fichero que importa skia-canvas y chart.js. Tres reglas del spec §3.2: carga diferida, `destroy()` en `finally`, y nunca lanzar.

**Files:**
- Create: `apps/server/src/charts/theme.ts`
- Create: `apps/server/src/charts/render.ts`
- Create: `apps/server/src/charts/render.test.ts`
- Delete: `apps/server/src/charts/spike.test.ts` (lo sustituye `render.test.ts`)

**Interfaces:**
- Consumes: la receta validada en la Tarea 1.
- Produces:
  - `theme.ts`: `CHART_WIDTH: 1000`, `CHART_HEIGHT: 560`, `FONT_FAMILY`, `LABEL_FONT_SIZE: 18`, `TICK_FONT_SIZE: 16`, `LINE_WIDTH: 2`, `BAR_THICKNESS`, y el objeto `COLORS` con las ocho claves del spec §3.1.
  - `render.ts`: `renderChart(config: ChartConfiguration): Promise<Buffer | null>`.

- [ ] **Step 1: Escribe el test que falla**

Crea `apps/server/src/charts/render.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { CHART_HEIGHT, CHART_WIDTH } from './theme';
import { renderChart } from './render';

// Cabecera PNG: firma de 8 bytes y chunk IHDR con ancho y alto en big-endian.
// Sin snapshots de píxeles: las fuentes del sistema difieren entre Windows, Linux
// y CI, y un test así sería inestable por diseño.
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect([...buffer.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('renderChart', () => {
  it('devuelve un PNG del tamaño del lienzo', async () => {
    const buffer = await renderChart({
      type: 'bar',
      data: { labels: ['A', 'B'], datasets: [{ data: [1, 2] }] },
      options: { responsive: false, animation: false },
    });

    expect(buffer).not.toBeNull();
    expect(pngSize(buffer as Buffer)).toEqual({ width: CHART_WIDTH, height: CHART_HEIGHT });
  });

  it('devuelve null y registra el fallo en vez de lanzar', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    // 'radar' no está registrado: Chart.js lanza al construir la instancia.
    const buffer = await renderChart({ type: 'radar', data: { labels: [], datasets: [] } });

    expect(buffer).toBeNull();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `pnpm vitest run apps/server/src/charts/render.test.ts`
Expected: FAIL — no existen `theme.ts` ni `render.ts`.

- [ ] **Step 3: Implementa `theme.ts`**

```ts
/**
 * Paleta Nocturne con colores LITERALES: las `var(--color-*)` del dashboard no
 * existen fuera del DOM. Los valores salen de `apps/web/src/styles/nocturne.css`
 * y de `apps/web/src/presenters/format.ts`, para que las dos superficies se vean
 * iguales.
 */
export const COLORS = {
  bg: '#161826',
  text: '#e9e9ed',
  divider: 'rgba(233,233,237,0.16)',
  track: '#292b31',
  accent: '#9184d9',
  barInBand: '#b5abfc',
  barOutOfBand: '#d4a15a',
  bandFill: 'rgba(145,132,217,0.13)',
} as const;

// Telegram recomprime las fotos; con menos ancho las etiquetas se ven borrosas.
export const CHART_WIDTH = 1000;
export const CHART_HEIGHT = 560;

/**
 * Mínimos tipográficos. Más píxeles de lienzo no compensan una recompresión con
 * pérdida: lo que la sobrevive es tipografía grande y trazo grueso. Viven aquí,
 * con nombre, y no dispersos por las configuraciones.
 */
export const LABEL_FONT_SIZE = 18;
export const TICK_FONT_SIZE = 16;
export const LINE_WIDTH = 2;
export const POINT_RADIUS = 6;
export const BAR_THICKNESS = 26;

// Las del sistema: no se versiona ningún .ttf. Contrapartida registrada: la imagen
// no es idéntica entre plataformas y la imagen Docker de la Fase 4 tendrá que
// instalar un paquete de fuentes o las etiquetas saldrán vacías.
export const FONT_FAMILY = 'sans-serif';
```

- [ ] **Step 4: Implementa `render.ts`**

Copia la receta que validaste en la Tarea 1: si allí hizo falta `platform: BasicPlatform` o un `devicePixelRatio` explícito, añádelo dentro de `withDefaults`; el resto del fichero no cambia.

```ts
import type { ChartConfiguration } from 'chart.js';
import { CHART_HEIGHT, CHART_WIDTH, COLORS, FONT_FAMILY, LABEL_FONT_SIZE } from './theme';

type ChartModule = typeof import('chart.js');
type CanvasModule = typeof import('skia-canvas');

let loading: Promise<{ chart: ChartModule; canvas: CanvasModule }> | null = null;

/**
 * Carga diferida y memoizada. Con un `import` estático, el binario nativo de
 * skia-canvas se cargaría AL ARRANCAR EL PROCESO en toda instalación, incluidas
 * las que nunca ven una gráfica: arranque más lento y decenas de MB de RSS
 * residentes en un servicio que vive meses. Así, el coste se paga en el primer
 * dibujo y solo si llega.
 */
function load(): Promise<{ chart: ChartModule; canvas: CanvasModule }> {
  loading ??= (async () => {
    const [chart, canvas] = await Promise.all([import('chart.js'), import('skia-canvas')]);
    // Registro explícito, no `chart.js/auto`: así no se carga todo el paquete.
    chart.Chart.register(
      chart.BarController,
      chart.BarElement,
      chart.LineController,
      chart.LineElement,
      chart.PointElement,
      chart.CategoryScale,
      chart.LinearScale,
      chart.Filler,
    );
    chart.Chart.defaults.font.family = FONT_FAMILY;
    chart.Chart.defaults.font.size = LABEL_FONT_SIZE;
    chart.Chart.defaults.color = COLORS.text;
    return { chart, canvas };
  })();
  return loading;
}

function withDefaults(config: ChartConfiguration): ChartConfiguration {
  // `responsive: false` y `animation: false`: sin ellos Chart.js no funciona headless.
  return { ...config, options: { responsive: false, animation: false, ...config.options } };
}

/**
 * Configuración → PNG. **No lanza nunca**: registra el fallo en stdout y devuelve
 * `null`, y quien llama lo trata como «no hay foto» y sigue con su texto. Este
 * diseño admite dos formas realistas de fallo (el `.node` que no carga en Windows,
 * el paquete de fuentes ausente en Docker), así que la degradación no es defensa
 * preventiva: es el camino esperado en esos entornos.
 */
export async function renderChart(config: ChartConfiguration): Promise<Buffer | null> {
  try {
    const { chart, canvas } = await load();
    const surface = new canvas.Canvas(CHART_WIDTH, CHART_HEIGHT);
    const context = surface.getContext('2d');
    // El lienzo de Chart.js es transparente: el fondo lo pintamos nosotros.
    context.fillStyle = COLORS.bg;
    context.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

    // `as unknown as`: el contexto de skia-canvas implementa la superficie que
    // Chart.js usa, pero no declara el tipo del DOM. Es el puente entre las dos
    // librerías y vive solo aquí.
    const instance = new chart.Chart(
      context as unknown as CanvasRenderingContext2D,
      withDefaults(config),
    );
    try {
      // `await` aunque skia-canvas devolviera el buffer de forma síncrona.
      return await surface.toBuffer('png');
    } finally {
      // Sin esto, cada render deja colgados el config, los datos y el canvas en el
      // registro global de instancias de Chart.js: una fuga lenta en un proceso
      // de larga vida.
      instance.destroy();
    }
  } catch (error) {
    console.error('[charts] render failed:', error);
    return null;
  }
}
```

- [ ] **Step 5: Ejecuta el test**

Run: `pnpm vitest run apps/server/src/charts/render.test.ts`
Expected: PASS los dos casos.

- [ ] **Step 6: Borra el spike y ejecuta la suite**

```bash
git rm apps/server/src/charts/spike.test.ts
```

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/charts
git commit -m "feat(server): rasterize chart configurations with lazy-loaded skia-canvas"
```

---

### Task 7: Configuración de la gráfica de volumen semanal

Función pura: datos → configuración de Chart.js. Se testea entera sin abrir un canvas.

**Files:**
- Create: `apps/server/src/charts/weekly-volume.ts`
- Test: `apps/server/src/charts/weekly-volume.test.ts`

**Interfaces:**
- Consumes: `VOLUME_TARGET_MIN`, `VOLUME_TARGET_MAX`, `isVolumeInBand` (Tarea 2); `COLORS` y los mínimos tipográficos (Tarea 6).
- Produces: `weeklyVolumeChart(rows: readonly VolumeBarRow[]): ChartConfiguration<'bar'>`, reutilizando el tipo `VolumeBarRow` de `./volume-bars` (`{ label: string; count: number }`).

- [ ] **Step 1: Escribe los tests que fallan**

Crea `apps/server/src/charts/weekly-volume.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COLORS } from './theme';
import { weeklyVolumeChart } from './weekly-volume';

const rows = [
  { label: 'Cuádriceps', count: 22 },
  { label: 'Pecho', count: 14 },
  { label: 'Bíceps', count: 6 },
];

describe('weeklyVolumeChart', () => {
  it('conserva el orden de las filas que recibe', () => {
    const config = weeklyVolumeChart(rows);
    expect(config.data.labels).toEqual(['Cuádriceps', 'Pecho', 'Bíceps']);
  });

  it('pinta barras horizontales con las cuentas', () => {
    const config = weeklyVolumeChart(rows);
    expect(config.options?.indexAxis).toBe('y');
    expect(config.data.datasets[1]?.data).toEqual([22, 14, 6]);
  });

  it('colorea cada barra según la banda 10-20', () => {
    const config = weeklyVolumeChart(rows);
    expect(config.data.datasets[1]?.backgroundColor).toEqual([
      COLORS.barOutOfBand, // 22, por encima
      COLORS.barInBand, // 14, dentro
      COLORS.barOutOfBand, // 6, por debajo
    ]);
  });

  it('pinta la banda de referencia detrás de cada fila', () => {
    const config = weeklyVolumeChart(rows);
    expect(config.data.datasets[0]?.data).toEqual([[10, 20], [10, 20], [10, 20]]);
    expect(config.data.datasets[0]?.backgroundColor).toBe(COLORS.bandFill);
  });

  it('deja la banda dentro del lienzo en una semana floja', () => {
    // Sin el mínimo de VOLUME_TARGET_MAX + 4, un máximo de 3 dejaría la banda fuera.
    expect(weeklyVolumeChart([{ label: 'Pecho', count: 3 }]).options?.scales?.x?.max).toBe(24);
  });

  it('crece con la semana cuando alguna cuenta supera la banda', () => {
    expect(weeklyVolumeChart([{ label: 'Pecho', count: 31 }]).options?.scales?.x?.max).toBe(31);
  });

  it('produce una configuración válida sin filas', () => {
    const config = weeklyVolumeChart([]);
    expect(config.data.labels).toEqual([]);
    expect(config.data.datasets[1]?.data).toEqual([]);
    expect(config.options?.scales?.x?.max).toBe(24);
  });
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `pnpm vitest run apps/server/src/charts/weekly-volume.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementa**

```ts
import { VOLUME_TARGET_MAX, VOLUME_TARGET_MIN, isVolumeInBand } from '@gym-tracker/core';
import type { ChartConfiguration } from 'chart.js';
import { BAR_THICKNESS, COLORS, LABEL_FONT_SIZE, TICK_FONT_SIZE } from './theme';
import type { VolumeBarRow } from './volume-bars';

// Margen sobre el techo de la banda, igual que el dashboard
// (apps/web/src/presenters/overview.ts): sin él, una semana floja deja la banda
// 10-20 fuera del lienzo y la referencia desaparece justo cuando más importa.
const AXIS_HEADROOM = 4;

/**
 * Barras horizontales de series efectivas por grupo muscular, con la banda 10-20
 * de fondo (SPEC §8.1). Las filas llegan ya ordenadas y filtradas por
 * `weeklyGroupCounts`; esta función no reordena ni descarta nada.
 *
 * Función pura: no toca canvas ni Telegram. Quien la pinta es `render.ts`.
 */
export function weeklyVolumeChart(rows: readonly VolumeBarRow[]): ChartConfiguration<'bar'> {
  const counts = rows.map((row) => row.count);
  // Barra coloreada según la banda, con el mismo criterio que VolumeBar.tsx: con un
  // acento único, las dos superficies contarían historias distintas del mismo dato.
  const colors = counts.map((count) => (isVolumeInBand(count) ? COLORS.barInBand : COLORS.barOutOfBand));

  return {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          // Barras flotantes [min, max]: la banda de referencia, sin plugins.
          label: 'band',
          data: rows.map(() => [VOLUME_TARGET_MIN, VOLUME_TARGET_MAX] as [number, number]),
          backgroundColor: COLORS.bandFill,
          // `grouped: false` en los dos: si no, las barras se repartirían la fila
          // en vez de superponerse.
          grouped: false,
          barPercentage: 1,
          categoryPercentage: 1,
        },
        {
          label: 'sets',
          data: [...counts],
          backgroundColor: colors,
          grouped: false,
          barThickness: BAR_THICKNESS,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          max: Math.max(VOLUME_TARGET_MAX + AXIS_HEADROOM, ...counts),
          ticks: { color: COLORS.text, font: { size: TICK_FONT_SIZE }, precision: 0 },
          grid: { color: COLORS.divider },
          border: { color: COLORS.divider },
        },
        y: {
          ticks: { color: COLORS.text, font: { size: LABEL_FONT_SIZE } },
          grid: { display: false },
          border: { color: COLORS.divider },
        },
      },
    },
  };
}
```

- [ ] **Step 4: Ejecuta el test**

Run: `pnpm vitest run apps/server/src/charts/weekly-volume.test.ts`
Expected: PASS.

- [ ] **Step 5: Comprueba que se dibuja de verdad**

Añade a `apps/server/src/charts/render.test.ts`:

```ts
it('dibuja la gráfica de volumen semanal', async () => {
  const buffer = await renderChart(weeklyVolumeChart([{ label: 'Pecho', count: 14 }]));
  expect(buffer).not.toBeNull();
  expect(pngSize(buffer as Buffer)).toEqual({ width: CHART_WIDTH, height: CHART_HEIGHT });
});
```

Con su import: `import { weeklyVolumeChart } from './weekly-volume';`

Run: `pnpm vitest run apps/server/src/charts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/charts
git commit -m "feat(server): build the weekly volume chart configuration"
```

---

### Task 8: `/finish` cierra con la gráfica de la semana

El sitio natural para la foto: el usuario acaba de sumar series, está sentado, y la sesión ya está cerrada, así que nada se va a repintar después.

**Files:**
- Create: `apps/server/src/bot/weekly-chart.ts`
- Create: `apps/server/src/bot/weekly-chart.test.ts`
- Modify: `apps/server/src/services/weekly-volume.ts` (añade `isoWeekRange`)
- Modify: `apps/server/src/services/weekly-volume.test.ts`
- Modify: `apps/server/src/bot/capture.ts:196-220, 471-481`
- Modify: `apps/server/src/bot/test-harness.ts:48-61`
- Modify: `apps/server/src/i18n/locales/{es,en}.ts`, `apps/server/src/bot/texts.ts`

**Interfaces:**
- Consumes: `buildUserSummary` (Tarea 4), `weeklyVolumeChart` (Tarea 7), `renderChart` (Tarea 6), `groupLabel`.
- Produces:
  - `isoWeekRange(now: number, timeZone: string): { fromMs: number; toMs: number }` — epoch de las 00:00 locales del lunes y del domingo de la semana ISO de `now`.
  - `sendWeeklyChart(ctx: CustomContext, db: DatabaseSync, timezone: string): Promise<void>` — envía la foto como **mensaje nuevo**, o no hace nada si la semana está vacía o el render falla. La Tarea 9 la reutiliza.

- [ ] **Step 1: Escribe el test de `isoWeekRange`**

Añade a `apps/server/src/services/weekly-volume.test.ts`:

```ts
import { isoWeekRange } from './weekly-volume';

describe('isoWeekRange', () => {
  const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date(ms));

  it('devuelve el lunes y el domingo de la semana de un miércoles', () => {
    const range = isoWeekRange(Date.UTC(2026, 6, 22, 10, 0, 0), 'UTC');
    expect(day(range.fromMs)).toBe('2026-07-20');
    expect(day(range.toMs)).toBe('2026-07-26');
  });

  it('trata el domingo como último día de su semana, no como el primero', () => {
    const range = isoWeekRange(Date.UTC(2026, 6, 26, 23, 0, 0), 'UTC');
    expect(day(range.fromMs)).toBe('2026-07-20');
    expect(day(range.toMs)).toBe('2026-07-26');
  });

  it('usa el día local, no el UTC', () => {
    // 2026-07-20T02:00Z es todavía domingo 19 en Nueva York: semana anterior.
    const range = isoWeekRange(Date.UTC(2026, 6, 20, 2, 0, 0), 'America/New_York');
    expect(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(range.fromMs)),
    ).toBe('2026-07-13');
  });
});
```

- [ ] **Step 2: Ejecútalo para verlo fallar**

Run: `pnpm vitest run apps/server/src/services/weekly-volume.test.ts`
Expected: FAIL — `isoWeekRange` no existe.

- [ ] **Step 3: Implementa `isoWeekRange`**

Añade a `apps/server/src/services/weekly-volume.ts` (con `startOfLocalDay` en el import de core):

```ts
const MS_PER_DAY = 86_400_000;

// Día de la semana EN LA ZONA del usuario, 0 = lunes. Se lee la fecha local y se
// reconstruye como UTC para preguntar por el día: `new Date(ms).getUTCDay()` sobre
// el instante crudo respondería por la fecha UTC, que puede ser otra.
function localWeekday(instant: number, timeZone: string): number {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(instant))
    .split('-')
    .map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Could not extract local date for timezone ${timeZone}`);
  }
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * Lunes y domingo (00:00 locales) de la semana ISO que contiene `now`. Solo se usa
 * para escribir el rango en el pie de la foto; el agrupamiento de series lo hace
 * `isoWeekKey`, no este rango.
 *
 * Cada extremo pasa por `startOfLocalDay` otra vez porque restar días de 24 h a una
 * medianoche local no cae en otra medianoche si hay cambio de horario por medio.
 */
export function isoWeekRange(now: number, timeZone: string): { fromMs: number; toMs: number } {
  const today = startOfLocalDay(new Date(now), timeZone);
  const monday = startOfLocalDay(new Date(today - localWeekday(now, timeZone) * MS_PER_DAY), timeZone);
  return { fromMs: monday, toMs: startOfLocalDay(new Date(monday + 6 * MS_PER_DAY), timeZone) };
}
```

Run: `pnpm vitest run apps/server/src/services/weekly-volume.test.ts` → PASS.

- [ ] **Step 4: Añade las claves de i18n**

`es.ts`, junto a las claves de `/finish`:

```ts
    chartWeeklyCaption: '📊 Semana {{from}} – {{to}} · {{sets}}',
```

`en.ts`:

```ts
    chartWeeklyCaption: '📊 Week {{from}} – {{to}} · {{sets}}',
```

`texts.ts`:

```ts
  chartWeeklyCaption(from: string, to: string, sets: number): string {
    return t('chartWeeklyCaption', { from, to, sets: t('setsCount', { count: sets }) });
  },
```

- [ ] **Step 5: Amplía el harness para observar `sendPhoto`**

En `apps/server/src/bot/test-harness.ts`, dentro del transformer, sustituye el bloque del resultado por:

```ts
    let result: unknown = true;
    // sendPhoto necesita la misma respuesta con forma de mensaje que sendMessage:
    // sin ella, grammY devuelve `true` y cualquier `.message_id` posterior revienta.
    if (method === 'sendMessage' || method === 'sendPhoto') {
      seq += 1;
      result = { message_id: seq, date: 0, chat: { id: payload.chat_id, type: 'private' } };
    }
```

Y añade al final del fichero un ayudante:

```ts
/** Llamadas a un método concreto (sendPhoto, editMessageReplyMarkup…). */
export function outgoingCalls(outgoing: readonly OutgoingCall[], method: string): OutgoingCall[] {
  return outgoing.filter((c) => c.method === method);
}
```

- [ ] **Step 6: Escribe los tests del envío**

Crea `apps/server/src/bot/weekly-chart.test.ts`:

```ts
import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  insertSet,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrent } from '../i18n/current';
import { initI18n } from '../i18n/index';
import { BOT_INFO, callbackUpdate, commandUpdate, makeHarness, outgoingCalls, outgoingTexts, textUpdate } from './test-harness';

// El renderizador real abre un canvas y tarda; aquí solo importa QUÉ se envía.
// El PNG de verdad lo cubre charts/render.test.ts.
const renderChart = vi.hoisted(() => vi.fn());
vi.mock('../charts/render', () => ({ renderChart }));

beforeAll(() => {
  initI18n();
  setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
});

beforeEach(() => {
  renderChart.mockReset();
  renderChart.mockResolvedValue(Buffer.from('fake-png'));
});

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };
const MSG = 900;

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  return d;
}

describe('/finish', () => {
  it('envía el resumen y, después, la gráfica de la semana', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await bot.handleUpdate(textUpdate(4, '60x8'));
    outgoing.length = 0;

    await bot.handleUpdate(commandUpdate(5, 'finish'));

    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('Entrenamiento terminado');
    const photos = outgoingCalls(outgoing, 'sendPhoto');
    expect(photos).toHaveLength(1);
    expect(String(photos[0]?.payload.caption ?? '')).toContain('Semana');
    // La foto va DESPUÉS del resumen: el chat queda con el texto y su gráfica.
    const methods = outgoing.map((c) => c.method);
    expect(methods.indexOf('sendPhoto')).toBeGreaterThan(methods.indexOf('editMessageText'));
  });

  it('manda el resumen igualmente cuando el render falla', async () => {
    renderChart.mockResolvedValue(null);
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await bot.handleUpdate(textUpdate(4, '60x8'));
    outgoing.length = 0;

    await bot.handleUpdate(commandUpdate(5, 'finish'));

    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('Entrenamiento terminado');
    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(0);
  });

  it('no envía foto al cerrar un entrenamiento sin series', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(commandUpdate(3, 'finish'));

    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(0);
    expect(renderChart).not.toHaveBeenCalled(); // ni siquiera se intenta
  });
});
```

- [ ] **Step 7: Ejecútalos para verlos fallar**

Run: `pnpm vitest run apps/server/src/bot/weekly-chart.test.ts`
Expected: FAIL — no existe `../charts/render` como dependencia de un módulo `weekly-chart`, y `/finish` no envía fotos.

- [ ] **Step 8: Implementa `weekly-chart.ts`**

```ts
import { InputFile } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { weeklyVolumeChart } from '../charts/weekly-volume';
import { renderChart } from '../charts/render';
import { currentLocale } from '../i18n/current';
import { groupLabel } from '../i18n/exercise-name';
import { buildUserSummary } from '../services/overview-service';
import { isoWeekRange } from '../services/weekly-volume';
import type { CustomContext } from './context';
import { T } from './texts';

function shortDate(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat(currentLocale(), { timeZone, day: '2-digit', month: '2-digit' }).format(
    new Date(epochMs),
  );
}

/**
 * Gráfica del volumen de la semana en curso, como MENSAJE NUEVO.
 *
 * Silenciosa por diseño en los dos caminos de «no hay foto»: semana sin series
 * efectivas (se da al cerrar un entrenamiento en el que no se registró nada) y
 * render fallido (`renderChart` devuelve `null`). Quien llama sigue con su texto.
 */
export async function sendWeeklyChart(
  ctx: CustomContext,
  db: DatabaseSync,
  timezone: string,
): Promise<void> {
  const now = Date.now();
  const { weeklyVolume } = buildUserSummary(db, { userId: ctx.user.id, timezone, now });
  if (weeklyVolume.length === 0) {
    return;
  }

  const buffer = await renderChart(
    weeklyVolumeChart(weeklyVolume.map((row) => ({ label: groupLabel(row.group), count: row.count }))),
  );
  if (buffer === null) {
    return;
  }

  const { fromMs, toMs } = isoWeekRange(now, timezone);
  const total = weeklyVolume.reduce((sum, row) => sum + row.count, 0);
  await ctx.replyWithPhoto(new InputFile(buffer, 'weekly-volume.png'), {
    caption: T.chartWeeklyCaption(shortDate(fromMs, timezone), shortDate(toMs, timezone), total),
  });
}
```

- [ ] **Step 9: Reordena `handleFinish`**

En `apps/server/src/bot/capture.ts`, sustituye `handleFinish` por estas dos funciones. El comportamiento del resumen no cambia: lo que cambia es que los `return` tempranos ya no se saltan el envío de la foto.

```ts
/** El resumen sobre el mensaje activo, con el mismo comportamiento de siempre. */
async function showFinishSummary(ctx: CustomContext, session: BotSessionRow, text: string): Promise<void> {
  if (session.messageId !== null) {
    try {
      await ctx.api.editMessageText(session.chatId, session.messageId, text, { reply_markup: new InlineKeyboard() });
      return;
    } catch (error) {
      if (isNotModified(error)) {
        return;
      }
      // El mensaje activo ya no es editable: cae al sendMessage de abajo.
    }
  }
  await ctx.api.sendMessage(session.chatId, text);
}

async function handleFinish(
  ctx: CustomContext,
  db: DatabaseSync,
  restTimers: RestTimers,
  timezone: string,
): Promise<void> {
  const userId = ctx.user.id;
  const session = getSession(db, userId);
  if (!session) {
    await ctx.reply(T.noActiveSessionToast);
    return;
  }
  restTimers.cancel(userId);
  if (session.ephemeralMessageId !== null) {
    await ctx.api.deleteMessage(session.chatId, session.ephemeralMessageId).catch(() => {});
  }
  const summary = finishWorkout(db, { session, now: Date.now() });
  await showFinishSummary(ctx, session, renderFinishSummary(summary));
  // Después del resumen y con la sesión ya cerrada: nada se va a repintar, así que
  // la foto no rompe ninguna pantalla editable.
  await sendWeeklyChart(ctx, db, timezone);
}
```

Añade el import `import { sendWeeklyChart } from './weekly-chart';` y pasa la zona horaria en el registro:

```ts
  bot.command('finish', (ctx) => handleFinish(ctx, db, restTimers, config.timezone));
```

- [ ] **Step 10: Ejecuta la suite y el typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. `flows.test.ts` tiene un test de `/finish` que sigue mirando solo el texto: no debería moverse.

- [ ] **Step 11: Commit**

```bash
git add apps/server/src/bot apps/server/src/services apps/server/src/i18n
git commit -m "feat(server): send the weekly volume chart when a workout finishes"
```

---

### Task 9: Botón `📊 Semana` en la bienvenida

**Files:**
- Modify: `apps/server/src/bot/callback-data.ts:35-39`
- Modify: `apps/server/src/bot/welcome.ts` (teclado y handler)
- Modify: `apps/server/src/bot/welcome.test.ts`
- Modify: `apps/server/src/i18n/locales/{es,en}.ts`, `apps/server/src/bot/texts.ts`

**Interfaces:**
- Consumes: `sendWeeklyChart` (Tarea 8).
- Produces: `CB.wcChart = 'wc:g'`.

- [ ] **Step 1: Escribe los tests que fallan**

En `apps/server/src/bot/welcome.test.ts`, actualiza la lista esperada de botones y añade el test del envío:

```ts
// En el test 'greets by name and shows the four buttons', renómbralo a
// '…and shows the five buttons' y espera:
expect(datas({ text, keyboard })).toEqual(['wc:s', 'wc:r', 'wc:l', 'wc:h', 'wc:g']);
```

Y un bloque nuevo al final del fichero:

```ts
describe('botón 📊 Semana', () => {
  it('envía la gráfica como mensaje nuevo y conserva el botón', async () => {
    const d = openDatabase(':memory:');
    runMigrations(d, MIGRATIONS_DIR);
    createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: Date.now() });
    insertSet(d, { workoutId: w.id, exerciseId: 1, position: 1, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: false, createdAt: Date.now() });
    const { bot, outgoing } = makeHarness(d, BOT_INFO, { allowedTelegramIds: [111], timezone: 'UTC' });

    await bot.handleUpdate(callbackUpdate(1, 'wc:g', 700));

    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(1);
    // La bienvenida NO se repinta ni se le quita el botón: es una entrada de menú
    // permanente y ‹ Volver la reconstruye entera de todos modos.
    expect(outgoingCalls(outgoing, 'editMessageText')).toHaveLength(0);
    expect(outgoingCalls(outgoing, 'editMessageReplyMarkup')).toHaveLength(0);
  });
});
```

Añade a los imports del fichero lo que falte: `createWorkout`, `insertSet`, `callbackUpdate`, `outgoingCalls`, y el mock del renderizador igual que en `weekly-chart.test.ts`:

```ts
const renderChart = vi.hoisted(() => vi.fn(async () => Buffer.from('fake-png')));
vi.mock('../charts/render', () => ({ renderChart }));
```

- [ ] **Step 2: Ejecútalos para verlos fallar**

Run: `pnpm vitest run apps/server/src/bot/welcome.test.ts`
Expected: FAIL — no existe `wc:g`.

- [ ] **Step 3: Añade el dato de callback y el texto**

En `callback-data.ts`, junto a los demás `wc*`:

```ts
  wcChart: 'wc:g',
```

En `es.ts`: `welcomeChartButton: '📊 Semana',`
En `en.ts`: `welcomeChartButton: '📊 Week',`
En `texts.ts`:

```ts
  get welcomeChartButton(): string {
    return t('welcomeChartButton');
  },
```

- [ ] **Step 4: Añade el botón y su handler**

En `renderWelcome`, el botón entra **en la fila que ya tiene Ayuda**, no en una fila propia: `welcome.ts:106` avisa de que `.text(x).row()` solo es seguro si detrás va otro botón.

```ts
  const keyboard = new InlineKeyboard()
    .text(T.welcomeStartButton, CB.wcStart)
    .row()
    .text(T.welcomeRoutinesButton, CB.wcRoutines)
    .text(T.welcomeHistoryButton, CB.wcHistory)
    .row()
    .text(T.welcomeHelpButton, CB.wcHelp)
    .text(T.welcomeChartButton, CB.wcChart);
```

Y en `registerWelcome`, junto a los demás handlers:

```ts
  // La ÚNICA pantalla de aquí que no edita el mensaje pulsado: una foto no se puede
  // pintar sobre un mensaje de texto, así que va como mensaje nuevo. El botón se
  // conserva tras usarlo (es una entrada de menú permanente); pulsarlo dos veces
  // manda dos fotos, y es una acción explícita del usuario.
  bot.callbackQuery(CB.wcChart, async (ctx) => {
    // Antes de renderizar: si no, la ruedita del botón gira hasta que acabe todo.
    await ctx.answerCallbackQuery();
    await ctx.replyWithChatAction('upload_photo').catch(() => {});
    await sendWeeklyChart(ctx, db, config.timezone);
  });
```

Con su import: `import { sendWeeklyChart } from './weekly-chart';`

- [ ] **Step 5: Ejecuta la suite y el typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/bot apps/server/src/i18n
git commit -m "feat(server): add a weekly chart button to the welcome screen"
```

---

### Task 10: 1RM por sesión, con récords marcados

Función pura compartida por la gráfica de `/last` y por la decisión de mostrar o no su botón.

**Files:**
- Create: `apps/server/src/services/exercise-sessions.ts`
- Test: `apps/server/src/services/exercise-sessions.test.ts`

**Interfaces:**
- Consumes: `session1RM` de core; `SetRow` de `@gym-tracker/db`.
- Produces:
  - `interface SessionPoint { at: number; best1RM: number; isRecord: boolean }`
  - `sessionSeries(sets: ReadonlyArray<SetRow>): SessionPoint[]` — una entrada por `workout_id` con al menos una serie efectiva, ordenadas de más antigua a más reciente.

- [ ] **Step 1: Escribe los tests que fallan**

```ts
import { describe, expect, it } from 'vitest';
import { sessionSeries } from './exercise-sessions';

const set = (workoutId: number, weightKg: number, reps: number, createdAt: number, isWarmup = false) => ({
  id: createdAt,
  workoutId,
  exerciseId: 1,
  position: 1,
  weightKg,
  reps,
  rpe: null,
  restSeconds: null,
  isWarmup,
  createdAt,
});

describe('sessionSeries', () => {
  it('da un punto por sesión, con el mejor 1RM y ordenado por fecha', () => {
    const points = sessionSeries([
      set(2, 70, 5, 2_000),
      set(1, 60, 8, 1_000),
      set(1, 62.5, 6, 1_100),
    ]);
    expect(points.map((p) => p.at)).toEqual([1_100, 2_000]);
    expect(points[0]?.best1RM).toBeCloseTo(75, 5); // 62.5 × (1 + 6/30)
    expect(points[1]?.best1RM).toBeCloseTo(81.666, 2);
  });

  it('marca como récord solo las sesiones que superan a todas las anteriores', () => {
    const points = sessionSeries([
      set(1, 60, 5, 1_000),
      set(2, 55, 5, 2_000),
      set(3, 65, 5, 3_000),
      set(4, 65, 5, 4_000), // empate: no es récord
    ]);
    expect(points.map((p) => p.isRecord)).toEqual([true, false, true, false]);
  });

  it('ignora las series de calentamiento y las sesiones que solo tienen calentamiento', () => {
    const points = sessionSeries([
      set(1, 100, 5, 1_000, true),
      set(2, 60, 5, 2_000),
      set(2, 100, 5, 2_100, true),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]?.best1RM).toBeCloseTo(70, 5);
  });

  it('no devuelve nada sin series', () => {
    expect(sessionSeries([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecútalos para verlos fallar**

Run: `pnpm vitest run apps/server/src/services/exercise-sessions.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementa**

```ts
import { session1RM } from '@gym-tracker/core';
import type { SetRow } from '@gym-tracker/db';

export interface SessionPoint {
  /** Instante de la última serie de la sesión: es la fecha que se pinta en el eje. */
  at: number;
  best1RM: number;
  isRecord: boolean;
}

/**
 * Mejor 1RM estimado de cada sesión de un ejercicio, de la más antigua a la más
 * reciente, con las sesiones récord marcadas.
 *
 * Récord = supera ESTRICTAMENTE a todas las anteriores, igual que
 * `detectStagnation`: en un empate gana la sesión más antigua.
 *
 * `session1RM` devuelve `undefined` si la sesión no tiene ninguna serie efectiva
 * (todo calentamiento): esa sesión no pinta punto.
 */
export function sessionSeries(sets: ReadonlyArray<SetRow>): SessionPoint[] {
  const byWorkout = new Map<number, SetRow[]>();
  for (const set of sets) {
    const bucket = byWorkout.get(set.workoutId);
    if (bucket) {
      bucket.push(set);
    } else {
      byWorkout.set(set.workoutId, [set]);
    }
  }

  const points: Array<{ at: number; best1RM: number }> = [];
  for (const rows of byWorkout.values()) {
    const best = session1RM(rows);
    if (best === undefined) {
      continue;
    }
    points.push({ at: Math.max(...rows.map((row) => row.createdAt)), best1RM: best });
  }
  points.sort((a, b) => a.at - b.at);

  let historicalBest = 0;
  return points.map((point) => {
    const isRecord = point.best1RM > historicalBest;
    if (isRecord) {
      historicalBest = point.best1RM;
    }
    return { ...point, isRecord };
  });
}
```

- [ ] **Step 4: Ejecuta el test**

Run: `pnpm vitest run apps/server/src/services/exercise-sessions.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/exercise-sessions.ts apps/server/src/services/exercise-sessions.test.ts
git commit -m "feat(server): derive per-session 1RM points with record markers"
```

---

### Task 11: Configuración de la gráfica de 1RM

**Files:**
- Create: `apps/server/src/charts/exercise-1rm.ts`
- Test: `apps/server/src/charts/exercise-1rm.test.ts`
- Modify: `apps/server/src/charts/render.test.ts` (un caso más)

**Interfaces:**
- Consumes: `SessionPoint` (Tarea 10); `COLORS` y los mínimos tipográficos (Tarea 6).
- Produces:
  - `MAX_SESSIONS = 12`
  - `exercise1RMChart(points: ReadonlyArray<SessionPoint>, options: { locale: string; timeZone: string; unit: string }): ChartConfiguration<'line'>`

- [ ] **Step 1: Escribe los tests que fallan**

```ts
import { describe, expect, it } from 'vitest';
import { MAX_SESSIONS, exercise1RMChart } from './exercise-1rm';
import { COLORS } from './theme';

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 5, 12, 0, 0);
const point = (dayOffset: number, best1RM: number, isRecord = false) => ({
  at: START + dayOffset * DAY,
  best1RM,
  isRecord,
});
const OPTIONS = { locale: 'es', timeZone: 'UTC', unit: 'kg' };

describe('exercise1RMChart', () => {
  it('reparte el eje X por tiempo, no por índice', () => {
    const config = exercise1RMChart([point(0, 100), point(7, 102), point(67, 104)], OPTIONS);
    expect(config.options?.scales?.x?.type).toBe('linear');
    expect(config.data.datasets[0]?.data).toEqual([
      { x: START, y: 100 },
      { x: START + 7 * DAY, y: 102 },
      { x: START + 67 * DAY, y: 104 },
    ]);
  });

  it('se queda con las 12 sesiones más recientes', () => {
    const points = Array.from({ length: 20 }, (_, i) => point(i, 100 + i));
    const config = exercise1RMChart(points, OPTIONS);
    const data = config.data.datasets[0]?.data as Array<{ x: number; y: number }>;
    expect(data).toHaveLength(MAX_SESSIONS);
    expect(data[0]?.y).toBe(108); // la 9.ª de 20
    expect(data[MAX_SESSIONS - 1]?.y).toBe(119);
  });

  it('marca con un punto solo las sesiones récord', () => {
    const config = exercise1RMChart([point(0, 100, true), point(7, 99), point(14, 105, true)], OPTIONS);
    expect(config.data.datasets[0]?.pointRadius).toEqual([expect.any(Number), 0, expect.any(Number)]);
    const radii = config.data.datasets[0]?.pointRadius as number[];
    expect(radii[0]).toBeGreaterThan(0);
    expect(radii[2]).toBeGreaterThan(0);
  });

  it('formatea las marcas del eje X como fechas del locale pedido', () => {
    const config = exercise1RMChart([point(0, 100), point(7, 102)], OPTIONS);
    const callback = config.options?.scales?.x?.ticks?.callback;
    expect(typeof callback).toBe('function');
    // El callback recibe el valor numérico del eje: epoch en milisegundos.
    const label = (callback as (v: number) => string).call(null, START);
    expect(label).toContain('05'); // 5 de enero
  });

  it('usa el acento y un trazo grueso', () => {
    const config = exercise1RMChart([point(0, 100), point(7, 102)], OPTIONS);
    expect(config.data.datasets[0]?.borderColor).toBe(COLORS.accent);
    expect(config.data.datasets[0]?.borderWidth).toBeGreaterThanOrEqual(2);
  });

  it('etiqueta el eje Y con la unidad configurada, sin convertir nada', () => {
    const config = exercise1RMChart([point(0, 100)], { ...OPTIONS, unit: 'lb' });
    expect(config.options?.scales?.y?.title).toMatchObject({ display: true, text: 'lb' });
  });

  it('rellena con un degradado que se calcula al pintar', () => {
    const config = exercise1RMChart([point(0, 100), point(7, 102)], OPTIONS);
    const fill = config.data.datasets[0]?.backgroundColor;
    expect(typeof fill).toBe('function');
    // Antes del primer layout no hay área de dibujo: no puede reventar.
    expect((fill as (c: unknown) => unknown)({ chart: { ctx: null, chartArea: null } })).toBe('transparent');
  });

  it('produce una configuración válida sin puntos', () => {
    const config = exercise1RMChart([], OPTIONS);
    expect(config.data.datasets[0]?.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecútalos para verlos fallar**

Run: `pnpm vitest run apps/server/src/charts/exercise-1rm.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementa**

```ts
import type { ChartConfiguration, ScriptableContext } from 'chart.js';
import type { SessionPoint } from '../services/exercise-sessions';
import { COLORS, LABEL_FONT_SIZE, LINE_WIDTH, POINT_RADIUS, TICK_FONT_SIZE } from './theme';

/** Ventana del spec §4.3: las 12 sesiones más recientes. */
export const MAX_SESSIONS = 12;

/**
 * Evolución del mejor 1RM estimado por sesión, con las récord marcadas.
 *
 * Eje X TEMPORAL, `type: 'linear'` sobre epoch-ms: doce sesiones equiespaciadas
 * harían que dos meses sin pisar el gimnasio se vieran como una semana normal.
 * Deliberadamente NO se usa la escala `time` de Chart.js: exige
 * `chartjs-adapter-date-fns` y una librería de fechas, y DECISIONS (Fase 0) fijó
 * que no entra ninguna. `Intl.DateTimeFormat` da el mismo resultado sin dependencia.
 *
 * Nota: el dashboard reparte por índice (`AreaChart.tsx`). La divergencia es
 * consciente y está en DECISIONS; corregir el dashboard es alcance de otra tarea.
 */
export function exercise1RMChart(
  points: ReadonlyArray<SessionPoint>,
  options: { locale: string; timeZone: string; unit: string },
): ChartConfiguration<'line'> {
  const window = points.slice(-MAX_SESSIONS);
  const axisDate = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    day: '2-digit',
    month: 'short',
  });

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: '1RM',
          data: window.map((point) => ({ x: point.at, y: point.best1RM })),
          borderColor: COLORS.accent,
          borderWidth: Math.max(LINE_WIDTH, 3),
          tension: 0.25,
          fill: true,
          // El degradado necesita el contexto del canvas, que solo existe al
          // pintar: por eso es una función y no un color. Antes del primer layout
          // no hay `chartArea` y devolvemos un relleno neutro.
          backgroundColor: (context: ScriptableContext<'line'>) => {
            const { ctx, chartArea } = context.chart;
            if (!ctx || !chartArea) {
              return 'transparent';
            }
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(145,132,217,0.30)');
            gradient.addColorStop(1, 'rgba(145,132,217,0)');
            return gradient;
          },
          pointRadius: window.map((point) => (point.isRecord ? POINT_RADIUS : 0)),
          pointBackgroundColor: COLORS.accent,
          pointBorderColor: COLORS.bg,
          pointBorderWidth: LINE_WIDTH,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: COLORS.text,
            font: { size: TICK_FONT_SIZE },
            maxTicksLimit: 6,
            callback: (value) => axisDate.format(new Date(Number(value))),
          },
          grid: { color: COLORS.divider },
          border: { color: COLORS.divider },
        },
        y: {
          // La unidad es solo una etiqueta: el histórico de quien cambie de kg a lb
          // mezcla unidades (SPEC §6) y aquí no se convierte nada. Se rotula con la
          // que esté configurada en este momento.
          title: { display: true, text: options.unit, color: COLORS.text, font: { size: LABEL_FONT_SIZE } },
          ticks: { color: COLORS.text, font: { size: LABEL_FONT_SIZE } },
          grid: { color: COLORS.divider },
          border: { color: COLORS.divider },
        },
      },
    },
  };
}
```

- [ ] **Step 4: Ejecuta el test**

Run: `pnpm vitest run apps/server/src/charts/exercise-1rm.test.ts`
Expected: PASS.

- [ ] **Step 5: Comprueba que se dibuja de verdad**

Añade a `apps/server/src/charts/render.test.ts`:

```ts
it('dibuja la gráfica de 1RM', async () => {
  const buffer = await renderChart(
    exercise1RMChart(
      [
        { at: Date.UTC(2026, 0, 5), best1RM: 100, isRecord: true },
        { at: Date.UTC(2026, 2, 5), best1RM: 105, isRecord: true },
      ],
      { locale: 'es', timeZone: 'UTC', unit: 'kg' },
    ),
  );
  expect(buffer).not.toBeNull();
  expect(pngSize(buffer as Buffer)).toEqual({ width: CHART_WIDTH, height: CHART_HEIGHT });
});
```

Con su import: `import { exercise1RMChart } from './exercise-1rm';`

Run: `pnpm vitest run apps/server/src/charts && pnpm typecheck`
Expected: PASS. Este caso es el que confirma que el degradado y el eje `linear` funcionan sobre skia-canvas de verdad.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/charts
git commit -m "feat(server): build the 1RM chart configuration with a time axis"
```

---

### Task 12: `/last` — aviso de estancamiento y botón de gráfica

**Files:**
- Modify: `apps/server/src/bot/last.ts` (completo)
- Modify: `apps/server/src/bot/last.test.ts`
- Modify: `apps/server/src/bot/callback-data.ts`
- Modify: `apps/server/src/i18n/locales/{es,en}.ts`, `apps/server/src/bot/texts.ts`

**Interfaces:**
- Consumes: `sessionSeries` (Tarea 10), `exercise1RMChart` (Tarea 11), `renderChart` (Tarea 6), `detectStagnation` y `session1RM` de core.
- Produces:
  - `CB.chart(exerciseId: number): string` → `ch:<id>`
  - `renderLast(db, params): { text: string; sessions: number }` — **cambia el tipo de retorno**; los dos puntos de llamada de `last.ts` y los tests leen `.text`.

- [ ] **Step 1: Escribe los tests que fallan**

En `apps/server/src/bot/last.test.ts`, adapta los dos tests existentes de `renderLast` para leer `.text`, y añade:

```ts
const renderChart = vi.hoisted(() => vi.fn(async () => Buffer.from('fake-png')));
vi.mock('../charts/render', () => ({ renderChart }));

const WEEK = 7 * 86_400_000;

/** Una sesión de un ejercicio, con su serie efectiva. */
function session(d: DatabaseSync, at: number, weightKg: number, reps: number) {
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: at });
  insertSet(d, { workoutId: w.id, exerciseId: EX, position: 1, weightKg, reps, rpe: null, restSeconds: null, isWarmup: false, createdAt: at });
  finishWorkout(d, { workoutId: w.id, finishedAt: at + 1 });
}

describe('detalle de /last', () => {
  it('avisa del estancamiento cuando el récord no se supera en tres semanas entrenadas', () => {
    const d = db();
    const base = Date.UTC(2026, 0, 5, 12, 0, 0); // lunes
    session(d, base, 100, 5); // récord
    session(d, base + WEEK, 90, 5);
    session(d, base + 2 * WEEK, 92.5, 5);
    session(d, base + 3 * WEEK, 95, 5);

    const { text } = renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' });
    expect(text).toContain('⚠️');
    expect(text).toContain('3'); // tres semanas sin superarlo
  });

  it('no avisa cuando el ejercicio progresa', () => {
    const d = db();
    const base = Date.UTC(2026, 0, 5, 12, 0, 0);
    session(d, base, 90, 5);
    session(d, base + WEEK, 95, 5);
    session(d, base + 2 * WEEK, 100, 5);

    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' }).text).not.toContain('⚠️');
  });

  it('cuenta las sesiones para decidir si cabe una gráfica', () => {
    const d = db();
    const base = Date.UTC(2026, 0, 5, 12, 0, 0);
    session(d, base, 90, 5);
    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' }).sessions).toBe(1);
    session(d, base + WEEK, 95, 5);
    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' }).sessions).toBe(2);
  });
});

describe('botón 📈 Ver gráfica', () => {
  const base = Date.UTC(2026, 0, 5, 12, 0, 0);

  it('no aparece con una sola sesión', async () => {
    const d = db();
    session(d, base, 90, 5);
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(2, `pick:l:x:${EX}`, LAST_MSG));
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toEqual([]);
  });

  it('aparece con dos sesiones y envía la foto como mensaje aparte', async () => {
    const d = db();
    session(d, base, 90, 5);
    session(d, base + WEEK, 95, 5);
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    await bot.handleUpdate(callbackUpdate(2, `pick:l:x:${EX}`, LAST_MSG));
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toEqual([`ch:${EX}`]);
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, `ch:${EX}`, LAST_MSG));

    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(1);
    // La ruedita se apaga ANTES de renderizar.
    const methods = outgoing.map((c) => c.method);
    expect(methods.indexOf('answerCallbackQuery')).toBeLessThan(methods.indexOf('sendPhoto'));
    expect(methods).toContain('sendChatAction');
    // Acción de un solo uso sobre una pantalla transitoria: el botón se retira.
    expect(outgoingCalls(outgoing, 'editMessageReplyMarkup')).toHaveLength(1);
  });

  it('deja el detalle intacto cuando el render falla', async () => {
    renderChart.mockResolvedValueOnce(null);
    const d = db();
    session(d, base, 90, 5);
    session(d, base + WEEK, 95, 5);
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    await bot.handleUpdate(callbackUpdate(2, `pick:l:x:${EX}`, LAST_MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, `ch:${EX}`, LAST_MSG));

    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(0);
    expect(outgoingCalls(outgoing, 'answerCallbackQuery')).toHaveLength(1); // sin error visible
  });
});
```

Completa los imports del fichero: `vi`, `DatabaseSync`, `callbackUpdate`, `lastKeyboardDatas`, `outgoingCalls`, `createWorkout`, `insertSet`, `finishWorkout`.

- [ ] **Step 2: Ejecútalos para verlos fallar**

Run: `pnpm vitest run apps/server/src/bot/last.test.ts`
Expected: FAIL — `renderLast` devuelve una cadena y `ch:` no existe.

- [ ] **Step 3: Añade el dato de callback y los textos**

En `callback-data.ts`, junto a los espacios `wc:` y `set:`:

```ts
  // Espacio de la gráfica de /last. Como wc:* y set:*, NO pasa por parseCallback:
  // su handler usa un filtro por expresión regular y se registra en registerLast,
  // antes del catch-all de capture.ts.
  chart: (exerciseId: number): string => `ch:${exerciseId}`,
```

En `es.ts`:

```ts
    lastChartButton: '📈 Ver gráfica',
    lastStagnant_one: '⚠️ {{count}} semana sin superar {{weight}} {{unit}}',
    lastStagnant_other: '⚠️ {{count}} semanas sin superar {{weight}} {{unit}}',
    chartExerciseCaption: '📈 {{name}} · mejor 1RM {{weight}} {{unit}}',
```

En `en.ts`:

```ts
    lastChartButton: '📈 View chart',
    lastStagnant_one: '⚠️ {{count}} week without beating {{weight}} {{unit}}',
    lastStagnant_other: '⚠️ {{count}} weeks without beating {{weight}} {{unit}}',
    chartExerciseCaption: '📈 {{name}} · best 1RM {{weight}} {{unit}}',
```

En `texts.ts`, junto a las claves de `/last`:

```ts
  get lastChartButton(): string {
    return t('lastChartButton');
  },
  lastStagnant(weeks: number, weight: string): string {
    return t('lastStagnant', { count: weeks, weight, unit: unitLabel() });
  },
  chartExerciseCaption(name: string, weight: string): string {
    return t('chartExerciseCaption', { name, weight, unit: unitLabel() });
  },
```

`unitLabel` ya está importado en el fichero.

- [ ] **Step 4: Reescribe `last.ts`**

Cambios: locale del formateador de fechas, línea de estancamiento, retorno con el número de sesiones, teclado del detalle y handler de la gráfica.

```ts
import { detectStagnation, session1RM } from '@gym-tracker/core';
import {
  type SetRow,
  getExerciseById,
  listCatalogAndOwn,
  listExercisesByMuscleGroup,
  listHistorySetsForExercise,
} from '@gym-tracker/db';
import { type Bot, InlineKeyboard, InputFile } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { exercise1RMChart } from '../charts/exercise-1rm';
import { renderChart } from '../charts/render';
import { currentLocale, unitLabel } from '../i18n/current';
import { displayName, localizeGroups } from '../i18n/exercise-name';
import { matchExercise } from '../services/exercise-match';
import { sessionSeries } from '../services/exercise-sessions';
import { CB, parseCallback } from './callback-data';
import type { CustomContext } from './context';
import { type PickerState, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
import { format1RM, formatSet } from './session-view';
import { T } from './texts';

// El idioma activo, no un 'es-ES' fijo: el eje de fechas de la gráfica y estas
// líneas tienen que hablar el idioma del usuario.
function localDate(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(epochMs));
}

export interface LastDetail {
  text: string;
  /** Sesiones con al menos una serie efectiva: con menos de dos no hay gráfica. */
  sessions: number;
}

export function renderLast(
  db: DatabaseSync,
  params: { userId: number; exerciseId: number; timezone: string },
): LastDetail {
  const exercise = getExerciseById(db, params.exerciseId);
  const name = exercise ? displayName(exercise) : '';
  // excludeWorkoutId: 0 no excluye ninguno (ningún workout tiene id 0) → todo el histórico.
  const sets = listHistorySetsForExercise(db, {
    userId: params.userId,
    exerciseId: params.exerciseId,
    excludeWorkoutId: 0,
  });
  if (sets.length === 0) {
    return { text: T.lastNoHistory(name), sessions: 0 };
  }

  const byWorkout = new Map<number, SetRow[]>();
  for (const set of sets) {
    const bucket = byWorkout.get(set.workoutId);
    if (bucket) {
      bucket.push(set);
    } else {
      byWorkout.set(set.workoutId, [set]);
    }
  }
  const maxCreated = (rows: SetRow[]): number => Math.max(...rows.map((r) => r.createdAt));
  const sessions = [...byWorkout.values()].sort((a, b) => maxCreated(b) - maxCreated(a)).slice(0, 3);

  const lines = [T.lastHeader(name)];
  for (const rows of sessions) {
    const effective = rows.filter((r) => !r.isWarmup);
    const label = effective
      .map((r) => `${formatSet({ weightKg: r.weightKg, reps: r.reps })}${r.rpe !== null ? ` RPE${r.rpe}` : ''}`)
      .join(' · ');
    lines.push(`${localDate(maxCreated(rows), params.timezone)}: ${label}`);
  }
  const best = session1RM(sets);
  if (best !== undefined) {
    lines.push(T.lastBest(format1RM(best)));
  }

  // El histórico completo ya está cargado: es exactamente lo que detectStagnation
  // necesita, así que el insight más valioso del producto (SPEC §5) no cuesta ni
  // una consulta más y aparece cuando el usuario decide el peso de hoy.
  const stagnation = detectStagnation(sets, { timeZone: params.timezone });
  if (stagnation.stagnant) {
    lines.push(T.lastStagnant(stagnation.weeksWithoutImprovement, format1RM(stagnation.record1RM)));
  }

  return { text: lines.join('\n'), sessions: sessionSeries(sets).length };
}

/** Una línea de un solo punto no informa de nada: sin dos sesiones, sin botón. */
function detailKeyboard(exerciseId: number, detail: LastDetail): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (detail.sessions >= 2) {
    keyboard.text(T.lastChartButton, CB.chart(exerciseId));
  }
  return keyboard;
}
```

En `registerLast`, el `pick_exercise` pasa a pintar el teclado:

```ts
    if (action.type === 'pick_exercise') {
      const exercise = getExerciseById(db, action.exerciseId);
      if (!exercise || exercise.archived) {
        await ctx.answerCallbackQuery(T.exerciseGoneToast);
        const { text, keyboard } = groupsView(userId);
        await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => {});
        return;
      }
      const detail = renderLast(db, { userId, exerciseId: action.exerciseId, timezone: config.timezone });
      await ctx
        .editMessageText(detail.text, { reply_markup: detailKeyboard(action.exerciseId, detail) })
        .catch(() => {});
      await ctx.answerCallbackQuery();
      return;
    }
```

Y el comando `/last <nombre>`, al final:

```ts
    const detail = renderLast(db, { userId: ctx.user.id, exerciseId: match.exercise.id, timezone: config.timezone });
    await ctx.reply(detail.text, { reply_markup: detailKeyboard(match.exercise.id, detail) });
```

Añade el handler de la gráfica dentro de `registerLast`, antes del `bot.callbackQuery(/^pick:l:/, ...)`:

```ts
  bot.callbackQuery(/^ch:\d+$/, async (ctx) => {
    // Antes de renderizar: entre la pulsación y la foto hay render y subida, y sin
    // esto la ruedita del botón gira hasta que acabe todo.
    await ctx.answerCallbackQuery();
    const exerciseId = Number((ctx.callbackQuery.data ?? '').slice('ch:'.length));
    const exercise = getExerciseById(db, exerciseId);
    if (!exercise) {
      return;
    }
    await ctx.replyWithChatAction('upload_photo').catch(() => {});

    const sets = listHistorySetsForExercise(db, { userId: ctx.user.id, exerciseId, excludeWorkoutId: 0 });
    const points = sessionSeries(sets);
    const buffer = await renderChart(
      exercise1RMChart(points, {
        locale: currentLocale(),
        timeZone: config.timezone,
        unit: unitLabel(),
      }),
    );
    if (buffer === null) {
      return; // el detalle se queda como está; ninguna foto, ningún error visible
    }
    const best = session1RM(sets);
    await ctx.replyWithPhoto(new InputFile(buffer, 'exercise-1rm.png'), {
      caption: T.chartExerciseCaption(displayName(exercise), format1RM(best ?? 0)),
    });
    // Acción de un solo uso sobre una pantalla transitoria: el estado "detalle sin
    // botones" es el mismo con el que se pintaba antes de esta tarea.
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
  });
```

- [ ] **Step 5: Ejecuta los tests**

Run: `pnpm vitest run apps/server/src/bot/last.test.ts && pnpm typecheck`
Expected: PASS. El typecheck señala cualquier sitio que siguiera esperando una cadena de `renderLast`.

- [ ] **Step 6: Ejecuta la suite entera**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/bot apps/server/src/i18n
git commit -m "feat(server): add a 1RM chart button and a stagnation line to /last"
```

---

### Task 13: Comando `/stagnant`

**Files:**
- Modify: `packages/db/src/repositories/sets.ts` (consulta nueva)
- Modify: `packages/db/src/repositories/sets.test.ts`
- Create: `apps/server/src/bot/stagnant.ts`
- Create: `apps/server/src/bot/stagnant.test.ts`
- Modify: `apps/server/src/bot/bot.ts`
- Modify: `apps/server/src/bot/welcome.ts` (`COMMAND_ORDER`)
- Modify: `apps/server/src/bot/welcome.test.ts` (siete comandos)
- Modify: `apps/server/src/i18n/locales/{es,en}.ts`, `apps/server/src/bot/texts.ts`

**Interfaces:**
- Consumes: `detectStagnation`, `isoWeekKey` de core; `getExerciseById`, `displayName`.
- Produces:
  - `listEffectiveSetsForUser(db, userId: number): Array<{ exerciseId: number; weightKg: number; reps: number; createdAt: number }>`
  - `renderStagnant(db: DatabaseSync, params: { userId: number; timezone: string }): string`
  - `registerStagnant(bot: Bot<CustomContext>, db: DatabaseSync, config: { timezone: string }): void`

- [ ] **Step 1: Escribe el test del repositorio**

Añade a `packages/db/src/repositories/sets.test.ts`:

```ts
it('lista las series efectivas de todos los ejercicios del usuario en una consulta', () => {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  createUser(d, { telegramUserId: 222, timezone: 'UTC', locale: 'es', createdAt: 0 });
  const mine = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
  const theirs = createWorkout(d, { userId: 2, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
  insertSet(d, { workoutId: mine.id, exerciseId: 1, position: 1, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: false, createdAt: 1_000 });
  insertSet(d, { workoutId: mine.id, exerciseId: 2, position: 2, weightKg: 40, reps: 10, rpe: null, restSeconds: null, isWarmup: true, createdAt: 1_100 });
  insertSet(d, { workoutId: theirs.id, exerciseId: 1, position: 1, weightKg: 99, reps: 1, rpe: null, restSeconds: null, isWarmup: false, createdAt: 1_200 });

  const rows = listEffectiveSetsForUser(d, 1);

  expect(rows).toEqual([{ exerciseId: 1, weightKg: 60, reps: 8, createdAt: 1_000 }]);
});
```

- [ ] **Step 2: Ejecútalo para verlo fallar**

Run: `pnpm vitest run packages/db/src/repositories/sets.test.ts`
Expected: FAIL — la función no existe.

- [ ] **Step 3: Implementa la consulta**

Añade al final de `packages/db/src/repositories/sets.ts`:

```ts
export interface UserEffectiveSet {
  exerciseId: number;
  weightKg: number;
  reps: number;
  createdAt: number;
}

/**
 * Series efectivas de TODOS los ejercicios del usuario, para el análisis de
 * estancamiento. Una sola consulta y agrupamiento en memoria en vez de recorrer
 * ejercicio por ejercicio: el bucle traería el histórico completo de cada uno
 * —decenas de miles de filas marshalladas por invocación— para calcular un máximo
 * por semana. Los ejercicios con histórico son las claves del agrupamiento, así que
 * tampoco hace falta una consulta que los liste.
 */
export function listEffectiveSetsForUser(db: DatabaseSync, userId: number): UserEffectiveSet[] {
  const rows = db
    .prepare(
      `SELECT s.exercise_id, s.weight_kg, s.reps, s.created_at
         FROM sets s
         JOIN workouts w ON w.id = s.workout_id
        WHERE w.user_id = ? AND s.is_warmup = 0
        ORDER BY s.created_at`,
    )
    .all(userId) as unknown as Array<{
    exercise_id: number;
    weight_kg: number;
    reps: number;
    created_at: number;
  }>;
  return rows.map((r) => ({
    exerciseId: r.exercise_id,
    weightKg: r.weight_kg,
    reps: r.reps,
    createdAt: r.created_at,
  }));
}
```

Run: `pnpm vitest run packages/db/src/repositories/sets.test.ts` → PASS.

- [ ] **Step 4: Añade los textos**

En `es.ts`:

```ts
    stagnantHeader: '⚠️ Ejercicios estancados',
    stagnantLine: '{{name}}: {{weeks}} sem. sin superar {{record}} {{unit}} ({{week}}) · mejor desde entonces {{since}} {{unit}}',
    stagnantNone: '✅ Ningún ejercicio estancado ahora mismo.',
    stagnantNotEnough: 'Todavía no hay semanas entrenadas suficientes para juzgarlo. Vuelve cuando lleves unas cuantas.',
    commandStagnant: 'Ejercicios estancados',
```

En `en.ts`:

```ts
    stagnantHeader: '⚠️ Stalled exercises',
    stagnantLine: '{{name}}: {{weeks}} wk without beating {{record}} {{unit}} ({{week}}) · best since {{since}} {{unit}}',
    stagnantNone: '✅ Nothing is stalled right now.',
    stagnantNotEnough: 'Not enough trained weeks yet to judge it. Come back after a few more.',
    commandStagnant: 'Stalled exercises',
```

Y en el `helpText` de los dos catálogos, añade la línea del comando después de la de `/last`:

```ts
      '<code>/stagnant</code> — ejercicios estancados',   // es
      '<code>/stagnant</code> — stalled exercises',       // en
```

En `texts.ts`:

```ts
  // /stagnant
  get stagnantHeader(): string {
    return t('stagnantHeader');
  },
  get stagnantNone(): string {
    return t('stagnantNone');
  },
  get stagnantNotEnough(): string {
    return t('stagnantNotEnough');
  },
  stagnantLine(params: { name: string; weeks: number; record: string; week: string; since: string }): string {
    return t('stagnantLine', { ...params, unit: unitLabel() });
  },
```

Y amplía la unión de `commandDescription`:

```ts
  commandDescription(
    command: 'start' | 'finish' | 'routines' | 'last' | 'stagnant' | 'help' | 'settings',
  ): string {
    const keys = {
      start: 'commandStart',
      finish: 'commandFinish',
      routines: 'commandRoutines',
      last: 'commandLast',
      stagnant: 'commandStagnant',
      help: 'commandHelp',
      settings: 'commandSettings',
    } as const;
    return t(keys[command]);
  },
```

- [ ] **Step 5: Escribe los tests del comando**

Crea `apps/server/src/bot/stagnant.test.ts`:

```ts
import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  finishWorkout,
  getExerciseById,
  insertSet,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import type { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it } from 'vitest';
import { setCurrent } from '../i18n/current';
import { initI18n } from '../i18n/index';
import { renderStagnant } from './stagnant';
import { BOT_INFO, commandUpdate, makeHarness, outgoingTexts } from './test-harness';

beforeAll(() => {
  initI18n();
  setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
});

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };
const WEEK = 7 * 86_400_000;
const BASE = Date.UTC(2026, 0, 5, 12, 0, 0); // lunes

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  return d;
}

function session(d: DatabaseSync, exerciseId: number, at: number, weightKg: number, reps: number) {
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: at });
  insertSet(d, { workoutId: w.id, exerciseId, position: 1, weightKg, reps, rpe: null, restSeconds: null, isWarmup: false, createdAt: at });
  finishWorkout(d, { workoutId: w.id, finishedAt: at + 1 });
}

/** Récord en la semana 0 y tres semanas entrenadas por debajo. */
function stalled(d: DatabaseSync, exerciseId: number, peak: number, weeksAfter: number) {
  session(d, exerciseId, BASE, peak, 5);
  for (let i = 1; i <= weeksAfter; i++) {
    session(d, exerciseId, BASE + i * WEEK, peak - 10, 5);
  }
}

describe('renderStagnant', () => {
  it('avisa de que no hay datos suficientes cuando apenas se ha entrenado', () => {
    const d = db();
    session(d, 1, BASE, 100, 5);
    expect(renderStagnant(d, { userId: 1, timezone: 'UTC' })).toContain('suficientes');
  });

  it('dice que no hay nada estancado cuando el ejercicio progresa', () => {
    const d = db();
    for (let i = 0; i <= 4; i++) {
      session(d, 1, BASE + i * WEEK, 100 + i * 5, 5);
    }
    expect(renderStagnant(d, { userId: 1, timezone: 'UTC' })).toContain('Ningún ejercicio');
  });

  it('lista los estancados de más semanas a menos', () => {
    const d = db();
    stalled(d, 1, 100, 3);
    stalled(d, 2, 80, 5);

    const text = renderStagnant(d, { userId: 1, timezone: 'UTC' });
    const first = getExerciseById(d, 2)!.name;
    const second = getExerciseById(d, 1)!.name;
    expect(text).toContain('Ejercicios estancados');
    expect(text.indexOf(first)).toBeLessThan(text.indexOf(second));
    expect(text).toContain('2026-W'); // la semana del récord
  });

  it('incluye un ejercicio archivado que sigue teniendo histórico', () => {
    const d = db();
    stalled(d, 1, 100, 4);
    const name = getExerciseById(d, 1)!.name;
    d.prepare('UPDATE exercises SET archived = 1 WHERE id = 1').run();

    // getExerciseById no filtra por `archived`: el nombre se resuelve igual y las
    // series ya registradas siguen contando, como en listEffectiveSetsBetween.
    expect(renderStagnant(d, { userId: 1, timezone: 'UTC' })).toContain(name);
  });

  it('no se cae por un ejercicio cuyo histórico revienta el cálculo', () => {
    const d = db();
    stalled(d, 1, 100, 4);
    // Un peso 0 hace que estimate1RM lance: hoy ningún camino de escritura lo mete,
    // pero el radio de daño de este comando es demasiado grande para depender de eso.
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: BASE });
    d.prepare(
      'INSERT INTO sets (workout_id, exercise_id, position, weight_kg, reps, rpe, rest_seconds, is_warmup, created_at) VALUES (?, ?, 1, 0, 5, NULL, NULL, 0, ?)',
    ).run(w.id, 2, BASE);

    const text = renderStagnant(d, { userId: 1, timezone: 'UTC' });
    expect(text).toContain(getExerciseById(d, 1)!.name); // el sano sigue saliendo
  });
});

describe('/stagnant', () => {
  it('responde con un mensaje nuevo', async () => {
    const d = db();
    stalled(d, 1, 100, 4);
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);

    await bot.handleUpdate(commandUpdate(1, 'stagnant'));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('Ejercicios estancados');
  });

  it('responde también cuando el usuario no tiene histórico', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);

    await bot.handleUpdate(commandUpdate(1, 'stagnant'));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('suficientes');
  });
});
```

- [ ] **Step 6: Ejecútalos para verlos fallar**

Run: `pnpm vitest run apps/server/src/bot/stagnant.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 7: Implementa `stagnant.ts`**

```ts
import { detectStagnation, isoWeekKey } from '@gym-tracker/core';
import { getExerciseById, listEffectiveSetsForUser } from '@gym-tracker/db';
import type { Bot } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { displayName } from '../i18n/exercise-name';
import { format1RM } from './session-view';
import type { CustomContext } from './context';
import { T } from './texts';

/** El default de `detectStagnation`; aquí se usa además para el estado vacío. */
const STAGNATION_WEEKS = 3;

interface StalledRow {
  name: string;
  weeks: number;
  record1RM: number;
  recordWeekKey: string;
  best1RMSinceRecord: number;
}

/**
 * Ejercicios cuyo mejor 1RM estimado no supera su máximo previo en tres o más
 * semanas entrenadas (SPEC §5).
 *
 * Los ejercicios de peso corporal ENTRAN en la lista, y es una inconsistencia
 * consciente con el dashboard, que los excluye mediante un `isBodyweight` que solo
 * existe en sus tipos mock: la tabla `exercises` no tiene esa columna. Añadirla es
 * una migración y queda fuera de este alcance; para las dominadas con lastre el
 * dato incluso es útil. Se revisa cuando el peso corporal sea un campo almacenado.
 */
export function renderStagnant(
  db: DatabaseSync,
  params: { userId: number; timezone: string },
): string {
  const byExercise = new Map<number, Array<{ weightKg: number; reps: number; isWarmup: boolean; createdAt: Date }>>();
  for (const row of listEffectiveSetsForUser(db, params.userId)) {
    const entry = { weightKg: row.weightKg, reps: row.reps, isWarmup: false, createdAt: new Date(row.createdAt) };
    const bucket = byExercise.get(row.exerciseId);
    if (bucket) {
      bucket.push(entry);
    } else {
      byExercise.set(row.exerciseId, [entry]);
    }
  }

  const stalled: StalledRow[] = [];
  let mostWeeksTrained = 0;
  for (const [exerciseId, sets] of byExercise) {
    // A diferencia de /last, que toca un ejercicio, esto los recorre todos: una
    // excepción en el histórico de cualquiera se llevaría el comando entero.
    try {
      const weeks = new Set(sets.map((set) => isoWeekKey(set.createdAt, params.timezone)));
      mostWeeksTrained = Math.max(mostWeeksTrained, weeks.size);

      const result = detectStagnation(sets, { timeZone: params.timezone });
      if (!result.stagnant) {
        continue;
      }
      const exercise = getExerciseById(db, exerciseId);
      if (!exercise) {
        continue;
      }
      stalled.push({
        // getExerciseById no filtra por `archived`: un ejercicio archivado con
        // histórico sigue teniendo nombre y sigue contando.
        name: displayName(exercise),
        weeks: result.weeksWithoutImprovement,
        record1RM: result.record1RM,
        recordWeekKey: result.recordWeekKey,
        best1RMSinceRecord: result.best1RMSinceRecord,
      });
    } catch (error) {
      console.error(`[stagnant] skipping exercise ${exerciseId}:`, error);
    }
  }

  if (stalled.length === 0) {
    // Dos estados vacíos con textos distintos, porque significan cosas distintas:
    // «no hay nada estancado» y «aún no hay semanas entrenadas suficientes».
    return mostWeeksTrained > STAGNATION_WEEKS ? T.stagnantNone : T.stagnantNotEnough;
  }

  stalled.sort((a, b) => b.weeks - a.weeks || a.name.localeCompare(b.name));
  return [
    T.stagnantHeader,
    ...stalled.map((row) =>
      T.stagnantLine({
        name: row.name,
        weeks: row.weeks,
        record: format1RM(row.record1RM),
        week: row.recordWeekKey,
        since: format1RM(row.best1RMSinceRecord),
      }),
    ),
  ].join('\n');
}

export function registerStagnant(
  bot: Bot<CustomContext>,
  db: DatabaseSync,
  config: { timezone: string },
): void {
  // Mensaje NUEVO, como /help: funciona con un entrenamiento en curso y no debe
  // tocar el mensaje activo de la sesión (SPEC §6).
  bot.command('stagnant', async (ctx) => {
    await ctx.reply(renderStagnant(db, { userId: ctx.user.id, timezone: config.timezone }));
  });
}
```

- [ ] **Step 8: Regístralo y mételo en el menú**

En `apps/server/src/bot/bot.ts`, junto a los demás registros, **antes** de `registerCapture`:

```ts
import { registerStagnant } from './stagnant';
// ...
  registerLast(bot, db, config);
  registerStagnant(bot, db, config);
```

En `apps/server/src/bot/welcome.ts`:

```ts
const COMMAND_ORDER = ['start', 'finish', 'routines', 'last', 'stagnant', 'help', 'settings'] as const;
```

En `apps/server/src/bot/welcome.test.ts`, actualiza el test de `setBotCommands`: `calls[0]?.payload.commands` pasa a llevar siete entradas, con `{ command: 'stagnant', description: 'Stalled exercises' }` tras `last`, y `calls[1]` lo mismo con `'Ejercicios estancados'`. Añade también `/stagnant` a la lista de agujas del test de `renderHelp`.

- [ ] **Step 9: Ejecuta la suite y el typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, incluida `parity.test.ts` (los dos catálogos tienen las mismas claves nuevas).

- [ ] **Step 10: Commit**

```bash
git add packages/db/src/repositories apps/server/src
git commit -m "feat(server): add the /stagnant command"
```

---

### Task 14: Documentación y cierre

**Files:**
- Modify: `SPEC.md` (§6)
- Modify: `DECISIONS.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Actualiza el SPEC §6**

En la lista de «Otros comandos», tras la línea de `/last`:

```markdown
- `/stagnant` — ejercicios cuyo mejor 1RM estimado lleva 3 o más semanas entrenadas sin
  superar su máximo previo.
```

Y en el flujo de captura, en el punto 6:

```markdown
6. `/finish` cierra la sesión, calcula el resumen, avisa de récords conseguidos y envía la
   gráfica del volumen de la semana por grupo muscular.
```

- [ ] **Step 2: Completa DECISIONS.md**

Bajo la sección `## 2026-07-26 — Gráficas en el bot` que abrió la Tarea 1, añade:

```markdown
- **Las fotos no viajan en `/start`.** La bienvenida se repinta en el sitio con
  `editMessageText`; una foto no se puede repintar, así que cada arranque dejaría una imagen
  huérfana más desactualizada que la anterior. Además la semana ISO en curso sale casi vacía
  los lunes —cuando más se pulsa `/start`— y el render más la subida se meten delante del
  selector de día, que es lo primero que se hace de pie con el móvil en la mano. El raster va
  a `/finish` (una foto por entrenamiento, no por arranque) y a botones explícitos.
- **Bloques Unicode como COMPLEMENTO en el camino crítico, no como sustituto del raster.** La
  bienvenida gana barras de texto (`█░│`) dentro de su `<pre>`: lectura visual inmediata con
  cero dependencias y cero latencia. Contrapartida: la escala no dice nada por encima de 20 y
  los glifos dependen de la fuente monoespaciada del cliente; si descuadran en uso real, se
  retira el separador `│` y quedan las diez celdas a secas.
- **La banda 10–20 pasa a `packages/core`.** Es una regla del SPEC §8.1, no una preferencia de
  presentación, y tenerla declarada en el dashboard obligaba al bot a redeclararla, que es
  justo lo que prohíbe el SPEC §7.
- **Eje temporal en la gráfica de 1RM del bot, frente al reparto por índice del dashboard.**
  Doce sesiones equiespaciadas harían que dos meses sin entrenar se vieran como una semana
  normal. Se hace con `type: 'linear'` sobre epoch-ms y `ticks.callback` con
  `Intl.DateTimeFormat`: la escala `time` de Chart.js exigiría `chartjs-adapter-date-fns` y
  una librería de fechas, y la Fase 0 ya fijó que no entra ninguna. La divergencia con
  `AreaChart.tsx` es consciente; corregir el dashboard es alcance de otra tarea.
- **`/stagnant` incluye los ejercicios de peso corporal mientras el dashboard los excluye.**
  El dashboard los filtra con un `isBodyweight` que solo existe en sus tipos mock: la tabla
  `exercises` no tiene esa columna y el catálogo base trae dominadas y fondos. Añadirla es una
  migración, fuera del alcance de esta fase; y para las dominadas con lastre el dato es útil,
  porque el peso añadido sí progresa. Se revisa cuando el peso corporal sea un campo
  almacenado.
```

- [ ] **Step 3: Actualiza la cifra de la suite**

Run: `pnpm test`

Copia el total que imprime Vitest (tests y ficheros) y actualiza la línea de referencia de `CONTRIBUTING.md` (hoy dice «338 tests en 47 archivos»).

- [ ] **Step 4: Verifica el conjunto**

Run: `pnpm test && pnpm typecheck`
Expected: PASS los dos.

- [ ] **Step 5: Commit**

```bash
git add SPEC.md DECISIONS.md CONTRIBUTING.md
git commit -m "docs: record the bot charting decisions and the /stagnant command"
```

---

## Verificación manual final

Antes de dar la fase por cerrada, con el bot corriendo de verdad (`pnpm --filter @gym-tracker/server start`) y desde el móvil:

1. `/start` → la bienvenida trae la tabla de métricas y, si hay series esta semana, el bloque de barras. **Un solo mensaje, sin fotos.**
2. `❓ Cómo funciona` → `‹ Volver` → la bienvenida se repinta en el sitio, con su botón `📊 Semana`.
3. `📊 Semana` → llega una foto nueva; el botón sigue ahí.
4. Registrar un par de series y `/finish` → el resumen se edita sobre el mensaje activo y **después** llega la gráfica.
5. `/last` → elegir un ejercicio con dos o más sesiones → `📈 Ver gráfica` → llega la foto y el botón desaparece del detalle.
6. `/stagnant` → texto, con la lista o con uno de los dos estados vacíos.
7. Con la foto ya en el chat: **¿se leen las etiquetas en el móvil?** Es el criterio del riesgo 3 del diseño y no lo mide ningún test.
