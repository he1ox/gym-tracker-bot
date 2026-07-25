# Selector de ejercicios por grupo muscular — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un selector de ejercicios navegable por grupo muscular, compartido por la captura, el wizard de `/routines` y `/last`, y convertir la búsqueda por texto en un atajo tolerante a tildes y a términos desordenados.

**Architecture:** Un render puro (`exercise-picker.ts`) que no toca ni base de datos ni Telegram, alimentado por un repositorio nuevo (`listExercisesByMuscleGroup`) y navegado por un espacio de `callback_data` nuevo (`pick:`) cuyo estado viaja entero en el propio dato del botón. Los tres puntos de entrada dejan de tener cada uno su propio listado y pintan el mismo selector. No hay cambios de esquema ni migraciones.

**Tech Stack:** TypeScript estricto (ESM), grammY 1.45, `@grammyjs/conversations` 2.1, `node:sqlite`, Vitest 4, pnpm workspaces.

## Global Constraints

- **Node 24** (mínimo 23.4.0), **pnpm 11.x**. `engine-strict=true`.
- **Sin dependencias nuevas.** Toda esta fase se implementa con la librería estándar y lo ya instalado. Si crees necesitar un paquete, para y pregunta al autor (SPEC §12).
- **Sin cambios de esquema ni migraciones.** Nada nuevo en `packages/db/src/schema.ts` ni en `packages/db/drizzle/`.
- **Sin estado persistido para el picker.** Nada nuevo en `bot_sessions`. El estado de navegación vive en el `callback_data`.
- **`callback_data` ≤ 64 bytes** (límite de Telegram). Por eso los grupos viajan como índice dentro de `MUSCLE_GROUPS`, no como nombre.
- **Grupos musculares:** siempre el enum `MUSCLE_GROUPS` de `@gym-tracker/core` (17 valores) con `MUSCLE_GROUP_LABELS` para mostrar. Nunca cadenas sueltas.
- **Idioma:** identificadores, nombres de archivo y comentarios de código **en inglés**; textos de interfaz **en español**; mensajes de commit **en inglés** (Conventional Commits con ámbito, p. ej. `feat(server):`).
- **Todo texto de interfaz vive en `apps/server/src/bot/texts.ts`** (objeto `T`). Nunca literales en español repartidos por los handlers.
- **TypeScript estricto** con tres opciones que cambian cómo se escribe el código a diario:
  - `noUncheckedIndexedAccess` — `arr[0]` es `T | undefined`; hay que comprobarlo o usar `as T` con una razón.
  - `exactOptionalPropertyTypes` — a `rpe?: number` no se le asigna `undefined`; se omite la clave.
  - `verbatimModuleSyntax` — las importaciones de solo-tipo van con `import type`.
- **Los tests viven junto al código** (`foo.ts` → `foo.test.ts`), no en un árbol `__tests__`.
- **TDD:** en cada tarea el test se escribe primero, se ve fallar, y solo entonces se implementa.
- **Página del picker: 10 ejercicios.** Constante única `PICKER_PAGE_SIZE = 10` en `exercise-picker.ts`; nadie más define ese número.

---

## Decisión de diseño que amplía el spec

El spec (§3.2) define el espacio `pick:` sin marca de origen: `pick:g`, `pick:g:<idx>:<offset>`, `pick:x:<id>`, `pick:s`. Eso **colisiona** en tiempo de ejecución. En `bot.ts:29-44` el orden de registro es `registerRoutines` → `registerLast` → `registerCapture`, y `registerCapture` engancha un `bot.on('callback_query:data')` genérico (captura todo). Si `/last` registrase `bot.callbackQuery(/^pick:x:(\d+)$/)`, se quedaría con **todos** los `pick:x` del bot, incluidos los de una sesión de captura activa, que nunca llegarían a `capture.ts`.

Decisión aprobada por el autor: **un segmento de origen de un carácter en todas las variantes**.

| `callback_data` | Significado |
|---|---|
| `pick:c:g` | Grupos, origen captura |
| `pick:c:g:<idx>:<offset>` | Ejercicios del grupo `idx` desde `offset`, origen captura |
| `pick:c:x:<id>` | Ejercicio elegido, origen captura |
| `pick:c:s` | Buscar por nombre, origen captura |
| `pick:l:g`, `pick:l:g:<idx>:<offset>`, `pick:l:x:<id>`, `pick:l:s` | Lo mismo, origen `/last` |

El **wizard de `/routines` reutiliza el origen `c`**: mientras una conversación está activa, `conversations()` (registrado antes que todo lo demás) consume el update y no llama al middleware de abajo, así que el wizard nunca compite con la captura por el mismo dato.

Peor caso de longitud: `pick:c:g:16:9990` = 16 bytes. Sobra margen sobre los 64.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `apps/server/src/services/exercise-match.ts` | *(modificado)* Normalización sin diacríticos y coincidencia por términos | 1 |
| `packages/db/src/repositories/exercises.ts` | *(modificado)* `listExercisesByMuscleGroup` | 2 |
| `apps/server/src/bot/callback-data.ts` | *(modificado)* Constructores y parser del espacio `pick:` | 3 |
| `apps/server/src/bot/texts.ts` | *(modificado)* Textos del picker; retoques de copy | 3, 4 |
| `apps/server/src/bot/exercise-picker.ts` | **(nuevo)** Render puro del selector y de la lista de candidatos | 4 |
| `apps/server/src/bot/capture.ts` | *(modificado)* Punto de entrada 1: sesión activa | 5 |
| `apps/server/src/bot/session-view.ts` | *(modificado)* Etiqueta del botón `📂 Otro ejercicio` | 5 |
| `apps/server/src/bot/last.ts` | *(modificado)* Punto de entrada 2: `/last` | 6 |
| `apps/server/src/bot/routines-wizard.ts` | *(modificado)* Punto de entrada 3: wizard | 7 |
| `CONTRIBUTING.md` | *(modificado)* Cifra de referencia de la suite | 8 |

Cada tarea deja la suite entera en verde antes de commitear.

---

### Task 1: Coincidencia por texto tolerante a tildes y a términos desordenados

Independiente del resto: no toca ni Telegram ni la base de datos. Se hace primero porque los tres puntos de entrada ya la usan y mejora sola.

**Files:**
- Modify: `apps/server/src/services/exercise-match.ts` (completo, 28 líneas)
- Test: `apps/server/src/services/exercise-match.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `matchExercise<T extends { name: string }>(query: string, exercises: readonly T[]): MatchResult<T>` — **la firma y el tipo `MatchResult<T>` no cambian**. Sigue exportando `MatchResult<T> = { kind: 'none' } | { kind: 'unique'; exercise: T } | { kind: 'ambiguous'; candidates: T[] }`.

- [ ] **Step 1: Escribe los tests que fallan**

Añade estos casos al final del `describe('matchExercise', …)` existente en `apps/server/src/services/exercise-match.test.ts`. **No borres los cinco tests que ya hay**: siguen siendo el contrato.

```ts
const accented = [
  { id: 10, name: 'Jalón al pecho en polea' },
  { id: 11, name: 'Extensión de tríceps en polea' },
  { id: 12, name: 'Elevaciones laterales en polea' },
];

describe('matchExercise — accents and multi-term queries', () => {
  it('matches a query typed without accents', () => {
    expect(matchExercise('jalon', accented)).toEqual({ kind: 'unique', exercise: accented[0] });
  });

  it('matches an accented query against an accented name', () => {
    expect(matchExercise('jalón', accented)).toEqual({ kind: 'unique', exercise: accented[0] });
  });

  it('matches all terms in any order', () => {
    expect(matchExercise('polea triceps', accented)).toEqual({ kind: 'unique', exercise: accented[1] });
    expect(matchExercise('triceps polea', accented)).toEqual({ kind: 'unique', exercise: accented[1] });
  });

  it('returns every exercise whose name contains all the terms', () => {
    const r = matchExercise('polea', accented);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') {
      expect(r.candidates.map((c) => c.id)).toEqual([10, 11, 12]);
    }
  });

  it('requires every term, not just one', () => {
    expect(matchExercise('polea sentadilla', accented)).toEqual({ kind: 'none' });
  });

  it('still prefers an exact name over a broader term match', () => {
    const pool = [
      { id: 1, name: 'Remo' },
      { id: 2, name: 'Remo con barra' },
    ];
    expect(matchExercise('remo', pool)).toEqual({ kind: 'unique', exercise: pool[0] });
  });

  it('ignores accents and case when comparing the exact name', () => {
    expect(matchExercise('JALON AL PECHO EN POLEA', accented)).toEqual({
      kind: 'unique',
      exercise: accented[0],
    });
  });

  it('collapses runs of whitespace between terms', () => {
    expect(matchExercise('  polea   triceps  ', accented)).toEqual({ kind: 'unique', exercise: accented[1] });
  });
});
```

- [ ] **Step 2: Ejecuta los tests y verifica que fallan**

Ejecuta: `pnpm vitest run apps/server/src/services/exercise-match.test.ts`
Esperado: FALLA. `matchExercise('jalon', …)` devuelve `{ kind: 'none' }` (la normalización actual no quita tildes) y `matchExercise('polea triceps', …)` también, porque hoy compara la consulta entera como una sola subcadena.

- [ ] **Step 3: Implementa el cambio**

Reemplaza el contenido completo de `apps/server/src/services/exercise-match.ts` por:

```ts
export type MatchResult<T> =
  | { kind: 'none' }
  | { kind: 'unique'; exercise: T }
  | { kind: 'ambiguous'; candidates: T[] };

// NFD separa la tilde del carácter base y \p{Diacritic} la borra: "Jalón" → "jalon".
// Nativo del motor de JS, sin dependencias.
const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export function matchExercise<T extends { name: string }>(
  query: string,
  exercises: readonly T[],
): MatchResult<T> {
  const q = normalize(query);
  if (q === '') {
    return { kind: 'none' };
  }
  // Un nombre completo idéntico gana sobre cualquier coincidencia parcial.
  const exact = exercises.filter((e) => normalize(e.name) === q);
  if (exact.length === 1) {
    return { kind: 'unique', exercise: exact[0] as T };
  }
  // Coincidencia por términos: todos los términos, como subcadena, en cualquier orden.
  const terms = q.split(' ');
  const matches = exercises.filter((e) => {
    const name = normalize(e.name);
    return terms.every((term) => name.includes(term));
  });
  if (matches.length === 0) {
    return { kind: 'none' };
  }
  if (matches.length === 1) {
    return { kind: 'unique', exercise: matches[0] as T };
  }
  return { kind: 'ambiguous', candidates: matches };
}
```

- [ ] **Step 4: Ejecuta los tests y verifica que pasan**

Ejecuta: `pnpm vitest run apps/server/src/services/exercise-match.test.ts`
Esperado: PASA, los cinco tests originales incluidos.

- [ ] **Step 5: Ejecuta la suite entera**

Ejecuta: `pnpm test`
Esperado: todo en verde. Si algún test de `flows.test.ts`, `last.test.ts` o `routines-wizard.test.ts` cambia de resultado, es porque una consulta que antes era única ahora es ambigua (o al revés): **para y reporta cuál**, no ajustes el test para que pase.

- [ ] **Step 6: Comprueba tipos**

Ejecuta: `pnpm typecheck`
Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/exercise-match.ts apps/server/src/services/exercise-match.test.ts
git commit -m "feat(server): match exercises ignoring accents and term order"
```

