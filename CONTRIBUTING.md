# Cómo trabajar en este proyecto

Guía operativa del monorepo: qué instalar, qué comandos existen, cómo correr los tests y
cómo arrancar cada pieza. Para **qué** se construye y **por qué**, la fuente de verdad es
[`SPEC.md`](SPEC.md); las desviaciones y sus contrapartidas están en
[`DECISIONS.md`](DECISIONS.md).

## 1. Entorno

| Requisito | Versión | Dónde está fijado |
|---|---|---|
| Node | 24 (mínimo 23.4.0) | `.nvmrc`, `engines` de `package.json` |
| pnpm | 11.x | `pnpm-workspace.yaml` |

`.npmrc` tiene `engine-strict=true`, así que una versión de Node por debajo del mínimo
aborta la instalación en vez de avisar.

```bash
pnpm install
```

Instala todo el workspace y enlaza los paquetes internos (`workspace:*`). No hay paso de
build: los paquetes se consumen directamente desde `src/` vía el campo `exports`.

> Nota de entorno: en la máquina del autor pnpm está instalado global con npm, porque
> `corepack` falla con EPERM. Si `pnpm` no está en el PATH: `npm i -g pnpm`.

## 2. Mapa del repositorio

```
apps/
  server/    bot de Telegram (grammY, long polling) — @gym-tracker/server
  web/       dashboard SPA (Vite + React) — @gym-tracker/web
packages/
  core/      lógica de dominio pura, cero dependencias — @gym-tracker/core
  db/        esquema Drizzle, migraciones, repositorios — @gym-tracker/db
docs/superpowers/
  specs/     diseños aprobados, uno por fase
  plans/     planes de implementación, uno por fase
```

Los comandos por paquete se lanzan con `--filter`:

```bash
pnpm --filter @gym-tracker/web <script>
pnpm --filter @gym-tracker/server <script>
```

## 3. Tests

Un solo runner (Vitest 4) con **dos proyectos** declarados en `vitest.config.ts` raíz:

| Proyecto | Entorno | Qué incluye |
|---|---|---|
| `node` | node | `packages/*/src/**/*.test.ts`, `apps/server/src/**/*.test.ts` |
| `web` | jsdom | `apps/web/src/**/*.test.{ts,tsx}` |

```bash
# Toda la suite (los dos proyectos)
pnpm test

# Solo un proyecto
pnpm vitest run --project node
pnpm vitest run --project web

# Un archivo concreto
pnpm vitest run apps/web/src/presenters/overview.test.ts

# Filtrar por nombre de test
pnpm vitest run --project web -t "heatmap"

# Modo watch mientras desarrollas
pnpm vitest --project web
```

Referencia de lo que debe salir en verde ahora mismo: **211 tests en 42 archivos**
(150 en `node`, 61 en `web`).

Los tests viven junto al código que prueban (`foo.ts` → `foo.test.ts`), no en un árbol
`__tests__` aparte.

## 4. Comprobación de tipos

```bash
pnpm typecheck                                # los 4 workspaces (pnpm -r)
pnpm --filter @gym-tracker/web typecheck      # uno solo
```

`tsconfig.base.json` está en modo estricto y tres opciones cambian cómo se escribe el
código a diario:

- **`noUncheckedIndexedAccess`** — indexar un array devuelve `T | undefined`. `arr[0]` hay
  que comprobarlo antes de usarlo.
- **`exactOptionalPropertyTypes`** — a una propiedad `rpe?: number` no se le puede asignar
  `undefined`. Se omite la clave (spread condicional: `...(rpe === undefined ? {} : { rpe })`).
- **`verbatimModuleSyntax`** — las importaciones de tipos van con `import type`.

## 5. Arrancar el dashboard web

```bash
pnpm --filter @gym-tracker/web dev       # dev server en http://localhost:5173
pnpm --filter @gym-tracker/web build     # bundle de producción en apps/web/dist
pnpm --filter @gym-tracker/web preview   # sirve el bundle ya construido
```

Hoy la SPA se alimenta de **datos ficticios** (`apps/web/src/data/mock.ts`): no necesita ni
base de datos ni servidor. El generador produce series crudas que pasan por las funciones
reales de `@gym-tracker/core`, así que las cifras son cálculos de verdad sobre datos falsos.
Cuando exista la API HTTP solo cambia el origen de las series.

Las cuatro pantallas son rutas de hash, navegables a mano:

```
#/overview    #/sessions    #/routines    #/exercise/<id>
```

