# Selector de ejercicios por grupo muscular (Fase 2)

Fecha: 2026-07-25
Estado: aprobado, pendiente de plan de implementación

## 1. Problema

Buscar un ejercicio exige recordar su nombre exacto. Escribir `polea` durante la captura
devuelve `"Varios ejercicios coinciden. Sé más específico."` y descarta los ocho candidatos
que el bot ya tenía resueltos (`capture.ts:317-319, 344-346`). Escribir `jalon` sin tilde no
encuentra `Jalón al pecho en polea`. No existe ninguna forma de ver qué ejercicios hay: los
51 del catálogo son invisibles salvo que se acierte su nombre.

La fricción aparece en los tres flujos que buscan ejercicios, y cada uno la resuelve de una
manera distinta:

| Flujo | Hoy, con varios candidatos |
|---|---|
| Captura de series (`capture.ts`) | Texto plano «Sé más específico». Callejón sin salida |
| Wizard de `/routines` | Botones con los candidatos |
| `/last` | Botones con los candidatos |

Duele más al montar rutinas, que es justo donde peor se conoce el catálogo.

## 2. Alcance

Un selector de ejercicios navegable por grupo muscular, compartido por los tres flujos, más
una mejora de la coincidencia por texto que pasa a ser un atajo y deja de ser un peaje.

**No** entran: crear ejercicios propios desde la captura, alias o sinónimos, tolerancia a
erratas por distancia de edición, modo inline de Telegram, ni cambios de esquema o
migraciones. La Fase 2 según SPEC.md §11 es corrección de fricción, no funcionalidad nueva.

El criterio de terminado: escribir `polea` en cualquiera de los tres flujos ofrece botones
para elegir, y se puede llegar a cualquier ejercicio del catálogo sin escribir una letra.

## 3. Arquitectura

Tres piezas nuevas y dos retocadas.

### 3.1 `apps/server/src/bot/exercise-picker.ts` (nuevo)

Render puro, sin acceso a base de datos ni a Telegram. Mismo patrón que `session-view.ts`.

```ts
type PickerState =
  | { view: 'groups' }
  | { view: 'group'; groupIndex: number; offset: number };

function renderPicker(
  state: PickerState,
  byGroup: ReadonlyMap<MuscleGroup, readonly ExerciseOption[]>,
): { text: string; keyboard: InlineKeyboard };
```

El picker no sabe qué se hace con el ejercicio elegido; quien lo llama no sabe cómo se
pinta. La única frontera entre ambos es un `exerciseId`.

### 3.2 Espacio `pick:` en `callback-data.ts` (nuevo)

| `callback_data` | Significado |
|---|---|
| `pick:g` | Volver a la pantalla de grupos |
| `pick:g:<idx>:<offset>` | Ejercicios del grupo `idx` desde `offset` |
| `pick:x:<id>` | Ejercicio elegido |
| `pick:s` | Buscar por nombre |

`<idx>` es el índice dentro de `MUSCLE_GROUPS`, no el nombre, para no agotar los 64 bytes de
`callback_data`. `parseCallback` valida que el índice esté en rango y que `offset` e `id`
sean enteros decimales canónicos, igual que ya hace `parseIdSuffix`. Las variantes se suman
al tipo `CallbackAction` existente; un valor inválido cae en `{ type: 'unknown' }`.

### 3.3 `listExercisesByMuscleGroup(db, userId)` en `packages/db` (nuevo)

Repositorio que devuelve catálogo y ejercicios propios no archivados, agrupados por
`muscle_group`. Los 17 grupos ya existen como enum en `packages/core` con etiquetas en
español (`MUSCLE_GROUP_LABELS`), de modo que no hace falta tocar el esquema.

### 3.4 `services/exercise-match.ts` (retocado)

Dos cambios, sin alterar la forma de `MatchResult`:

- **Normalización sin diacríticos**: `s.normalize('NFD').replace(/\p{Diacritic}/gu, '')`
  sobre la normalización actual. Nativo, sin dependencias. `jalon` encuentra `Jalón`.
- **Coincidencia por términos**: la consulta se parte por espacios y un ejercicio coincide
  si **todos** los términos aparecen como subcadena de su nombre, en cualquier orden.
  `polea triceps` encuentra `Extensión de tríceps en polea`.

La preferencia por coincidencia exacta se conserva: si el nombre completo normalizado
coincide con la consulta, gana sobre las coincidencias parciales.

### 3.5 Los tres puntos de entrada (retocados)

`capture.ts`, `routines-wizard.ts` y `last.ts` pintan el picker en lugar de sus listados
actuales, y el caso `ambiguous` deja de ser un callejón sin salida.

## 4. Comportamiento

**Pantalla de grupos.** Los 17 grupos en dos columnas, en el orden anatómico del enum
(pecho, hombros, espalda, brazos, abdomen, piernas). Solo aparecen los grupos con al menos
un ejercicio disponible. Al pie, un botón `🔍 Buscar por nombre` que responde «escribe el
nombre del ejercicio».