---

### Task 2: Repositorio `listExercisesByMuscleGroup`

**Files:**
- Modify: `packages/db/src/repositories/exercises.ts` (añadir al final; no toques lo existente)
- Test: `packages/db/src/repositories/exercises.test.ts` (añadir un `describe` nuevo)

**Interfaces:**
- Consumes: `MUSCLE_GROUPS`, `MuscleGroup` de `@gym-tracker/core` (ya es dependencia declarada de `@gym-tracker/db`); `openDatabase`, `runMigrations`, `MIGRATIONS_DIR` para los tests.
- Produces:
  ```ts
  export interface ExerciseOption { id: number; name: string }
  export function listExercisesByMuscleGroup(
    db: DatabaseSync,
    userId: number,
  ): Map<MuscleGroup, ExerciseOption[]>
  ```
  Se reexporta solo por `packages/db/src/index.ts`, que ya hace `export * from './repositories/exercises'` — **no hace falta tocar `index.ts`**.

  Contrato: incluye catálogo (`user_id IS NULL`) y ejercicios propios del usuario, excluye archivados y los de otros usuarios. **Solo aparecen en el `Map` los grupos con al menos un ejercicio.** Las claves se insertan en el orden de `MUSCLE_GROUPS`; dentro de cada grupo los ejercicios van por nombre (`COLLATE NOCASE`).

- [ ] **Step 1: Escribe los tests que fallan**

Añade al final de `packages/db/src/repositories/exercises.test.ts`. Ajusta también el `import` de la primera línea del bloque de imports de ese archivo para incluir la función nueva:

```ts
// Cambia esta línea que ya existe cerca del principio del archivo:
//   import { createCustomExercise, getExerciseById, listCatalogAndOwn } from './exercises';
// por:
import {
  createCustomExercise,
  getExerciseById,
  listCatalogAndOwn,
  listExercisesByMuscleGroup,
} from './exercises';
```

Y añade el `describe` nuevo al final:

```ts
describe('listExercisesByMuscleGroup', () => {
  it('groups the catalog by muscle group and omits empty groups', () => {
    const d = seededDb();
    const byGroup = listExercisesByMuscleGroup(d, 1);

    expect(byGroup.size).toBeGreaterThan(0);
    for (const [group, options] of byGroup) {
      expect(options.length).toBeGreaterThan(0); // ningún grupo vacío en el mapa
      expect(MUSCLE_GROUPS).toContain(group);
      expect(options.every((o) => typeof o.id === 'number' && typeof o.name === 'string')).toBe(true);
    }
    // Todos los ejercicios visibles están repartidos, sin perder ninguno.
    const total = [...byGroup.values()].reduce((n, options) => n + options.length, 0);
    expect(total).toBe(listCatalogAndOwn(d, 1).length);
  });

  it('keys follow the anatomical order of MUSCLE_GROUPS', () => {
    const d = seededDb();
    const keys = [...listExercisesByMuscleGroup(d, 1).keys()];
    const indices = keys.map((g) => MUSCLE_GROUPS.indexOf(g));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('sorts exercises by name inside each group', () => {
    const d = seededDb();
    for (const options of listExercisesByMuscleGroup(d, 1).values()) {
      const names = options.map((o) => o.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
    }
  });

  it('includes own exercises, excludes archived ones and other users', () => {
    const d = seededDb();
    createUser(d, { telegramUserId: 2, timezone: 'UTC', createdAt: 0 });
    const mine = createCustomExercise(d, { userId: 1, name: 'Mi curl', muscleGroup: 'biceps' });
    const archived = createCustomExercise(d, { userId: 1, name: 'Curl viejo', muscleGroup: 'biceps' });
    createCustomExercise(d, { userId: 2, name: 'Curl ajeno', muscleGroup: 'biceps' });
    d.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(archived.id);

    const names = [...listExercisesByMuscleGroup(d, 1).values()].flat().map((o) => o.name);
    expect(names).toContain('Mi curl');
    expect(names).not.toContain('Curl viejo'); // archivado
    expect(names).not.toContain('Curl ajeno'); // de otro usuario
    expect([...listExercisesByMuscleGroup(d, 1).get('biceps')!].some((o) => o.id === mine.id)).toBe(true);
  });

  it('omits a group with no available exercises', () => {
    const d = seededDb();
    // Archiva todo lo de un grupo concreto y comprueba que desaparece del mapa.
    d.prepare("UPDATE exercises SET archived = 1 WHERE muscle_group = 'calves'").run();
    expect(listExercisesByMuscleGroup(d, 1).has('calves')).toBe(false);
  });
});
```

Añade el import de `MUSCLE_GROUPS` arriba del archivo de test:

```ts
import { MUSCLE_GROUPS } from '@gym-tracker/core';
```

- [ ] **Step 2: Ejecuta los tests y verifica que fallan**

Ejecuta: `pnpm vitest run packages/db/src/repositories/exercises.test.ts`
Esperado: FALLA en la importación — `listExercisesByMuscleGroup is not exported` / `is not a function`.

- [ ] **Step 3: Implementa el repositorio**

Añade al **final** de `packages/db/src/repositories/exercises.ts`, y cambia la primera línea del archivo para importar también el valor `MUSCLE_GROUPS`:

```ts
// Primera línea del archivo: pasa de
//   import type { MuscleGroup } from '@gym-tracker/core';
// a (MUSCLE_GROUPS es un valor en tiempo de ejecución, MuscleGroup solo un tipo):
import { MUSCLE_GROUPS, type MuscleGroup } from '@gym-tracker/core';
```

```ts
export interface ExerciseOption {
  id: number;
  name: string;
}

/**
 * Catálogo + ejercicios propios no archivados, agrupados por grupo muscular.
 * Solo aparecen los grupos con al menos un ejercicio; las claves siguen el orden
 * anatómico de MUSCLE_GROUPS para que el índice del callback_data sea estable.
 */
export function listExercisesByMuscleGroup(
  db: DatabaseSync,
  userId: number,
): Map<MuscleGroup, ExerciseOption[]> {
  const rows = db
    .prepare(
      `SELECT id, name, muscle_group FROM exercises
       WHERE (user_id IS NULL OR user_id = ?) AND archived = 0
       ORDER BY name COLLATE NOCASE`,
    )
    .all(userId) as unknown as Array<{ id: number; name: string; muscle_group: MuscleGroup }>;

  const buckets = new Map<MuscleGroup, ExerciseOption[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.muscle_group);
    if (bucket) {
      bucket.push({ id: row.id, name: row.name });
    } else {
      buckets.set(row.muscle_group, [{ id: row.id, name: row.name }]);
    }
  }

  // Reconstruye el mapa en orden anatómico: el orden de inserción de un Map es
  // el de llegada de las filas, que va por nombre, no por grupo.
  const ordered = new Map<MuscleGroup, ExerciseOption[]>();
  for (const group of MUSCLE_GROUPS) {
    const options = buckets.get(group);
    if (options !== undefined && options.length > 0) {
      ordered.set(group, options);
    }
  }
  return ordered;
}
```

- [ ] **Step 4: Ejecuta los tests y verifica que pasan**

Ejecuta: `pnpm vitest run packages/db/src/repositories/exercises.test.ts`
Esperado: PASA.

- [ ] **Step 5: Comprueba tipos y suite**

