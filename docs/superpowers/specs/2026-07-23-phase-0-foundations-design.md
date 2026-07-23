# Diseño — Fase 0: Fundaciones (Gym Tracker Bot)

Fecha: 2026-07-23
Estado: aprobado por el autor en sesión de brainstorming
Documento padre: `SPEC.md` (especificación general del proyecto)

## Alcance

La Fase 0 entrega tres cosas y nada más:

1. Raíz del monorepo pnpm con tooling compartido.
2. `packages/db`: esquema Drizzle completo, migraciones generadas y runner de migraciones.
3. `packages/core`: toda la lógica de dominio pura, con su suite de tests.

Ni una línea de Telegram, HTTP, frontend ni instalador. `apps/server`, `apps/web` y
`cli/` no se crean todavía, ni siquiera vacíos.

**Criterio de aceptación** (de `SPEC.md`): los tests calculan volumen, 1RM, récords y
estancamiento sobre datos ficticios.

## Decisiones resueltas en brainstorming

| Decisión | Resolución | Motivo |
|---|---|---|
| Definición de "semana" | Semana calendario ISO (lunes–domingo) en la zona horaria del usuario, para volumen, estancamiento y comparaciones del dashboard | Una sola noción consistente; hace el conteo de estancamiento bien definido y coincide con cómo piensa el usuario de gimnasio |
| Regla de estancamiento | ≥ N semanas ISO entrenadas posteriores a la semana del récord vigente sin superarlo estrictamente; N configurable, default 3 | Sin falsas alarmas en ejercicios nuevos; umbral como parámetro para exponerlo como configuración más adelante |
| `muscle_group` | Enum fijo del sistema, 17 grupos con granularidad (deltoides y espalda separados) | Analítica consistente y comparable con la banda 10–20 series; sin fragmentación por texto libre |
| Estructura de `core` | Módulos de funciones puras por métrica, sobre arrays de tipos propios | Es literalmente el contrato de la spec: "reciben datos, devuelven datos"; cada métrica se testea aislada |
| 1RM con reps = 1 | Special-case: el 1RM de un single es el peso levantado; Epley solo para reps ≥ 2 | Epley con reps=1 sobreestima un 3.3%; un single ES una repetición máxima real |
| Fechas en `core` | Cero dependencias: conversión UTC→fecha local con `Intl.DateTimeFormat` nativo | Árbol de dependencias mínimo (principio 4 de la spec); Intl existe en Node y navegador |

## Monorepo y tooling

```
pnpm-workspace.yaml
tsconfig.base.json        # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
package.json              # scripts raíz: test, typecheck
packages/
  core/                   # cero deps de runtime
  db/                     # drizzle-orm, drizzle-kit
```

- Runner de tests: **Vitest** en todos los paquetes, ejecutado desde la raíz.
- Node **22.5+** (requerido por `node:sqlite`), pineado en `engines` y `.nvmrc`.
- Dependencias totales de la fase: `typescript`, `vitest`, `drizzle-orm`, `drizzle-kit`,
  `@types/node`. Sin linter ni formateador por ahora; se justificarán si hacen falta.
- Driver SQLite: `node:sqlite` con Drizzle. **Prohibido `better-sqlite3`** (spec §3).
- Los tipos de dominio los define `core`; `db` mapea sus filas hacia ellos. `core` no
  importa nada de `db` ni de Drizzle.

## Esquema de datos (`packages/db`)

Las ocho tablas de `SPEC.md` §4 con estas decisiones concretas:

- **PKs**: enteros autoincrementales (SQLite local, un solo escritor; ULIDs no aportan).
- **Timestamps**: epoch-ms UTC (modo `timestamp` de Drizzle). La zona horaria vive en
  `users.timezone` (IANA, p. ej. `America/Guatemala`) y solo se aplica al derivar
  semanas y días.
- **Booleanos** (`is_warmup`, `is_custom`, `archived`, `is_active`): entero 0/1 en modo
  boolean de Drizzle.
- **`weight_kg`**: `real`. **`rpe`**: `real` nullable (permite 8.5). **`reps`**: entero.
- **`muscle_group`**: `text` con `CHECK` contra el enum del sistema.
- **Índices**: `sets(workout_id)`, `sets(exercise_id, created_at)` (histórico por
  ejercicio, la consulta más frecuente), `workouts(user_id, started_at)`.
  `processed_updates.update_id` es PK.
