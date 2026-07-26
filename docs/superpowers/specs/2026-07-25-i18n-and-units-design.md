# Idioma y unidades configurables — diseño

Fecha: 2026-07-25
Estado: aprobado en brainstorming, pendiente de plan de implementación

## Objetivo

El bot funciona en español y en inglés, y el usuario elige entre kg y lb. Ambas cosas se
cambian en cualquier momento desde un comando nuevo, `/settings`, y añadir un tercer idioma
en el futuro debe costar un fichero.

Cambiar de unidad **no convierte ningún número**: el 100 registrado en kg se sigue mostrando
como 100 con la etiqueta `lb`. Es una decisión explícita del autor.

## Alcance

Dentro: `apps/server` (todo el bot), `packages/db` (preferencias y claves de ejercicio),
el sufijo de unidad del parser en `packages/core`.

Fuera: **`apps/web`**. El dashboard sigue en español con `kg` fijo. Consecuencia asumida:
`MUSCLE_GROUP_LABELS` no se puede mover de `packages/core`, porque el web lo importa en
cinco sitios; sus 17 etiquetas quedan duplicadas en el catálogo español del bot hasta que
se traduzca el web. Es deuda consciente.

## Decisiones cerradas (no re-preguntar)

| Decisión | Elección |
|---|---|
| Mecanismo de traducción | `i18next` (elegido por el autor sobre un catálogo tipado propio) |
| Propagación de la preferencia | Variable global por update (elegida por el autor sobre paso por parámetro) |
| Nombres del catálogo de ejercicios | Clave de traducción `name_key` en la fila |
| Idioma por defecto | Detectado del `language_code` de Telegram; `es` → español, **cualquier otro o ausente → inglés** |
| Unidad por defecto | `kg` |
| Salto de peso | Ajuste propio en `/settings`, valores 1 / 2.5 / 5 / 10, default 2.5 |
| Histórico con unidades mezcladas | Riesgo anotado, **no se aborda** (ver Riesgos) |

## 1. Datos — migración 0002

`users` gana tres columnas, con `CHECK` para que la BD rechace valores fuera de rango:

| Columna | Tipo | Default | Valores permitidos |
|---|---|---|---|
| `locale` | TEXT NOT NULL | `'en'` | `'es'`, `'en'` |
| `weight_unit` | TEXT NOT NULL | `'kg'` | `'kg'`, `'lb'` |
| `weight_step` | REAL NOT NULL | `2.5` | `1`, `2.5`, `5`, `10` |

`exercises` gana `name_key TEXT` nulable. La misma migración asigna la clave a las 51 filas
del catálogo base con `UPDATE exercises SET name_key = '<clave>' WHERE user_id IS NULL AND
name = '<nombre español>'`, una sentencia por ejercicio. El seed de la 0001 es un único
`INSERT` con `user_id NULL`, así que el criterio es determinista. Los ejercicios propios
del usuario quedan con `name_key` a NULL y se muestran literalmente en cualquier idioma.

`weight_kg` **no se renombra**: arrastraría `core`, `db` y `web` sin ganar nada. Se documenta
en `schema.ts` que contiene "el número que el usuario escribió, en la unidad que tuviera
configurada entonces".

En `packages/db`:

- `UserRow` gana `locale`, `weightUnit`, `weightStep`; `mapUser` y los `SELECT` los incluyen.
- `createUser` acepta `locale`. Quien lo deduce es `bot/auth.ts`, que ya es donde se da de
  alta al usuario en su primer contacto: `ctx.from?.language_code` empezando por `es` →
  `'es'`, cualquier otro valor o ausencia → `'en'`.
- Nuevo `updateUserPreferences(db, userId, patch)`, con `patch` parcial de los tres campos.
- Las filas devueltas por los repositorios de `exercises` incluyen `nameKey`.

## 2. i18next

Dependencia nueva de runtime en `apps/server`: **`i18next`**, sin plugins de carga de
ficheros. Los recursos son módulos TypeScript (`src/i18n/locales/es.ts`, `en.ts`), no JSON
leídos del disco: el bot no debe depender de rutas en tiempo de ejecución (ver el problema
de los imports sin extensión documentado en la Fase 1).

`src/i18n/index.ts` expone `initI18n()`, que llama a `i18next.init` con:

- `lng: 'en'`, `fallbackLng: 'en'` — el inglés es el idioma de reserva, coherente con el
  default de la columna `locale`.