Ejecuta: `pnpm typecheck && pnpm test`
Esperado: ambos en verde.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repositories/exercises.ts packages/db/src/repositories/exercises.test.ts
git commit -m "feat(db): add listExercisesByMuscleGroup repository"
```

---

### Task 3: Espacio `pick:` en `callback-data.ts`

**Files:**
- Modify: `apps/server/src/bot/callback-data.ts`
- Test: `apps/server/src/bot/callback-data.test.ts`

**Interfaces:**
- Consumes: `MUSCLE_GROUPS` de `@gym-tracker/core` (para validar que el índice está en rango).
- Produces:
  ```ts
  export type PickOrigin = 'c' | 'l';

  // en el objeto CB, añadidos a los que ya existen:
  CB.pickGroups   (origin: PickOrigin): string                                    // 'pick:c:g'
  CB.pickGroup    (origin: PickOrigin, groupIndex: number, offset: number): string // 'pick:c:g:4:10'
  CB.pickExercise (origin: PickOrigin, exerciseId: number): string                 // 'pick:c:x:37'
  CB.pickSearch   (origin: PickOrigin): string                                     // 'pick:c:s'

  // variantes nuevas de CallbackAction:
  | { type: 'pick_groups'; origin: PickOrigin }
  | { type: 'pick_group'; origin: PickOrigin; groupIndex: number; offset: number }
  | { type: 'pick_exercise'; origin: PickOrigin; exerciseId: number }
  | { type: 'pick_search'; origin: PickOrigin }
  ```
  `parseCallback` sigue devolviendo `{ type: 'unknown' }` para cualquier cosa que no encaje.

**Reglas de validación** (idénticas en espíritu a `parseIdSuffix`, que ya existe en el archivo):
- `origin` debe ser exactamente `c` o `l`.
- `groupIndex`: dígitos decimales, `0 <= idx < MUSCLE_GROUPS.length` (es decir, 0..16).
- `offset`: dígitos decimales, `>= 0`. Un offset absurdamente grande **sí parsea**; queda fuera de rango en el render (Tarea 4), que cae a la pantalla de grupos.
- `exerciseId`: dígitos decimales `> 0`.
- Nada de signos, hexadecimales, decimales ni espacios.

- [ ] **Step 1: Escribe los tests que fallan**

Añade a `apps/server/src/bot/callback-data.test.ts` un `describe` nuevo, y actualiza el import de la primera línea para traer `MUSCLE_GROUPS`:

```ts
import { MUSCLE_GROUPS } from '@gym-tracker/core';
```

```ts
describe('callback-data — pick: namespace', () => {
  it('builds every pick variant with its origin segment', () => {
    expect(CB.pickGroups('c')).toBe('pick:c:g');
    expect(CB.pickGroup('c', 4, 10)).toBe('pick:c:g:4:10');
    expect(CB.pickExercise('c', 37)).toBe('pick:c:x:37');
    expect(CB.pickSearch('c')).toBe('pick:c:s');
    expect(CB.pickGroups('l')).toBe('pick:l:g');
    expect(CB.pickGroup('l', 0, 0)).toBe('pick:l:g:0:0');
    expect(CB.pickExercise('l', 1)).toBe('pick:l:x:1');
    expect(CB.pickSearch('l')).toBe('pick:l:s');
  });

  it('round-trips every builder through the parser', () => {
    expect(parseCallback(CB.pickGroups('c'))).toEqual({ type: 'pick_groups', origin: 'c' });
    expect(parseCallback(CB.pickGroup('c', 4, 10))).toEqual({
      type: 'pick_group',
      origin: 'c',
      groupIndex: 4,
      offset: 10,
    });
    expect(parseCallback(CB.pickExercise('c', 37))).toEqual({
      type: 'pick_exercise',
      origin: 'c',
      exerciseId: 37,
    });
    expect(parseCallback(CB.pickSearch('c'))).toEqual({ type: 'pick_search', origin: 'c' });
    expect(parseCallback(CB.pickGroups('l'))).toEqual({ type: 'pick_groups', origin: 'l' });
    expect(parseCallback(CB.pickExercise('l', 1))).toEqual({
      type: 'pick_exercise',
      origin: 'l',
      exerciseId: 1,
    });
  });

  it('accepts the last valid group index and rejects the one past it', () => {
    const last = MUSCLE_GROUPS.length - 1; // 16
    expect(parseCallback(CB.pickGroup('c', last, 0))).toEqual({
      type: 'pick_group',
      origin: 'c',
      groupIndex: last,
      offset: 0,
    });
    expect(parseCallback(`pick:c:g:${MUSCLE_GROUPS.length}:0`)).toEqual({ type: 'unknown' });
  });

  it('rejects malformed pick data', () => {
    expect(parseCallback('pick:x:g')).toEqual({ type: 'unknown' }); // origen desconocido
    expect(parseCallback('pick:g')).toEqual({ type: 'unknown' }); // sin origen
    expect(parseCallback('pick:c')).toEqual({ type: 'unknown' });
    expect(parseCallback('pick:c:')).toEqual({ type: 'unknown' });
    expect(parseCallback('pick:c:z')).toEqual({ type: 'unknown' }); // pantalla desconocida
    expect(parseCallback('pick:c:g:-1:0')).toEqual({ type: 'unknown' }); // índice negativo
    expect(parseCallback('pick:c:g:2:-10')).toEqual({ type: 'unknown' }); // offset negativo
    expect(parseCallback('pick:c:g:2')).toEqual({ type: 'unknown' }); // falta el offset
    expect(parseCallback('pick:c:g:2:10:3')).toEqual({ type: 'unknown' }); // sobra un segmento
    expect(parseCallback('pick:c:g:a:0')).toEqual({ type: 'unknown' }); // índice no numérico
    expect(parseCallback('pick:c:g:0x2:0')).toEqual({ type: 'unknown' }); // hexadecimal
    expect(parseCallback('pick:c:g:2.0:0')).toEqual({ type: 'unknown' }); // decimal
    expect(parseCallback('pick:c:x:0')).toEqual({ type: 'unknown' }); // id 0
    expect(parseCallback('pick:c:x:-3')).toEqual({ type: 'unknown' });
    expect(parseCallback('pick:c:x:')).toEqual({ type: 'unknown' });
    expect(parseCallback('pick:c:x: 3')).toEqual({ type: 'unknown' }); // espacio
    expect(parseCallback('pick:c:s:1')).toEqual({ type: 'unknown' }); // sufijo de más
  });

  it('parses an offset past the end of a group without complaining', () => {
    // El parser no conoce el catálogo: el rango real lo resuelve el render.
    expect(parseCallback(CB.pickGroup('c', 0, 9990))).toEqual({
      type: 'pick_group',
      origin: 'c',
      groupIndex: 0,
      offset: 9990,
    });
  });

  it('keeps every pick payload within Telegram 64-byte callback_data limit', () => {
    const worst = CB.pickGroup('c', MUSCLE_GROUPS.length - 1, 9990);
    expect(Buffer.byteLength(worst, 'utf8')).toBeLessThanOrEqual(64);
  });
});
```

- [ ] **Step 2: Ejecuta los tests y verifica que fallan**

Ejecuta: `pnpm vitest run apps/server/src/bot/callback-data.test.ts`
Esperado: FALLA. `CB.pickGroups is not a function`.

- [ ] **Step 3: Implementa constructores y parser**

En `apps/server/src/bot/callback-data.ts`:

Añade el import arriba del todo (el archivo hoy no importa nada):

```ts
import { MUSCLE_GROUPS } from '@gym-tracker/core';
```

Añade al objeto `CB` (dentro de las llaves, antes del `} as const;`):

```ts
  pickGroups: (origin: PickOrigin): string => `pick:${origin}:g`,
  pickGroup: (origin: PickOrigin, groupIndex: number, offset: number): string =>
    `pick:${origin}:g:${groupIndex}:${offset}`,
  pickExercise: (origin: PickOrigin, exerciseId: number): string => `pick:${origin}:x:${exerciseId}`,
  pickSearch: (origin: PickOrigin): string => `pick:${origin}:s`,
```

Añade justo **encima** del objeto `CB`:

```ts
// Origen del selector de ejercicios. Un solo carácter para no gastar los 64 bytes
// de callback_data. 'c' = captura (y wizard de rutinas, que consume sus propios
// updates dentro de la conversación); 'l' = /last. Sin este segmento, el handler
// de /last —registrado antes que el catch-all de capture.ts en bot.ts— se quedaría
// con los pulsados durante una sesión de captura.
export type PickOrigin = 'c' | 'l';

const isPickOrigin = (value: string): value is PickOrigin => value === 'c' || value === 'l';
```

Añade las variantes al tipo `CallbackAction`, antes de `| { type: 'unknown' }`:

```ts
  | { type: 'pick_groups'; origin: PickOrigin }
  | { type: 'pick_group'; origin: PickOrigin; groupIndex: number; offset: number }
  | { type: 'pick_exercise'; origin: PickOrigin; exerciseId: number }
  | { type: 'pick_search'; origin: PickOrigin }
```

Añade la función auxiliar junto a `parseIdSuffix`:

```ts
// Dígitos decimales canónicos, sin signo ni notación alternativa, igual que parseIdSuffix.
function parseDecimal(raw: string): number | undefined {
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
}

function parsePick(data: string): CallbackAction {
  const parts = data.split(':'); // ['pick', origin, screen, ...]
  const origin = parts[1];
  const screen = parts[2];
  if (origin === undefined || !isPickOrigin(origin) || screen === undefined) {
    return { type: 'unknown' };
  }
  if (screen === 'g' && parts.length === 3) {
    return { type: 'pick_groups', origin };
  }
  if (screen === 'g' && parts.length === 5) {
    const groupIndex = parseDecimal(parts[3] ?? '');
    const offset = parseDecimal(parts[4] ?? '');
    if (groupIndex === undefined || offset === undefined || groupIndex >= MUSCLE_GROUPS.length) {
      return { type: 'unknown' };
    }
    return { type: 'pick_group', origin, groupIndex, offset };
  }
  if (screen === 'x' && parts.length === 4) {
    const exerciseId = parseDecimal(parts[3] ?? '');
    if (exerciseId === undefined || exerciseId <= 0) {
      return { type: 'unknown' };
    }
    return { type: 'pick_exercise', origin, exerciseId };
  }
  if (screen === 's' && parts.length === 3) {
    return { type: 'pick_search', origin };
  }
  return { type: 'unknown' };
}
```

Y en `parseCallback`, añade la rama **antes** de las de `day:` y `ex:`:

```ts
  if (data.startsWith('pick:')) {
    return parsePick(data);
  }
```

- [ ] **Step 4: Ejecuta los tests y verifica que pasan**

Ejecuta: `pnpm vitest run apps/server/src/bot/callback-data.test.ts`
Esperado: PASA, incluidos los tests que ya existían.

- [ ] **Step 5: Comprueba tipos**

Ejecuta: `pnpm typecheck`
Esperado: sin errores. Ojo: `@gym-tracker/core` ya es dependencia de `@gym-tracker/server`, no hay que declarar nada.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/bot/callback-data.ts apps/server/src/bot/callback-data.test.ts
git commit -m "feat(server): add pick: callback namespace for the exercise picker"
```

---

### Task 4: Render puro del selector (`exercise-picker.ts`)

Sin base de datos y sin Telegram: entra un estado y un mapa, sale texto y teclado. Mismo patrón que `session-view.ts`.

**Files:**
- Create: `apps/server/src/bot/exercise-picker.ts`
- Modify: `apps/server/src/bot/texts.ts`
- Test: `apps/server/src/bot/exercise-picker.test.ts`

**Interfaces:**
- Consumes: `CB`, `PickOrigin` (Tarea 3); `ExerciseOption` de `@gym-tracker/db` (Tarea 2); `MUSCLE_GROUPS`, `MUSCLE_GROUP_LABELS`, `MuscleGroup` de `@gym-tracker/core`; `InlineKeyboard` de grammy; `T` de `./texts`.
- Produces:
  ```ts
  export const PICKER_PAGE_SIZE = 10;

  export type PickerState =
    | { view: 'groups' }
    | { view: 'group'; groupIndex: number; offset: number };

  export function renderPicker(
    state: PickerState,
    origin: PickOrigin,
    byGroup: ReadonlyMap<MuscleGroup, readonly ExerciseOption[]>,
  ): { text: string; keyboard: InlineKeyboard };

  export function renderCandidates(
    candidates: readonly ExerciseOption[],
    origin: PickOrigin,
  ): { text: string; keyboard: InlineKeyboard };

  export function renderNoMatch(
    query: string,
    origin: PickOrigin,
  ): { text: string; keyboard: InlineKeyboard };
  ```

**Comportamiento exacto exigido:**

*Pantalla de grupos* (`{ view: 'groups' }`):
- Texto: `T.pickChooseGroup`.
- Un botón por cada grupo de `MUSCLE_GROUPS` **que exista como clave en `byGroup`**, con la etiqueta de `MUSCLE_GROUP_LABELS` y `callback_data` `CB.pickGroup(origin, indiceEnMUSCLE_GROUPS, 0)`. **Dos por fila**, en el orden de `MUSCLE_GROUPS`. Si el número de grupos es impar, el último va solo en su fila.
- Última fila: un botón `T.pickSearchButton` con `CB.pickSearch(origin)`.
- Si `byGroup` está vacío: texto `T.pickEmpty` y teclado con solo el botón de buscar.