- **FKs** declaradas en todas las relaciones; borrado físico no existe para entidades
  con histórico (spec §4), así que no hay cascadas de borrado.

### Enum de grupos musculares

Identificador en inglés (valor almacenado) / etiqueta en español (UI):

`chest` pecho · `front_delt` deltoide anterior · `side_delt` deltoide lateral ·
`rear_delt` deltoide posterior · `lats` dorsal · `upper_back` espalda alta ·
`lower_back` lumbar · `traps` trapecio · `biceps` bíceps · `triceps` tríceps ·
`forearms` antebrazo · `abs` abdominales · `quads` cuádriceps · `hamstrings` femorales ·
`glutes` glúteos · `adductors` aductores · `calves` gemelos

### Migraciones

- Generadas con `drizzle-kit generate`, versionadas en el repo.
- Runner propio en `packages/db`: función `runMigrations(db)` que aplica las pendientes;
  se invocará en cada arranque del server (fases posteriores). Idempotente: correrla dos
  veces no falla ni duplica.

## `packages/core` — módulos y contratos

```
packages/core/src/
  types.ts        # MuscleGroup, tipos estructurales de entrada
  weeks.ts        # isoWeekKey, comparación de claves de semana
  tonnage.ts      # setTonnage, sessionTonnage
  volume.ts       # weeklyVolumeByMuscleGroup
  one-rep-max.ts  # estimate1RM, session1RM
  records.ts      # detectPersonalRecords
  stagnation.ts   # detectStagnation
  set-parser.ts   # parseSetInput
  rest.ts         # deriveRestSeconds
```

Todas las funciones son puras y deterministas: el "ahora" y la zona horaria siempre
entran como parámetros, nunca se leen del sistema. Cada función pide el tipo
estructural mínimo que necesita (p. ej. `{ weightKg, reps, isWarmup, createdAt }`),
no registros completos, para que los fixtures de test sean diminutos.

### `weeks.ts`

`isoWeekKey(utcDate: Date, timeZone: string): string` → `"2026-W30"`.

Única puerta de entrada al concepto "semana". Convierte el instante UTC a fecha local
con `Intl.DateTimeFormat` (`timeZone`) y aplica el cálculo de semana ISO-8601 puro
(lunes como primer día; la semana 1 es la que contiene el primer jueves del año).
Resuelve el caso de la spec §9: una serie a las 8 PM en UTC-6 cae en su día local, no
en el día siguiente UTC. Incluye comparador para ordenar claves cronológicamente.

### `tonnage.ts`

- `setTonnage(set): number` = `weightKg × reps`.
- `sessionTonnage(sets): number` = suma sobre series efectivas (`isWarmup === false`).

### `volume.ts`

`weeklyVolumeByMuscleGroup(sets, muscleGroupByExerciseId, { weekKey, timeZone })`
→ `Map<MuscleGroup, number>`: conteo de series efectivas cuya semana ISO coincide con
`weekKey`, agrupado por músculo. El mapa solo contiene grupos con al menos una serie;
rellenar ceros para los 17 grupos es responsabilidad de la capa de presentación. La
comparación "esta semana vs. la anterior" del dashboard son dos invocaciones con claves
distintas.

### `one-rep-max.ts`

- `estimate1RM(weightKg, reps)`: si `reps === 1`, devuelve `weightKg`; si `reps ≥ 2`,
  Epley: `weightKg × (1 + reps / 30)`.
- `session1RM(sets)`: máximo de `estimate1RM` entre las series efectivas; `undefined`
  si no hay ninguna.

### `records.ts`

`detectPersonalRecords(historySets, sessionSets)`: récords logrados en la sesión frente
al máximo histórico previo de 1RM estimado, por ejercicio. Comparación **estricta**:
igualar el máximo no es récord. Devuelve el 1RM nuevo y el anterior para el mensaje de
`/finish`.

### `stagnation.ts`

`detectStagnation(sets, { weeks = 3, timeZone, now }): StagnationResult`

Opera sobre las series de **un solo ejercicio**; recorrer el catálogo y agregar los
resultados es responsabilidad del llamador. Algoritmo:

1. Filtrar series efectivas y agruparlas por semana ISO (en `timeZone`).
2. Calcular el mejor 1RM estimado de cada semana entrenada.
3. Localizar la **primera** semana que fijó el máximo histórico (la "semana del récord").
4. Contar las semanas entrenadas **estrictamente posteriores** a la semana del récord.
5. Estancado ⇔ ese conteo es `≥ weeks` y ninguna de esas semanas superó
   **estrictamente** el máximo.