**Pantalla de un grupo.** Los ejercicios del grupo, uno por fila, porque los nombres son
largos (`Elevaciones laterales en polea`). Arriba, `‹ Volver` a los grupos.

**Paginación de 10 en 10.** Con el catálogo actual el grupo más poblado es Pecho con 7
ejercicios, de modo que la paginación casi nunca se activará; aun así es simétrica. Se
muestran 10 ejercicios por página y, en una fila al pie, `‹ Anterior` y `Siguiente ›`,
apareciendo solo el que aplica: `‹ Anterior` cuando `offset > 0` y `Siguiente ›` cuando
quedan ejercicios por detrás. Ambos mueven el `offset` en pasos de 10. No se numeran las
páginas.

**Edición in place.** Toda la navegación edita el mismo mensaje, como ya hace la vista de
sesión. Al elegir ejercicio, ese mensaje se convierte en la vista del ejercicio con sus
botones de peso y repeticiones. No quedan menús muertos en el chat.

**Búsqueda sin resultados.** «No encontré "xxx"» con un botón `📂 Ver por grupo` debajo.

**Búsqueda con varios resultados.** Los candidatos salen como botones, en los tres flujos.

**Cambios visibles adicionales.** El botón `➕ Otro ejercicio` pasa a `📂 Otro ejercicio` y
abre el menú de grupos en vez de pedir que se escriba. `/last` sin argumentos abre el menú
en lugar de mostrar el texto de ayuda.

**Lo que no cambia.** La rutina del día sigue apareciendo como botones con sus `✓` al empezar
la sesión. El flujo rápido —tocar ejercicio, escribir `60x8`, tocar registrar— es idéntico.

## 5. Flujo de datos

Un toque llega como *callback query*; `parseCallback` lo traduce a una acción tipada; quien
la recibe pide la lista agrupada a la base de datos, se la pasa al render puro y edita el
mensaje. Cuando la acción es `pick:x`, el picker termina y devuelve el `exerciseId`: la
captura lo fija como ejercicio actual, el wizard lo añade al día de rutina, `/last` muestra
el histórico.

El estado de navegación viaja entero dentro del `callback_data`. No se persiste nada en
`bot_sessions`: no hay estado que limpiar ni migración que escribir.

## 6. Errores

- **Índice de grupo u `offset` fuera de rango** → `{ type: 'unknown' }`, se ignora en
  silencio, igual que hoy con los ids inválidos.
- **Ejercicio archivado entre el pintado del menú y el toque** → aviso efímero y repintado de
  la pantalla de grupos, en lugar de fallar.
- **Botón de un menú ya editado** → Telegram devuelve `message is not modified`; `capture.ts`
  ya lo captura y lo ignora.
- **Wizard de rutinas** → toda lectura de base de datos dentro de `conversation.external`. El
  motor de replay de `@grammyjs/conversations` reejecuta la conversación desde el principio y
  una consulta suelta se ejecutaría varias veces.

## 7. Pruebas

Tests puros, sin Telegram ni base de datos:

- Render del picker: grupos vacíos ocultos, orden anatómico, dos columnas, botón de volver
  presente solo en la vista de grupo.
- Paginación: con 10 o menos no aparece ninguna flecha; en la primera página de 25 solo
  `Siguiente ›`; en la intermedia las dos; en la última solo `‹ Anterior`; un `offset` que
  cae más allá del final se trata como fuera de rango.
- `parseCallback`: cada variante de `pick:`, más índices fuera de rango, `offset` negativo y
  sufijos no numéricos.
- `matchExercise` como tabla de casos: tildes, mayúsculas, términos desordenados, exacto
  frente a parcial, un resultado, varios, ninguno.

Tests de integración con base de datos en memoria:

- `listExercisesByMuscleGroup`: excluye archivados, incluye los propios del usuario y
  ninguno de otro usuario.
- Los tres puntos de entrada: escribir `polea` produce botones y no un mensaje de error.

Se sigue TDD, como el resto del proyecto.

## 8. Decisiones tomadas en el brainstorming

| Decisión | Motivo |
|---|---|
| Navegar por grupo muscular, no por equipamiento | El campo `equipment` no existe en la base de datos; añadirlo obligaría a clasificar los 51 ejercicios y a una migración |
| Grupos como primera pantalla, no «tus habituales» | El autor prefiere un camino predecible de dos toques antes que un atajo que varía |
| Coincidencia por términos, sin erratas ni alias | El texto queda como camino secundario; la distancia de edición y una tabla de alias son superficie de fallo y mantenimiento para un camino poco usado |
| Un selector compartido, no un arreglo solo en la captura | Mismo esfuerzo que repetirlo tres veces, y evita que convivan tres búsquedas distintas |
| Sin crear ejercicios propios desde la captura | Funcionalidad nueva; SPEC.md §11 limita la Fase 2 a corregir fricción |