*Pantalla de un grupo* (`{ view: 'group'; groupIndex; offset }`):
- Se resuelve `group = MUSCLE_GROUPS[groupIndex]`. Si el índice no existe, el grupo no está en `byGroup`, la lista está vacía, o `offset >= lista.length`, **se devuelve la pantalla de grupos** (mismo objeto que devolvería `{ view: 'groups' }`). Un `offset` que no es múltiplo de `PICKER_PAGE_SIZE` no es un error: se pagina desde ahí.
- Texto: `T.pickGroupTitle(MUSCLE_GROUP_LABELS[group])`.
- Primera fila: `T.pickBackButton` con `CB.pickGroups(origin)`.
- Después, hasta `PICKER_PAGE_SIZE` ejercicios desde `offset`, **uno por fila**, etiqueta = nombre, `callback_data` = `CB.pickExercise(origin, id)`.
- Última fila (solo si hay algo que poner): `T.pickPrevButton` con `CB.pickGroup(origin, groupIndex, offset - PICKER_PAGE_SIZE)` si `offset > 0`, y `T.pickNextButton` con `CB.pickGroup(origin, groupIndex, offset + PICKER_PAGE_SIZE)` si `offset + PICKER_PAGE_SIZE < lista.length`. Si `offset > 0` pero `offset < PICKER_PAGE_SIZE`, el `‹ Anterior` apunta a `0` (nunca a un negativo).

*Candidatos* (`renderCandidates`): texto `T.pickAmbiguous`, un botón por candidato (uno por fila, máximo 8, igual que hoy hace `last.ts`) con `CB.pickExercise(origin, id)`, y una fila final con `T.pickByGroupButton` → `CB.pickGroups(origin)`.

*Sin resultados* (`renderNoMatch`): texto `T.noMatch(query)`, un solo botón `T.pickByGroupButton` → `CB.pickGroups(origin)`.

- [ ] **Step 1: Añade los textos**

En `apps/server/src/bot/texts.ts`, dentro del objeto `T`, añade un bloque nuevo antes del cierre. **También cambia dos textos existentes**, marcados abajo:

```ts
  // Selector de ejercicios por grupo muscular (Fase 2)
  pickChooseGroup: 'Elige un grupo muscular:',
  pickSearchButton: '🔍 Buscar por nombre',
  pickBackButton: '‹ Volver',
  pickPrevButton: '‹ Anterior',
  pickNextButton: 'Siguiente ›',
  pickByGroupButton: '📂 Ver por grupo',
  pickAmbiguous: '¿Cuál de estos?',
  pickEmpty: 'No hay ejercicios disponibles.',
  pickTypeName: 'Escribe el nombre del ejercicio.',
  exerciseGoneToast: 'Ese ejercicio ya no está disponible.',
  pickGroupTitle(label: string): string {
    return `${label} — elige un ejercicio:`;
  },
```

Cambios sobre textos que ya existen:

```ts
  // ANTES: otherExerciseButton: '➕ Otro ejercicio',
  otherExerciseButton: '📂 Otro ejercicio',

  // ANTES: return `No encontré "${query}". Créalo con /routines.`;
  // (ahora el camino de salida es el botón "Ver por grupo", no una instrucción escrita)
  noMatch(query: string): string {
    return `No encontré "${query}".`;
  },
```

`T.ambiguousMatch` y `T.lastAmbiguous` quedan **sin tocar** por ahora: dejan de usarse en las Tareas 5–7 y se borran en la Tarea 8, cuando ya no haya ninguna referencia.

- [ ] **Step 2: Escribe los tests que fallan**

Crea `apps/server/src/bot/exercise-picker.test.ts`:

```ts
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '@gym-tracker/core';
import type { ExerciseOption } from '@gym-tracker/db';
import type { InlineKeyboard } from 'grammy';
import { describe, expect, it } from 'vitest';
import { CB } from './callback-data';
import { PICKER_PAGE_SIZE, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
import { T } from './texts';

// Aplana el teclado a sus callback_data, en orden de lectura.
function datas(kb: InlineKeyboard): string[] {
  return kb.inline_keyboard.flat().map((b) => (b && 'callback_data' in b ? b.callback_data ?? '' : ''));
}
// Etiquetas visibles, fila a fila.
function rows(kb: InlineKeyboard): string[][] {
  return kb.inline_keyboard.map((row) => row.map((b) => b.text));
}

const options = (n: number, from = 1): ExerciseOption[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, name: `Ejercicio ${from + i}` }));

const CHEST = MUSCLE_GROUPS.indexOf('chest');
const BICEPS = MUSCLE_GROUPS.indexOf('biceps');

const twoGroups = new Map<MuscleGroup, ExerciseOption[]>([
  ['chest', options(3)],
  ['biceps', options(2, 100)],
]);

describe('renderPicker — groups view', () => {
  it('lists only the groups that have exercises, two per row, in anatomical order', () => {
    const { text, keyboard } = renderPicker({ view: 'groups' }, 'c', twoGroups);
    expect(text).toBe(T.pickChooseGroup);
    expect(rows(keyboard)).toEqual([
      [MUSCLE_GROUP_LABELS.chest, MUSCLE_GROUP_LABELS.biceps],
      [T.pickSearchButton],
    ]);
    expect(datas(keyboard)).toEqual([
      CB.pickGroup('c', CHEST, 0),
      CB.pickGroup('c', BICEPS, 0),
      CB.pickSearch('c'),
    ]);
  });

  it('leaves the odd group alone on its last row', () => {
    const three = new Map<MuscleGroup, ExerciseOption[]>([
      ['chest', options(1)],
      ['biceps', options(1, 50)],
      ['abs', options(1, 60)],
    ]);
    expect(rows(renderPicker({ view: 'groups' }, 'c', three).keyboard)).toEqual([
      [MUSCLE_GROUP_LABELS.chest, MUSCLE_GROUP_LABELS.biceps],
      [MUSCLE_GROUP_LABELS.abs],
      [T.pickSearchButton],
    ]);
  });

  it('has no back button on the groups screen', () => {
    const { keyboard } = renderPicker({ view: 'groups' }, 'c', twoGroups);
    expect(datas(keyboard)).not.toContain(CB.pickGroups('c'));
  });

  it('carries the origin into every callback', () => {
    const { keyboard } = renderPicker({ view: 'groups' }, 'l', twoGroups);
    expect(datas(keyboard).every((d) => d.startsWith('pick:l:'))).toBe(true);
  });

  it('says there is nothing to pick when the catalog is empty', () => {
    const { text, keyboard } = renderPicker({ view: 'groups' }, 'c', new Map());
    expect(text).toBe(T.pickEmpty);
    expect(datas(keyboard)).toEqual([CB.pickSearch('c')]);
  });
});

describe('renderPicker — group view', () => {
  it('lists the exercises one per row, under a back button', () => {
    const { text, keyboard } = renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', twoGroups);
    expect(text).toBe(T.pickGroupTitle(MUSCLE_GROUP_LABELS.chest));
    expect(rows(keyboard)).toEqual([
      [T.pickBackButton],
      ['Ejercicio 1'],
      ['Ejercicio 2'],
      ['Ejercicio 3'],
    ]);
    expect(datas(keyboard)).toEqual([
      CB.pickGroups('c'),
      CB.pickExercise('c', 1),
      CB.pickExercise('c', 2),
      CB.pickExercise('c', 3),
    ]);
  });

  it('falls back to the groups view when the group index is not in the map', () => {
    const state = { view: 'group', groupIndex: MUSCLE_GROUPS.indexOf('calves'), offset: 0 } as const;
    expect(renderPicker(state, 'c', twoGroups)).toEqual(renderPicker({ view: 'groups' }, 'c', twoGroups));
  });

  it('falls back to the groups view when the offset is past the end', () => {
    const state = { view: 'group', groupIndex: CHEST, offset: 3 } as const; // solo hay 3 (0..2)
    expect(renderPicker(state, 'c', twoGroups)).toEqual(renderPicker({ view: 'groups' }, 'c', twoGroups));
  });
});

describe('renderPicker — pagination', () => {
  const big = new Map<MuscleGroup, ExerciseOption[]>([['chest', options(25)]]);
  const navRow = (offset: number): string[] =>
    rows(renderPicker({ view: 'group', groupIndex: CHEST, offset }, 'c', big)).at(-1) ?? [];

  it('shows no arrows when everything fits on one page', () => {
    const exact = new Map<MuscleGroup, ExerciseOption[]>([['chest', options(PICKER_PAGE_SIZE)]]);
    const kb = renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', exact).keyboard;
    expect(rows(kb).at(-1)).toEqual(['Ejercicio 10']); // última fila = último ejercicio
    expect(datas(kb)).not.toContain(CB.pickGroup('c', CHEST, PICKER_PAGE_SIZE));
  });

  it('shows only Next on the first page of 25', () => {
    expect(navRow(0)).toEqual([T.pickNextButton]);
  });

  it('shows both arrows on the middle page', () => {
    expect(navRow(10)).toEqual([T.pickPrevButton, T.pickNextButton]);
  });

  it('shows only Previous on the last page', () => {
    expect(navRow(20)).toEqual([T.pickPrevButton]);
  });

  it('moves the offset in steps of PICKER_PAGE_SIZE', () => {
    const kb = renderPicker({ view: 'group', groupIndex: CHEST, offset: 10 }, 'c', big).keyboard;
    const nav = datas(kb).slice(-2);
    expect(nav).toEqual([CB.pickGroup('c', CHEST, 0), CB.pickGroup('c', CHEST, 20)]);
  });

  it('shows at most one page of exercises', () => {
    const kb = renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', big).keyboard;
    const exerciseButtons = datas(kb).filter((d) => d.startsWith('pick:c:x:'));
    expect(exerciseButtons).toHaveLength(PICKER_PAGE_SIZE);
  });

  it('never builds a negative offset', () => {
    const odd = new Map<MuscleGroup, ExerciseOption[]>([['chest', options(25)]]);
    const kb = renderPicker({ view: 'group', groupIndex: CHEST, offset: 4 }, 'c', odd).keyboard;
    expect(datas(kb)).toContain(CB.pickGroup('c', CHEST, 0));
  });
});

describe('renderCandidates', () => {
  it('offers one button per candidate plus a way back to the groups', () => {
    const { text, keyboard } = renderCandidates(options(3), 'c');
    expect(text).toBe(T.pickAmbiguous);
    expect(datas(keyboard)).toEqual([
      CB.pickExercise('c', 1),
      CB.pickExercise('c', 2),
      CB.pickExercise('c', 3),
      CB.pickGroups('c'),
    ]);
  });

  it('caps the candidate list at 8', () => {
    const { keyboard } = renderCandidates(options(20), 'l');
    expect(datas(keyboard).filter((d) => d.startsWith('pick:l:x:'))).toHaveLength(8);
  });
});

describe('every rendered keyboard is well formed', () => {
  // InlineKeyboard de grammY arranca con [[]] y row() empuja una fila vacía:
  // un row() de más deja una fila sin botones, que Telegram rechaza.
  const big = new Map<MuscleGroup, ExerciseOption[]>([['chest', options(25)]]);
  const all = [
    renderPicker({ view: 'groups' }, 'c', twoGroups),
    renderPicker({ view: 'groups' }, 'c', new Map()),
    renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', twoGroups),
    renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', big),
    renderPicker({ view: 'group', groupIndex: CHEST, offset: 10 }, 'c', big),
    renderPicker({ view: 'group', groupIndex: CHEST, offset: 20 }, 'c', big),
    renderCandidates(options(3), 'c'),
    renderNoMatch('x', 'c'),
  ];

  it('has no empty rows', () => {
    for (const { keyboard } of all) {
      expect(keyboard.inline_keyboard.every((row) => row.length > 0)).toBe(true);
    }
  });

  it('has no empty callback_data', () => {
    for (const { keyboard } of all) {
      expect(datas(keyboard).every((d) => d.length > 0)).toBe(true);
    }
  });
});

describe('renderNoMatch', () => {
  it('names the failed query and offers the group menu', () => {
    const { text, keyboard } = renderNoMatch('zancada rusa', 'c');
    expect(text).toBe(T.noMatch('zancada rusa'));
    expect(text).toContain('zancada rusa');
    expect(datas(keyboard)).toEqual([CB.pickGroups('c')]);
  });
});
```