- `interpolation.escapeValue: false` — **crítico**. i18next escapa para HTML de navegador
  por defecto y convertiría los `<b>` y `<code>` de la pantalla de ayuda en texto visible.
  El escapado de lo que viene del usuario sigue siendo responsabilidad de `escapeHtml` en
  `welcome.ts`.
- `missingKeyHandler` que **lanza** cuando `NODE_ENV === 'test'` y solo escribe un log en
  producción: en un bot de uso personal, un texto feo es preferible a una caída, pero en
  test cualquier clave inexistente debe romper.

Plurales con el sufijo nativo de i18next (`sets_one` / `sets_other`), que resuelve con
`Intl.PluralRules`. Cubre "serie/series" y "set/sets" sin código propio.

`initI18n()` se llama en `main.ts` antes de arrancar el bot, y en el setup de los tests.

## 3. La variable global y su contención

`src/i18n/current.ts` guarda el estado del update en curso y es la única fuente de idioma:

```ts
current = { locale, unit, step }

setCurrent(prefs)          // lo llama el middleware en cada update
snapshot()                 // copia del estado actual
withCurrent(snap, fn)      // ejecuta fn con un estado restaurado
t(key, vars)               // delega en i18next.getFixedT(current.locale)
unitLabel()                // 'kg' | 'lb'
weightStep()               // número
```

Un middleware nuevo (`src/bot/preferences.ts`), registrado justo detrás de `auth`, hace
`setCurrent(ctx.user)` en cada update.

**`texts.ts` conserva su nombre y su forma pública.** `T` pasa a ser un objeto de *getters*
(`get chooseDayPrompt() { return t('chooseDayPrompt'); }`) y funciones que delegan en `t()`.
Los diez ficheros que importan `T` y sus tests siguen escribiéndose igual; solo cambia el
interior de `texts.ts`. `parseErrorText` mantiene su firma y traduce por clave.

Los dos agujeros del estado global, tapados explícitamente:

- **`rest-timer.ts`**: `schedule()` guarda `snapshot()` al programar el aviso, y el
  `setTimeout` lo restaura con `withCurrent(...)` antes de construir el texto. Es el único
  punto del bot que genera mensajes fuera del ciclo de vida de un update; sin esto, el aviso
  de descanso puede llegar en el idioma de otro update que entrara en medio.
- **Tests**: `test-harness.ts` fija el idioma antes de cada update, para que los tests
  existentes sigan viendo español y ningún fichero contamine a otro.

## 4. `/settings`

Pantalla única con teclado inline, tres filas de opciones y la activa marcada con `✓`:

```
⚙️ Ajustes

Idioma:   [ ✓ Español ] [ English ]
Unidades: [ ✓ kg ]      [ lb ]
Salto:    [ 1 ] [ ✓ 2.5 ] [ 5 ] [ 10 ]
          [ ‹ Volver ]
```

- Espacio de callbacks propio en `callback-data.ts`, siguiendo el patrón de `pick:`:
  `set:l:es`, `set:u:lb`, `set:s:5`.
- Cada pulsación persiste en BD, actualiza la variable global y **repinta la misma pantalla
  in-place**, así el cambio de idioma se ve al instante.
- `/settings` responde con un **mensaje nuevo**, como `/help`: nunca pisa el mensaje de una
  sesión de entrenamiento activa.
- El nombre de cada idioma se escribe en ese idioma ("Español", "English"), no traducido.
- `‹ Volver` reconstruye la bienvenida en el sitio, igual que hace la pantalla de ayuda.
- Los botones se generan desde la lista de idiomas y la de saltos, no a mano.

Integración con Telegram y con la bienvenida:

- `BOT_COMMANDS` deja de ser un array `as const` con descripciones literales y pasa a ser
  `botCommands(locale)`, que devuelve la lista con las descripciones traducidas por clave.
  Gana una entrada nueva, `settings`.
- `setBotCommands` llama a `setMyCommands` **dos veces**: una con `language_code: 'es'` y la
  otra sin él (el default, en inglés), para que el menú ☰ también esté traducido.
- La bienvenida añade una línea corta: "Puedes cambiar el idioma y las unidades en /settings".
- El mensaje de un entrenamiento en curso se traduce en su siguiente edición. No se fuerza
  un repintado al cambiar de idioma.

## 5. Unidades, sin conversión