## 6. Arrancar el bot de Telegram

Necesita configuración por variables de entorno. `apps/server/src/config.ts` las valida al
arrancar y aborta con un mensaje claro si falta alguna:

| Variable | Obligatoria | Qué es |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | sí | Token del bot que da @BotFather |
| `ALLOWED_TELEGRAM_IDS` | sí | Ids de usuario de Telegram autorizados, separados por comas |
| `TIMEZONE` | no | Zona IANA; por defecto la del sistema |
| `DB_PATH` | no | Ruta del SQLite; por defecto el directorio de datos del SO |

```bash
# PowerShell
$env:TELEGRAM_BOT_TOKEN = '…'; $env:ALLOWED_TELEGRAM_IDS = '123456789'
pnpm --filter @gym-tracker/server start

# bash
TELEGRAM_BOT_TOKEN=… ALLOWED_TELEGRAM_IDS=123456789 pnpm --filter @gym-tracker/server start
```

`main.ts` crea el directorio de la base de datos, abre el SQLite y **aplica las migraciones
pendientes solo** antes de levantar el long polling. No hay paso manual de migración al
arrancar.

El runner de desarrollo es `tsx` (no `node src/main.ts`): el código usa imports sin
extensión, que Node ESM no resuelve. El runtime del binario final se decide en la Fase 4.

## 7. Base de datos y migraciones

El esquema se escribe en `packages/db/src/schema.ts` y las migraciones se **generan**, no se
escriben a mano:

```bash
pnpm --filter @gym-tracker/db generate    # drizzle-kit generate
```

Eso deja un `.sql` nuevo en `packages/db/drizzle/` y actualiza `meta/_journal.json`. Ambos
se commitean. Las migraciones se aplican solas al arrancar el servidor (§6).

**Prohibido `better-sqlite3`** ni ningún módulo nativo que exija compilar en la máquina del
usuario (SPEC §3): se usa `node:sqlite`. De ahí el `ExperimentalWarning` de SQLite en la
salida de los tests, silenciado de forma dirigida con `execArgv` en `vitest.config.ts`.

Los `*.db` están en `.gitignore`.

## 8. Convenciones

**Idioma.** Conversación y documentos en español. Identificadores, nombres de archivo y
comentarios de código en inglés. Textos de interfaz (bot y dashboard) en español. Mensajes
de commit en inglés.

**Commits.** Conventional Commits con ámbito: `feat(web):`, `fix(server):`, `docs(web):`.
Se commitea cuando el autor lo pide, no automáticamente.

**Dónde va la lógica.** `packages/core` tiene todas las fórmulas de negocio (tonelaje,
series efectivas, 1RM estimado, récords, volumen semanal, estancamiento, descanso). Ni
`apps/server` ni `apps/web` las reimplementan: el bot y el dashboard invocan exactamente la
misma función. Si una cifra hace falta en los dos sitios, vive en `core`.

**Los componentes no calculan.** En `apps/web`, cada pantalla tiene un *presenter* en
`src/presenters/`: función pura que recibe datos de dominio y devuelve el modelo de vista ya
formateado. Los componentes de `src/components/` reciben ese modelo y lo pintan. La prioridad
de los tests está en los presenters.

**Grupos musculares.** Siempre el enum `MUSCLE_GROUPS` de `core` (17 valores) con
`MUSCLE_GROUP_LABELS` para mostrar. Nunca cadenas sueltas.

**Zona horaria.** Las funciones de `core` que la piden la reciben por parámetro. En el web
sale de la constante única `TIME_ZONE` de `apps/web/src/config.ts`; en el server, de la
config. Nunca literales repartidos.

**Dependencias.** Cada dependencia nueva se justifica antes de añadirla (SPEC §12). El stack
real, incluidas las cuatro desviaciones del original (Nocturne en vez de Tailwind/shadcn,
SVG a mano en vez de Recharts, router propio en vez de react-router, `@import` de Google
Fonts conservado), está en la tabla de SPEC §3 y razonado en `DECISIONS.md`.

**Nada de funcionalidad inventada.** Si el spec no lo pide, no se implementa; ante una
ambigüedad de producto, se pregunta al autor en vez de asumir.

## 9. Antes de dar algo por terminado

```bash
pnpm test && pnpm typecheck && pnpm --filter @gym-tracker/web build
```

Los tres en verde, con la salida a la vista. Un cambio en la UI necesita además una pasada
visual real en el navegador: los tests de jsdom no ven cómo queda.