- [ ] **Step 3: Ejecuta los tests y verifica que fallan**

Ejecuta: `pnpm vitest run apps/server/src/bot/exercise-picker.test.ts`
Esperado: FALLA. `Cannot find module './exercise-picker'`.

- [ ] **Step 4: Implementa el render**

Crea `apps/server/src/bot/exercise-picker.ts`:

```ts
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '@gym-tracker/core';
import type { ExerciseOption } from '@gym-tracker/db';
import { InlineKeyboard } from 'grammy';
import { CB, type PickOrigin } from './callback-data';
import { T } from './texts';

export const PICKER_PAGE_SIZE = 10;
const MAX_CANDIDATES = 8;

export type PickerState =
  | { view: 'groups' }
  | { view: 'group'; groupIndex: number; offset: number };

export interface Rendered {
  text: string;
  keyboard: InlineKeyboard;
}

// OJO con InlineKeyboard: el constructor de grammY arranca con [[]] (una fila
// vacía ya abierta) y row() EMPUJA una fila vacía nueva. Por eso aquí se llama a
// row() ANTES de abrir cada fila, nunca después de cerrarla: el idioma
// `.text(x).row()` de session-view.ts solo es seguro cuando siempre viene otro
// botón detrás, y aquí no siempre viene (ni flechas de paginación, ni grupos).
function renderGroups(
  origin: PickOrigin,
  byGroup: ReadonlyMap<MuscleGroup, readonly ExerciseOption[]>,
): Rendered {
  const keyboard = new InlineKeyboard();
  let column = 0;
  MUSCLE_GROUPS.forEach((group, index) => {
    const options = byGroup.get(group);
    if (options === undefined || options.length === 0) {
      return; // grupos sin ejercicios disponibles no se pintan
    }
    if (column > 0 && column % 2 === 0) {
      keyboard.row(); // dos columnas
    }
    keyboard.text(MUSCLE_GROUP_LABELS[group], CB.pickGroup(origin, index, 0));
    column += 1;
  });
  if (column > 0) {
    keyboard.row();
  }
  keyboard.text(T.pickSearchButton, CB.pickSearch(origin));
  return { text: column === 0 ? T.pickEmpty : T.pickChooseGroup, keyboard };
}

export function renderPicker(
  state: PickerState,
  origin: PickOrigin,
  byGroup: ReadonlyMap<MuscleGroup, readonly ExerciseOption[]>,
): Rendered {
  if (state.view === 'groups') {
    return renderGroups(origin, byGroup);
  }
  const group = MUSCLE_GROUPS[state.groupIndex];
  const options = group === undefined ? undefined : byGroup.get(group);
  // Índice inexistente, grupo vacío u offset más allá del final: no hay pantalla
  // que pintar, así que se vuelve al menú de grupos en lugar de fallar.
  if (group === undefined || options === undefined || state.offset >= options.length) {
    return renderGroups(origin, byGroup);
  }

  // Mismo cuidado con row(): se abre fila antes de cada botón, no después.
  const keyboard = new InlineKeyboard();
  keyboard.text(T.pickBackButton, CB.pickGroups(origin));
  for (const option of options.slice(state.offset, state.offset + PICKER_PAGE_SIZE)) {
    keyboard.row().text(option.name, CB.pickExercise(origin, option.id)); // uno por fila
  }
  const hasPrev = state.offset > 0;
  const hasNext = state.offset + PICKER_PAGE_SIZE < options.length;
  if (hasPrev || hasNext) {
    keyboard.row();
    if (hasPrev) {
      keyboard.text(
        T.pickPrevButton,
        CB.pickGroup(origin, state.groupIndex, Math.max(0, state.offset - PICKER_PAGE_SIZE)),
      );
    }
    if (hasNext) {
      keyboard.text(T.pickNextButton, CB.pickGroup(origin, state.groupIndex, state.offset + PICKER_PAGE_SIZE));
    }
  }
  return { text: T.pickGroupTitle(MUSCLE_GROUP_LABELS[group]), keyboard };
}

export function renderCandidates(candidates: readonly ExerciseOption[], origin: PickOrigin): Rendered {
  const keyboard = new InlineKeyboard();
  const shown = candidates.slice(0, MAX_CANDIDATES);
  shown.forEach((candidate, index) => {
    if (index > 0) {
      keyboard.row();
    }
    keyboard.text(candidate.name, CB.pickExercise(origin, candidate.id)); // uno por fila
  });
  if (shown.length > 0) {
    keyboard.row();
  }
  keyboard.text(T.pickByGroupButton, CB.pickGroups(origin));
  return { text: T.pickAmbiguous, keyboard };
}

export function renderNoMatch(query: string, origin: PickOrigin): Rendered {
  return {
    text: T.noMatch(query),
    keyboard: new InlineKeyboard().text(T.pickByGroupButton, CB.pickGroups(origin)),
  };
}
```

> **Trampa verificada de grammY:** `new InlineKeyboard()` arranca con `inline_keyboard = [[]]` y `row()` hace `this.inline_keyboard.push(buttons)`, es decir, **empuja una fila vacía** (`grammy/out/convenience/keyboard.js:624,649`). Dos `row()` seguidos, o un `row()` final sin botón detrás, dejan filas vacías dentro del teclado. Por eso este archivo abre fila **antes** de cada fila nueva. Los tests de `rows()` de arriba son justo los que detectan el fallo si alguien cambia el idioma.

- [ ] **Step 5: Ejecuta los tests y verifica que pasan**

Ejecuta: `pnpm vitest run apps/server/src/bot/exercise-picker.test.ts`
Esperado: PASA.

- [ ] **Step 6: Ejecuta la suite y los tipos**