- Los ` kg` incrustados a mano en `texts.ts` y `welcome.ts` pasan por `unitLabel()`. La tabla
  `<pre>` de la bienvenida no se descuadra: `kg` y `lb` miden ambos dos caracteres, y los
  anchos (`LABEL_WIDTH`, `VALUE_WIDTH`, `CHANGE_WIDTH`) no cambian.
- `WEIGHT_STEP = 2.5` desaparece como constante de `callback-data.ts`; el valor sale de las
  preferencias del usuario. Los botones se rotulan `−{step}` / `+{step}`, formateados sin
  decimales colgando (`5`, no `5.0`).
- `packages/core/src/set-parser.ts`: el sufijo opcional pasa de `(?:kg)?` a `(?:kg|lbs?)?`.
  Se **ignora**, nunca convierte: escribir `100lb` con la unidad en kg registra 100.
- Ninguna función de cálculo de `packages/core` cambia (tonelaje, 1RM, récords, estancamiento).

## 6. Nombres traducibles

- `src/i18n/exercise-name.ts` expone `displayName(row)`: devuelve `t('exercise.' + nameKey)`
  si la fila tiene clave, y el `name` de la BD si no. Lo consumen el selector de ejercicios,
  la captura, `/last` y el wizard de rutinas — todo sitio que hoy pinta `exercise.name`.
- `services/exercise-match.ts` indexa **el nombre mostrado y el nombre de la BD**, con la
  normalización sin diacríticos que ya existe. Así `sentadilla 100x5` sigue funcionando con
  el bot en inglés, sin coste añadido.
- Los grupos musculares en el bot pasan a `t('muscleGroup.chest')`. `MUSCLE_GROUP_LABELS`
  se queda intacto en `packages/core` para `apps/web` (ver Alcance).

## 7. Pruebas

Además de tests por unidad de cada pieza nueva:

- **Paridad de claves**: un test recorre los catálogos `es` y `en` en profundidad y exige el
  mismo conjunto de claves y las mismas variables `{{...}}` en cada mensaje. Es la red que
  compensa que i18next no detecte claves faltantes en compilación.
- **Catálogo completo**: las 51 claves de ejercicio y los 17 grupos musculares existen en
  los dos idiomas.
- **Migración 0002**: aplica sobre una BD con datos previos; las 51 filas base acaban con
  clave, los ejercicios propios sin ella, y los `CHECK` rechazan `locale = 'fr'`,
  `weight_unit = 'st'` y `weight_step = 3`.
- **`/settings`**: render con cada combinación de preferencias (marca `✓` en la correcta), y
  cada callback persiste el valor y repinta en el idioma nuevo.
- **`rest-timer`**: aviso programado en español y disparado después de un update en inglés →
  el mensaje llega en español.
- **Parser**: `100kg x 8`, `100lb x 8`, `100lbs x 8` y `100x8` dan el mismo peso.
- **Alta de usuario**: `language_code` `'es'` → español; `'en'`, `'pt'`, `'fr'` y ausente →
  inglés.

## 8. Añadir un idioma en el futuro

Un fichero `src/i18n/locales/<lang>.ts`, una entrada en la lista de idiomas y ampliar el
`CHECK` de `locale`. Sin tocar renders ni pantallas: `/settings` genera sus botones desde esa
lista y el test de paridad obliga a traducirlo entero.

## Riesgos anotados (aceptados, no abordados)

1. **Histórico con unidades mezcladas.** Al no convertir, las series antiguas se muestran con
   su número original y la etiqueta nueva: un 100 kg de hace dos meses se lee "100 lb". Todo
   agregado que cruce ese cambio — tonelaje de 30 días, récords, 1RM estimado, estancamiento —
   suma valores de unidades distintas sin avisar. Mitigación posible en el futuro: guardar la
   unidad en cada serie y avisar cuando un rango mezcla unidades. Fuera de alcance aquí.
2. **Inglés como reserva.** Solo `es` da español, así que un usuario con Telegram en
   portugués, francés o italiano abre el bot en inglés. Es la decisión del autor.
3. **Estado global.** El idioma vive en un módulo, no en el contexto. `rest-timer` está
   contenido y los tests se reinician por update, pero cualquier código futuro que genere
   texto fuera del ciclo de un update (un cron, un webhook, una tarea diferida) debe capturar
   el `snapshot()` igual que hace `rest-timer`. Anotarlo en `CONTRIBUTING.md`.