Reglas derivadas:

- Con menos de `weeks` semanas entrenadas después del récord, **nunca** se marca
  estancado: los ejercicios nuevos o esporádicos no generan falsas alarmas.
- Igualar el récord en una semana posterior **no** lo renueva ni resetea el conteo.
- Las semanas calendario sin entrenar ese ejercicio no cuentan (spec §5).
- La semana actual cuenta como entrenada si tiene al menos una serie efectiva.

Si el ejercicio está estancado, el resultado incluye: clave de semana del récord, 1RM
del récord, número de semanas entrenadas sin superarlo y mejor 1RM del periodo
estancado — lo que la alerta del dashboard necesita para ser accionable.

### `set-parser.ts`

`parseSetInput(text: string): ParseResult`

Gramática (siempre peso primero):

```
[nombre-ejercicio] peso [kg] ('x'|'×'|'X') reps ['rpe' valor]
```

- Tolerante a: espacios alrededor de la `x`, mayúsculas/minúsculas, coma decimal
  (`32,5x10` ≡ `32.5x10`), sufijo `kg` opcional, espacios múltiples.
- `rpe` acepta decimales (`rpe 8.5`, `rpe8,5`).
- Validación semántica dentro del parser: `peso > 0`, `reps ≥ 1` (entero),
  `rpe` entre 1 y 10 si está presente. Violar cualquiera produce `{ ok: false }` con su
  código de razón.
- El nombre de ejercicio se devuelve como texto crudo (`exerciseName?: string`); el
  matching contra el catálogo es responsabilidad de la Fase 1, no del parser.
- Retorno: unión discriminada
  `{ ok: true, value: ParsedSet } | { ok: false, reason: ParseErrorReason }`.
  `reason` es un código (p. ej. `'missing_reps'`, `'invalid_weight'`); traducirlo a un
  mensaje en español es responsabilidad del bot.

### `rest.ts`

`deriveRestSeconds(sets)`: diferencia en segundos entre `createdAt` de series
consecutivas del mismo workout, en orden de `position`. La primera serie no tiene
descanso (`undefined`). No se pide nunca al usuario (spec §5).

## Manejo de errores

- `core` **nunca lanza** por entrada de usuario: el parser devuelve
  `{ ok: false, reason }`.
- Argumentos que violan invariantes de programación (p. ej. `weeks < 1`, timezone
  inválida) lanzan `Error` inmediatamente: son bugs del llamador, no datos del usuario.
- Funciones sobre colecciones vacías devuelven el neutro obvio (`0`, `Map` vacío,
  `undefined`, lista vacía), nunca lanzan.

## Testing

Tests colocados junto al código (`stagnation.test.ts` al lado de `stagnation.ts`),
Vitest, ejecutables con un solo comando desde la raíz.

**`core`** — prioridad absoluta (spec §10). Casos mínimos exigidos:

- *Estancamiento* (suite exhaustiva): sin historial; una sola semana entrenada; menos
  de N semanas tras el récord (no marca); exactamente N (marca); huecos de semanas sin
  entrenar (no cuentan); récord igualado después (no renueva); récord superado (resetea);
  umbral N ≠ 3; series al filo de medianoche en UTC-6 que cambian de semana según la
  zona; warmups excluidos del cálculo.
- *Parser* (tabla de casos): `60x8`, `60 x 8`, `60X8`, `32,5x10`, `60x8 rpe8`,
  `press inclinado 32.5x10`, `100kg x 5`, y los inválidos: vacío, `x8`, `60x`,
  `60x0`, peso negativo, basura arbitraria.
- *Semanas*: cambio de año ISO (29 dic–4 ene), instante UTC que cae en día local
  anterior (8 PM UTC-6), zonas con offset no entero de hora.
- *1RM*: reps=1 (special-case), reps=2, decimales; *récords*: estricto vs. igualado;
  *tonelaje y volumen*: exclusión de warmups, colecciones vacías.

**`db`**: aplicar todas las migraciones contra `:memory:` y verificar tablas, columnas,
índices y CHECK del enum; el runner es idempotente (segunda pasada no falla).

## Fuera de alcance de la Fase 0

Bot, API, dashboard, instalador, repositorios de datos (llegan con la Fase 1), seed del
catálogo base de ejercicios (decisión abierta §13.3, se consultará en la Fase 1),
matching difuso de nombres de ejercicio, y cualquier optimización de rendimiento.