Ejecuta: `pnpm test && pnpm typecheck`
Esperado: verde. `session-view.test.ts` **no** debe romperse por el cambio de `otherExerciseButton` (compara `callback_data`, no etiquetas); si alguna aserción sí compara la etiqueta `➕ Otro ejercicio`, actualízala a `T.otherExerciseButton`.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/bot/exercise-picker.ts apps/server/src/bot/exercise-picker.test.ts apps/server/src/bot/texts.ts
git commit -m "feat(server): add pure exercise picker renderer"
```

---

### Task 5: Punto de entrada 1 — captura (`capture.ts`)

**Files:**
- Modify: `apps/server/src/bot/capture.ts`
- Modify: `apps/server/src/bot/session-view.ts` (nada de código: la etiqueta ya sale de `T.otherExerciseButton`, verifica y no toques si ya es así)
- Test: `apps/server/src/bot/flows.test.ts` (añadir un `describe` nuevo)

**Interfaces:**
- Consumes: `renderPicker`, `renderCandidates`, `renderNoMatch`, `type PickerState` (Tarea 4); `listExercisesByMuscleGroup`, `type ExerciseOption` (Tarea 2); las variantes `pick_*` de `CallbackAction` (Tarea 3); `matchExercise` (Tarea 1); `switchExercise`, `getSession`, `updateSession`, `getExerciseById` (ya existentes).
- Produces: nada que consuman otras tareas. Cambios internos de `capture.ts`.

**Cambios de comportamiento:**

1. `editOrSend` ya sirve para pintar el picker sobre el mensaje activo: se le pasa el `text`/`keyboard` que devuelva `renderPicker`. **No inventes otra función de envío.**
2. `sendEphemeral` gana un parámetro opcional de teclado, para que «No encontré "xxx"» pueda llevar el botón `📂 Ver por grupo`.
3. Acción `add` (botón `📂 Otro ejercicio`): en vez de mandar el efímero `T.typeExerciseName`, limpia `currentExerciseId` y **pinta el picker en el mensaje activo**.
4. Acciones `pick_groups` / `pick_group` con `origin === 'c'`: repintan el picker sobre el mensaje activo. **No** llamar a `renderActive` después (borraría el picker).
5. Acción `pick_exercise` con `origin === 'c'`: si el ejercicio no existe o está archivado → `answerCallbackQuery(T.exerciseGoneToast)` y repintar la pantalla de grupos. Si existe → `switchExercise` y `renderActive` (el mensaje pasa a la vista de ejercicio, edición in place).
6. Acción `pick_search` con `origin === 'c'`: efímero con `T.pickTypeName`; el mensaje activo se queda con el picker.
7. Acciones `pick_*` con `origin === 'l'`: **no son de la captura**. Responder `answerCallbackQuery()` y salir sin tocar nada. (En la práctica `last.ts` las intercepta antes, pero la guardia evita que un dato viejo caiga en `default`.)
8. En `handleText`, los dos sitios donde hoy se responde `T.ambiguousMatch` pasan a pintar `renderCandidates(candidatos, 'c')` **sobre el mensaje activo** con `editOrSend`; los dos donde se responde `T.noMatch(...)` pasan a mandar el efímero de `renderNoMatch(query, 'c')` con su teclado.
9. `resolveExerciseByName` deja de aplanar el caso ambiguo: debe devolver los candidatos.

- [ ] **Step 1: Escribe los tests que fallan**

Añade a `apps/server/src/bot/flows.test.ts` un `describe` nuevo al final. Añade también estos ayudantes al principio del archivo, junto a `texts()`:

```ts
// callback_data de los botones de la última llamada al método indicado.
function lastKeyboardDatas(
  outgoing: Array<{ method: string; payload: Record<string, unknown> }>,
  method: string,
): string[] {
  const call = outgoing.filter((c) => c.method === method).at(-1);
  const markup = call?.payload.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> } | undefined;
  return (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? '');
}
```

```ts
describe('exercise picker in the capture flow', () => {
  it('offers buttons instead of a dead end when the text matches several exercises', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(textUpdate(3, 'polea')); // varios candidatos en el catálogo

    const all = [...texts(outgoing, 'sendMessage'), ...texts(outgoing, 'editMessageText')].join('\n');
    expect(all).not.toContain('Sé más específico');
    const datas = [...lastKeyboardDatas(outgoing, 'editMessageText'), ...lastKeyboardDatas(outgoing, 'sendMessage')];
    expect(datas.some((x) => x.startsWith('pick:c:x:'))).toBe(true);
  });

  it('opens the group menu from the "Otro ejercicio" button', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, 'add', MSG));

    expect(texts(outgoing, 'editMessageText').join('\n')).toContain('grupo muscular');
    expect(lastKeyboardDatas(outgoing, 'editMessageText').some((x) => x.startsWith('pick:c:g:'))).toBe(true);
  });

  it('walks groups → exercise and lands in the exercise view, editing the same message', async () => {
    const d = baseDb();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const first = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'add', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(4, `pick:c:g:${chestIndex}:0`, MSG));
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toContain(`pick:c:x:${first.id}`);
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toContain('pick:c:g'); // ‹ Volver

    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(5, `pick:c:x:${first.id}`, MSG));

    expect(getSession(d, 1)?.currentExerciseId).toBe(first.id);
    // Edición in place: nada de mensajes nuevos para la vista principal.
    expect(outgoing.filter((c) => c.method === 'editMessageText').length).toBeGreaterThan(0);
    expect(texts(outgoing, 'editMessageText').join('\n')).toContain(first.name);
  });

  it('goes back from a group to the group list', async () => {
    const d = baseDb();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, `pick:c:g:${chestIndex}:0`, MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(4, 'pick:c:g', MSG));
    expect(texts(outgoing, 'editMessageText').join('\n')).toContain('grupo muscular');
  });

  it('warns and repaints the group menu when the chosen exercise is gone', async () => {
    const d = baseDb();
    const target = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    d.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(target.id);
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, `pick:c:x:${target.id}`, MSG));

    expect(getSession(d, 1)?.currentExerciseId).toBeNull(); // no se cambió de ejercicio
    const answers = outgoing.filter((c) => c.method === 'answerCallbackQuery');
    expect(answers.some((c) => String(c.payload.text ?? '').length > 0)).toBe(true);
  });

  it('offers the group menu when the typed name matches nothing', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(textUpdate(3, 'zancada rusa inexistente'));

    expect(texts(outgoing, 'sendMessage').join('\n')).toContain('No encontré');
    expect(lastKeyboardDatas(outgoing, 'sendMessage')).toContain('pick:c:g');
  });

  it('ignores a pick from another origin', async () => {
    const d = baseDb();
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'pick:l:x:1', MSG));
    expect(getSession(d, 1)?.currentExerciseId).toBeNull();
  });
});
```

Añade al bloque de imports de `flows.test.ts`:

```ts
import { MUSCLE_GROUPS } from '@gym-tracker/core';
// y añade listExercisesByMuscleGroup a la lista que ya importa de '@gym-tracker/db'
```

- [ ] **Step 2: Ejecuta los tests y verifica que fallan**

Ejecuta: `pnpm vitest run apps/server/src/bot/flows.test.ts`
Esperado: FALLA. Los `pick:c:…` caen hoy en `{ type: 'unknown' }` → `default` → `answerCallbackQuery()` y nada más; el texto ambiguo sigue diciendo «Sé más específico».

- [ ] **Step 3: Implementa los cambios en `capture.ts`**

Imports nuevos, añadidos a los que ya hay:

```ts
import { listExercisesByMuscleGroup } from '@gym-tracker/db';
import { type PickerState, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
```

`sendEphemeral` acepta un teclado opcional. `exactOptionalPropertyTypes` obliga a omitir la clave en vez de pasar `undefined`:

```ts
async function sendEphemeral(
  api: Api,
  db: DatabaseSync,
  session: BotSessionRow,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  if (session.ephemeralMessageId !== null) {
    await api.deleteMessage(session.chatId, session.ephemeralMessageId).catch(() => {});
  }
  const sent = await api.sendMessage(session.chatId, text, keyboard ? { reply_markup: keyboard } : {});
  updateSession(db, session.userId, { ephemeralMessageId: sent.message_id }, Date.now());
}
```

Un solo sitio pinta el picker sobre el mensaje activo:

```ts
async function showPicker(
  api: Api,
  db: DatabaseSync,
  session: BotSessionRow,
  state: PickerState,
): Promise<void> {
  const { text, keyboard } = renderPicker(state, 'c', listExercisesByMuscleGroup(db, session.userId));
  await editOrSend(api, db, session, text, keyboard);
}
```

`resolveExerciseByName` deja de aplanar el caso ambiguo:

```ts
type Resolved =
  | { kind: 'unique'; id: number; name: string }
  | { kind: 'ambiguous'; candidates: Array<{ id: number; name: string }> }
  | { kind: 'none' };

function resolveExerciseByName(db: DatabaseSync, session: BotSessionRow, query: string): Resolved {
  const result = matchExercise(query, poolForMatching(db, session));
  if (result.kind === 'unique') {
    return { kind: 'unique', id: result.exercise.id, name: result.exercise.name };
  }
  if (result.kind === 'ambiguous') {
    return { kind: 'ambiguous', candidates: result.candidates };
  }
  return { kind: 'none' };
}
```

En `handleCallback`, dentro del `switch (action.type)` (después de obtener `session`), sustituye el `case 'add'` y añade los casos nuevos:

```ts
    case 'add': {
      // "📂 Otro ejercicio" abre el menú de grupos en lugar de pedir que se escriba.
      updateSession(db, userId, { currentExerciseId: null }, now);
      const fresh = getSession(db, userId);
      if (fresh) {
        await showPicker(ctx.api, db, fresh, { view: 'groups' });
      }
      await ctx.answerCallbackQuery();
      return;
    }
    case 'pick_groups': {
      if (action.origin !== 'c') {
        await ctx.answerCallbackQuery();
        return;
      }
      await showPicker(ctx.api, db, session, { view: 'groups' });
      await ctx.answerCallbackQuery();
      return;
    }
    case 'pick_group': {
      if (action.origin !== 'c') {
        await ctx.answerCallbackQuery();
        return;
      }
      await showPicker(ctx.api, db, session, {
        view: 'group',
        groupIndex: action.groupIndex,
        offset: action.offset,
      });
      await ctx.answerCallbackQuery();
      return;
    }
    case 'pick_exercise': {
      if (action.origin !== 'c') {
        await ctx.answerCallbackQuery();
        return;
      }
      // El ejercicio pudo archivarse entre pintar el menú y pulsarlo: avisamos y
      // repintamos en vez de fallar con un error de clave foránea.
      const exercise = getExerciseById(db, action.exerciseId);
      if (!exercise || exercise.archived) {
        await ctx.answerCallbackQuery(T.exerciseGoneToast);
        await showPicker(ctx.api, db, session, { view: 'groups' });
        return;
      }
      switchExercise(db, { session, exerciseId: action.exerciseId, now });
      break; // sigue al renderActive común del final
    }
    case 'pick_search': {
      if (action.origin !== 'c') {
        await ctx.answerCallbackQuery();
        return;
      }
      await sendEphemeral(ctx.api, db, session, T.pickTypeName);
      await ctx.answerCallbackQuery();
      return;
    }
```

En `handleText`, los cuatro puntos de salida. Bloque de la serie con nombre de ejercicio:

```ts
    if (parsed.value.exerciseName) {
      const matched = resolveExerciseByName(db, session, parsed.value.exerciseName);
      if (matched.kind === 'ambiguous') {
        const { text: candText, keyboard } = renderCandidates(matched.candidates, 'c');
        await editOrSend(ctx.api, db, session, candText, keyboard);
        return;
      }
      if (matched.kind === 'none') {
        const { text: noneText, keyboard } = renderNoMatch(parsed.value.exerciseName, 'c');
        await sendEphemeral(ctx.api, db, session, noneText, keyboard);
        return;
      }
      switchExercise(db, { session, exerciseId: matched.id, now: Date.now() });
      current = getSession(db, userId) ?? session;
    }
```

Bloque de la búsqueda libre en estado «eligiendo ejercicio»:

```ts
  if (session.currentExerciseId === null) {
    const matched = resolveExerciseByName(db, session, text);
    if (matched.kind === 'ambiguous') {
      const { text: candText, keyboard } = renderCandidates(matched.candidates, 'c');
      await ctx.deleteMessage().catch(() => {}); // chat limpio
      await editOrSend(ctx.api, db, session, candText, keyboard);
      return;
    }
    if (matched.kind === 'none') {
      const { text: noneText, keyboard } = renderNoMatch(text, 'c');
      await sendEphemeral(ctx.api, db, session, noneText, keyboard);
      return;
    }
    switchExercise(db, { session, exerciseId: matched.id, now: Date.now() });
    await ctx.deleteMessage().catch(() => {});
    const fresh = getSession(db, userId);
    if (fresh) {
      await renderActive(ctx.api, db, fresh, restTimers);
    }
    return;
  }
```

- [ ] **Step 4: Ejecuta los tests y verifica que pasan**

Ejecuta: `pnpm vitest run apps/server/src/bot/flows.test.ts`
Esperado: PASA, incluidos los tests de regresión que ya había en el archivo.

- [ ] **Step 5: Ejecuta la suite y los tipos**

Ejecuta: `pnpm test && pnpm typecheck`
Esperado: verde.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/bot/capture.ts apps/server/src/bot/flows.test.ts
git commit -m "feat(server): use the exercise picker in the capture flow"
```

---

### Task 6: Punto de entrada 2 — `/last`

**Files:**
- Modify: `apps/server/src/bot/last.ts`
- Test: `apps/server/src/bot/last.test.ts` (añadir un `describe` de integración con el harness)

**Interfaces:**
- Consumes: `renderPicker`, `renderCandidates`, `renderNoMatch` (Tarea 4); `listExercisesByMuscleGroup` (Tarea 2); `parseCallback` (Tarea 3); `matchExercise` (Tarea 1); `renderLast` (ya existe en el archivo, sin cambios).
- Produces: nada para otras tareas.

**Cambios:**

1. `/last` **sin argumentos** deja de responder `T.lastUsage` y abre el menú de grupos (origen `l`).
2. `/last <texto>` ambiguo: `renderCandidates(candidatos, 'l')` en vez de los botones `last:<id>` a mano.
3. `/last <texto>` sin resultados: `renderNoMatch(query, 'l')`.
4. Se **sustituye** el handler `bot.callbackQuery(/^last:(\d+)$/)` por `bot.callbackQuery(/^pick:l:/)`, que parsea con `parseCallback` y trata las cuatro variantes. El espacio `last:` desaparece.
5. Navegación in place: los callbacks de grupos/grupo **editan** el mensaje (`ctx.editMessageText`). Al elegir ejercicio, ese mismo mensaje se convierte en la ficha de `/last`, con teclado vacío.
6. `T.lastUsage` deja de usarse. Se borra en la Tarea 8.
7. El regex `/^pick:l:/` garantiza que los `pick:c:` siguen llegando al catch-all de `capture.ts`, registrado después en `bot.ts`.

- [ ] **Step 1: Escribe los tests que fallan**

Añade al final de `apps/server/src/bot/last.test.ts`. Necesita el harness, así que amplía los imports:

```ts
import { MUSCLE_GROUPS } from '@gym-tracker/core';
import { listExercisesByMuscleGroup } from '@gym-tracker/db';
import { BOT_INFO, callbackUpdate, commandUpdate, makeHarness, textUpdate } from './test-harness';

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };
const LAST_MSG = 800;

function callTexts(
  outgoing: Array<{ method: string; payload: Record<string, unknown> }>,
  method: string,
): string[] {
  return outgoing.filter((c) => c.method === method).map((c) => String(c.payload.text ?? ''));
}

function lastKeyboardDatas(
  outgoing: Array<{ method: string; payload: Record<string, unknown> }>,
  method: string,
): string[] {
  const call = outgoing.filter((c) => c.method === method).at(-1);
  const markup = call?.payload.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> } | undefined;
  return (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? '');
}
```

```ts
describe('/last with the exercise picker', () => {
  it('opens the group menu when called with no argument', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));

    expect(callTexts(outgoing, 'sendMessage').join('\n')).toContain('grupo muscular');
    expect(lastKeyboardDatas(outgoing, 'sendMessage').some((x) => x.startsWith('pick:l:g:'))).toBe(true);
  });

  it('offers candidate buttons for an ambiguous query', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(textUpdate(1, '/last polea'));

    expect(callTexts(outgoing, 'sendMessage').join('\n')).not.toContain('Sé más específico');
    expect(lastKeyboardDatas(outgoing, 'sendMessage').some((x) => x.startsWith('pick:l:x:'))).toBe(true);
  });

  it('offers the group menu when the query matches nothing', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(textUpdate(1, '/last zancada rusa inexistente'));

    expect(callTexts(outgoing, 'sendMessage').join('\n')).toContain('No encontré');
    expect(lastKeyboardDatas(outgoing, 'sendMessage')).toContain('pick:l:g');
  });

  it('navigates groups in place and shows the history for the chosen exercise', async () => {
    const d = db();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const first = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);

    await bot.handleUpdate(commandUpdate(1, 'last'));
    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(2, `pick:l:g:${chestIndex}:0`, LAST_MSG));
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toContain(`pick:l:x:${first.id}`);

    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(3, `pick:l:x:${first.id}`, LAST_MSG));
    expect(callTexts(outgoing, 'editMessageText').join('\n')).toContain(first.name);
  });

  it('goes back to the group list from a group', async () => {
    const d = db();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    await bot.handleUpdate(callbackUpdate(2, `pick:l:g:${chestIndex}:0`, LAST_MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, 'pick:l:g', LAST_MSG));
    expect(callTexts(outgoing, 'editMessageText').join('\n')).toContain('grupo muscular');
  });

  it('asks for a name from the search button', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(2, 'pick:l:s', LAST_MSG));
    const answered = outgoing.filter((c) => c.method === 'answerCallbackQuery');
    expect(answered.some((c) => String(c.payload.text ?? '').length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecuta los tests y verifica que fallan**

Ejecuta: `pnpm vitest run apps/server/src/bot/last.test.ts`
Esperado: FALLA. `/last` sin argumento responde hoy `Uso: /last <ejercicio>` y no existe ningún handler de `pick:l:`.

- [ ] **Step 3: Implementa los cambios en `last.ts`**

Reemplaza la función `registerLast` completa (deja `renderLast` y `localDate` intactos) por:

```ts
export function registerLast(bot: Bot<CustomContext>, db: DatabaseSync, config: { timezone: string }): void {
  const groupsView = (userId: number) =>
    renderPicker({ view: 'groups' }, 'l', listExercisesByMuscleGroup(db, userId));

  bot.command('last', async (ctx) => {
    const query = (ctx.match ?? '').toString().trim();
    if (!query) {
      // Sin argumentos: menú navegable en lugar del texto de ayuda.
      const { text, keyboard } = groupsView(ctx.user.id);
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
    const pool = listCatalogAndOwn(db, ctx.user.id).map((e) => ({ id: e.id, name: e.name }));
    const match = matchExercise(query, pool);
    if (match.kind === 'none') {
      const { text, keyboard } = renderNoMatch(query, 'l');
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
    if (match.kind === 'ambiguous') {
      const { text, keyboard } = renderCandidates(match.candidates, 'l');
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
    await ctx.reply(renderLast(db, { userId: ctx.user.id, exerciseId: match.exercise.id, timezone: config.timezone }));
  });

  // Solo el origen 'l': los pick:c: son de la captura y deben llegar al catch-all
  // de capture.ts, que se registra después de este handler en bot.ts.
  bot.callbackQuery(/^pick:l:/, async (ctx) => {
    const action = parseCallback(ctx.callbackQuery.data ?? '');
    const userId = ctx.user.id;

    if (action.type === 'pick_search') {
      await ctx.answerCallbackQuery(T.pickTypeName);
      return;
    }
    if (action.type === 'pick_groups' || action.type === 'pick_group') {
      const state: PickerState =
        action.type === 'pick_groups'
          ? { view: 'groups' }
          : { view: 'group', groupIndex: action.groupIndex, offset: action.offset };
      const { text, keyboard } = renderPicker(state, 'l', listExercisesByMuscleGroup(db, userId));
      await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => {});
      await ctx.answerCallbackQuery();
      return;
    }
    if (action.type === 'pick_exercise') {
      const exercise = getExerciseById(db, action.exerciseId);
      if (!exercise || exercise.archived) {
        await ctx.answerCallbackQuery(T.exerciseGoneToast);
        const { text, keyboard } = groupsView(userId);
        await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => {});
        return;
      }
      const text = renderLast(db, { userId, exerciseId: action.exerciseId, timezone: config.timezone });
      await ctx.editMessageText(text, { reply_markup: new InlineKeyboard() }).catch(() => {});
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.answerCallbackQuery();
  });
}
```

Ajusta los imports del archivo:

```ts
import { getExerciseById, listCatalogAndOwn, listExercisesByMuscleGroup, listHistorySetsForExercise, type SetRow } from '@gym-tracker/db';
import { parseCallback } from './callback-data';
import { type PickerState, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
```

`InlineKeyboard` ya se importa de grammy en este archivo.

- [ ] **Step 4: Ejecuta los tests y verifica que pasan**

Ejecuta: `pnpm vitest run apps/server/src/bot/last.test.ts`
Esperado: PASA, incluidos los dos tests de `renderLast` que ya había.

- [ ] **Step 5: Verifica que la captura sigue recibiendo lo suyo**

Ejecuta: `pnpm vitest run apps/server/src/bot/flows.test.ts`
Esperado: PASA. Esto confirma que `/^pick:l:/` no está robándole los `pick:c:` a `capture.ts`.

- [ ] **Step 6: Suite y tipos**

Ejecuta: `pnpm test && pnpm typecheck`
Esperado: verde.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/bot/last.ts apps/server/src/bot/last.test.ts
git commit -m "feat(server): use the exercise picker in /last"
```

---

### Task 7: Punto de entrada 3 — wizard de `/routines`

El más delicado: `@grammyjs/conversations` **reejecuta la conversación entera desde el principio** en cada update para reconstruir su estado. Cualquier lectura de base de datos suelta se ejecutaría varias veces. **Toda** llamada a `listExercisesByMuscleGroup`, `getExerciseById` o `listCatalogAndOwn` dentro de la conversación va envuelta en `conversation.external(...)`. Sin excepciones.

**Files:**
- Modify: `apps/server/src/bot/routines-wizard.ts`
- Test: `apps/server/src/bot/routines-wizard.test.ts` (añadir un `describe`)

**Interfaces:**
- Consumes: `renderPicker`, `renderCandidates`, `renderNoMatch`, `type PickerState` (Tarea 4); `listExercisesByMuscleGroup` (Tarea 2); `parseCallback` (Tarea 3); `matchExercise` (Tarea 1).
- Produces: nada para otras tareas.

**Cambios:**

1. En `addExercisesToDay`, el teclado del prompt `T.dayAskExercise` gana un botón `T.pickByGroupButton` con `CB.pickGroups('c')`, junto a los de crear propio y Listo.
2. Un helper nuevo, `pickExerciseByGroup(conversation, ctx, db, userId)`, que bucle: pinta el picker, espera un callback `pick:c:*`, y devuelve `number | undefined` (`undefined` = el usuario pulsó buscar, que devuelve el control al prompt de texto).
3. La rama ambigua deja de construir botones `wizard:pick:<id>` a mano: usa `renderCandidates(candidatos, 'c')` y espera un callback `pick:c:x:<id>` o `pick:c:g` (volver al menú). El espacio `wizard:pick:` desaparece.
4. La rama sin resultados usa `renderNoMatch(query, 'c')`; si el usuario pulsa el botón, entra en `pickExerciseByGroup`.

- [ ] **Step 1: Escribe los tests que fallan**

Añade al final de `apps/server/src/bot/routines-wizard.test.ts`:

```ts
import { MUSCLE_GROUPS } from '@gym-tracker/core';
import { listExercisesByMuscleGroup } from '@gym-tracker/db';

describe('/routines wizard with the exercise picker', () => {
  it('adds an exercise picked from the group menu, without typing its name', async () => {
    const d = db();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const target = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Empuje'));
    await bot.handleUpdate(callbackUpdate(next(), 'pick:c:g', 700)); // "Ver por grupo"
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:g:${chestIndex}:0`, 700));
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:x:${target.id}`, 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:skiptargets', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:daydone', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:done', 700));

    const routines = listRoutines(d, 1);
    const days = listRoutineDays(d, routines[0]!.id);
    const exercises = listRoutineExerciseDetails(d, days[0]!.id);
    expect(exercises.map((x) => x.exerciseId)).toEqual([target.id]);
  });

  it('turns an ambiguous typed query into candidate buttons', async () => {
    const d = db();
    const candidates = listCatalogAndOwn(d, 1).filter((e) =>
      e.name.toLowerCase().includes('polea'),
    );
    expect(candidates.length).toBeGreaterThan(1); // premisa del test
    const chosen = candidates[0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Tirón'));
    outgoing.length = 0;
    await bot.handleUpdate(textUpdate(next(), 'polea'));

    const datas = outgoing
      .filter((c) => c.method === 'sendMessage')
      .flatMap((c) => {
        const markup = c.payload.reply_markup as
          | { inline_keyboard?: Array<Array<{ callback_data?: string }>> }
          | undefined;
        return (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? '');
      });
    expect(datas.some((x) => x.startsWith('pick:c:x:'))).toBe(true);

    await bot.handleUpdate(callbackUpdate(next(), `pick:c:x:${chosen.id}`, 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:skiptargets', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:daydone', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:done', 700));

    const days = listRoutineDays(d, listRoutines(d, 1)[0]!.id);
    expect(listRoutineExerciseDetails(d, days[0]!.id).map((x) => x.exerciseId)).toEqual([chosen.id]);
  });
});
```

Añade `listCatalogAndOwn` a los imports de `@gym-tracker/db` del archivo de test.

- [ ] **Step 2: Ejecuta los tests y verifica que fallan**

Ejecuta: `pnpm vitest run apps/server/src/bot/routines-wizard.test.ts`
Esperado: FALLA. `conversation.wait()` recibe el `pick:c:g` pero no lo reconoce, así que el bucle vuelve a preguntar y la rutina acaba sin ejercicios.

- [ ] **Step 3: Implementa los cambios en `routines-wizard.ts`**

Imports nuevos:

```ts
import { listExercisesByMuscleGroup } from '@gym-tracker/db';
import { CB } from './callback-data';
import { parseCallback } from './callback-data';
import { type PickerState, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
```

Helper nuevo, encima de `addExercisesToDay`:

```ts
// Devuelve el id elegido, o undefined si el usuario pidió buscar por nombre.
// TODA lectura de base de datos va en conversation.external: el motor de replay
// reejecuta esta función desde el principio en cada update.
async function pickExerciseByGroup(
  conversation: WizardConversation,
  ctx: Context,
  db: DatabaseSync,
  userId: number,
): Promise<number | undefined> {
  let state: PickerState = { view: 'groups' };
  for (;;) {
    const view = await conversation.external(() =>
      renderPicker(state, 'c', listExercisesByMuscleGroup(db, userId)),
    );
    await ctx.reply(view.text, { reply_markup: view.keyboard });
    const resp = await conversation.waitForCallbackQuery(/^pick:c:/);
    await resp.answerCallbackQuery();
    const action = parseCallback(resp.callbackQuery.data ?? '');
    if (action.type === 'pick_exercise') {
      return action.exerciseId;
    }
    if (action.type === 'pick_search') {
      return undefined;
    }
    state =
      action.type === 'pick_group'
        ? { view: 'group', groupIndex: action.groupIndex, offset: action.offset }
        : { view: 'groups' };
  }
}
```

En `addExercisesToDay`, el teclado del prompt gana el botón nuevo:

```ts
    await ctx.reply(T.dayAskExercise, {
      reply_markup: new InlineKeyboard()
        .text(T.pickByGroupButton, CB.pickGroups('c'))
        .row()
        .text(T.createOwnButton, 'wizard:createown')
        .row()
        .text(T.doneButton, 'wizard:daydone'),
    });
```

Y el cuerpo del bucle, sustituyendo desde `let exerciseId: number | undefined;` hasta el cierre del `else { continue; }`:

```ts
    let exerciseId: number | undefined;
    if (data === 'wizard:createown') {
      await resp.answerCallbackQuery();
      exerciseId = await createOwnExercise(conversation, ctx, db, userId);
    } else if (data !== undefined && data.startsWith('pick:c:')) {
      await resp.answerCallbackQuery();
      exerciseId = await pickExerciseByGroup(conversation, ctx, db, userId);
      if (exerciseId === undefined) {
        continue; // el usuario pidió buscar por nombre: vuelve al prompt de texto
      }
    } else if (resp.message?.text) {
      const query = resp.message.text.trim();
      const pool = await conversation.external(() =>
        listCatalogAndOwn(db, userId).map((e) => ({ id: e.id, name: e.name })),
      );
      const match = matchExercise(query, pool);
      if (match.kind === 'none') {
        const view = renderNoMatch(query, 'c');
        await ctx.reply(view.text, { reply_markup: view.keyboard });
        const back = await conversation.waitForCallbackQuery(/^pick:c:g$/);
        await back.answerCallbackQuery();
        exerciseId = await pickExerciseByGroup(conversation, ctx, db, userId);
        if (exerciseId === undefined) {
          continue;
        }
      } else if (match.kind === 'ambiguous') {
        const view = renderCandidates(match.candidates, 'c');
        await ctx.reply(view.text, { reply_markup: view.keyboard });
        const pickCtx = await conversation.waitForCallbackQuery(/^pick:c:/);
        await pickCtx.answerCallbackQuery();
        const action = parseCallback(pickCtx.callbackQuery.data ?? '');
        if (action.type === 'pick_exercise') {
          exerciseId = action.exerciseId;
        } else {
          exerciseId = await pickExerciseByGroup(conversation, ctx, db, userId);
          if (exerciseId === undefined) {
            continue;
          }
        }
      } else {
        exerciseId = match.exercise.id;
      }
    } else {
      continue;
    }
```

La guardia que ya existe justo después (`if (exerciseId === undefined || Number.isNaN(exerciseId)) continue;`) se mantiene tal cual.

- [ ] **Step 4: Ejecuta los tests y verifica que pasan**

Ejecuta: `pnpm vitest run apps/server/src/bot/routines-wizard.test.ts`
Esperado: PASA, incluido el happy path que ya existía.

- [ ] **Step 5: Suite y tipos**

Ejecuta: `pnpm test && pnpm typecheck`
Esperado: verde.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/bot/routines-wizard.ts apps/server/src/bot/routines-wizard.test.ts
git commit -m "feat(server): use the exercise picker in the routines wizard"
```

---

### Task 8: Limpieza de textos muertos y verificación final

**Files:**
- Modify: `apps/server/src/bot/texts.ts`
- Modify: `CONTRIBUTING.md:76-77` (la cifra de referencia de la suite)

**Interfaces:**
- Consumes: el estado del repo tras las Tareas 1–7.
- Produces: nada.

- [ ] **Step 1: Comprueba que los textos viejos ya no se usan**

Ejecuta: `grep -rn "ambiguousMatch\|lastAmbiguous\|lastUsage\|typeExerciseName\|wizard:pick\|last:" --include=*.ts apps packages`
Esperado: **cero resultados** en código de producción. Si aparece alguno, el cambio de la tarea correspondiente quedó a medias: arréglalo antes de seguir.

- [ ] **Step 2: Borra las cuatro claves muertas de `texts.ts`**

Elimina de `T` estas líneas, y solo estas:

```ts
  typeExerciseName: 'Escribe el nombre del ejercicio a añadir.',
  ambiguousMatch: 'Varios ejercicios coinciden. Sé más específico.',
  lastUsage: 'Uso: /last <ejercicio>. Ej.: /last press banca.',
  lastAmbiguous: '¿Cuál de estos?',
```

- [ ] **Step 3: Comprueba que nada se rompe**

Ejecuta: `pnpm typecheck`
Esperado: sin errores. Un error aquí significa que quedaba una referencia; si es un test, actualízalo al texto nuevo (`T.pickTypeName`, `T.pickAmbiguous`).

- [ ] **Step 4: Ejecuta la verificación completa del proyecto**

Ejecuta: `pnpm test && pnpm typecheck && pnpm --filter @gym-tracker/web build`
Esperado: los tres en verde, con la salida a la vista. Apunta el número de tests y de archivos que reporta Vitest.

- [ ] **Step 5: Actualiza la cifra de referencia de la suite**

En `CONTRIBUTING.md`, sustituye la cifra de las líneas 76-77 por la que acabas de ver:

```markdown
Referencia de lo que debe salir en verde ahora mismo: **N tests en M archivos**
(X en `node`, 61 en `web`).
```

Usa los números reales de la salida de `pnpm test`. La cifra de `web` no debería moverse: esta fase no toca `apps/web`.

- [ ] **Step 6: Prueba manual en Telegram**

Los tests de integración no ven cómo queda el teclado en pantalla. Arranca el bot y recorre los tres caminos:

```bash
# PowerShell
$env:TELEGRAM_BOT_TOKEN = '…'; $env:ALLOWED_TELEGRAM_IDS = '…'
pnpm --filter @gym-tracker/server start
```

Comprueba, en este orden:
1. `/start` → entrenar libre → escribe `polea` → salen botones, no un texto muerto.
2. Pulsa `📂 Otro ejercicio` → menú de grupos en dos columnas → entra en Pecho → elige uno → el **mismo mensaje** pasa a la vista del ejercicio. No hay menús huérfanos en el chat.
3. Escribe `jalon` (sin tilde) → encuentra `Jalón al pecho en polea`.
4. `/last` sin argumentos → menú de grupos, navegable hasta la ficha de un ejercicio.
5. `/routines` → nueva rutina → en el prompt de ejercicio, `📂 Ver por grupo` → elige uno sin escribir nada.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/bot/texts.ts CONTRIBUTING.md
git commit -m "chore(server): drop copy replaced by the exercise picker"
```

---

## Cobertura del spec

| Requisito del spec | Dónde se implementa |
|---|---|
| §3.1 `exercise-picker.ts`, render puro | Tarea 4 |
| §3.2 Espacio `pick:` en `callback-data.ts` | Tarea 3 (con el segmento de origen añadido, ver arriba) |
| §3.3 `listExercisesByMuscleGroup` | Tarea 2 |
| §3.4 Normalización sin diacríticos y coincidencia por términos | Tarea 1 |
| §3.5 Los tres puntos de entrada | Tareas 5, 6, 7 |
| §4 Pantalla de grupos, dos columnas, orden anatómico, grupos vacíos ocultos | Tarea 4 |
| §4 Pantalla de un grupo, uno por fila, `‹ Volver` | Tarea 4 |
| §4 Paginación simétrica de 10 en 10 | Tarea 4 |
| §4 Edición in place | Tareas 5, 6 (`editOrSend` / `editMessageText`) |
| §4 Búsqueda sin resultados con `📂 Ver por grupo` | Tarea 4 (`renderNoMatch`), usada en 5, 6, 7 |
| §4 Búsqueda con varios resultados como botones en los tres flujos | Tarea 4 (`renderCandidates`), usada en 5, 6, 7 |
| §4 `➕ Otro ejercicio` → `📂 Otro ejercicio` y abre grupos | Tarea 4 (texto), Tarea 5 (comportamiento) |
| §4 `/last` sin argumentos abre el menú | Tarea 6 |
| §5 Estado entero en el `callback_data`, nada en `bot_sessions` | Tareas 3 y 4, por construcción |
| §6 Índice/offset fuera de rango | Tarea 3 (índice → `unknown`), Tarea 4 (offset → vuelta a grupos) |
| §6 Ejercicio archivado entre pintado y toque | Tareas 5 y 6 |
| §6 `message is not modified` | Ya cubierto por `isNotModified` en `capture.ts`; `/last` usa `.catch(() => {})` |
| §6 Wizard: toda lectura en `conversation.external` | Tarea 7 |
| §7 Tests puros de render, paginación, `parseCallback`, `matchExercise` | Tareas 1, 3, 4 |
| §7 Tests de integración de repositorio y de los tres puntos de entrada | Tareas 2, 5, 6, 7 |

**Fuera de alcance, confirmado:** crear ejercicios propios desde la captura, alias o sinónimos, tolerancia a erratas por distancia de edición, modo inline de Telegram, cambios de esquema o migraciones.
