# How to work on this project

Operational guide for the monorepo: what to install, what commands exist, how to run the
tests and how to start each piece. For **what** is being built and **why**, the source of
truth is [`SPEC.md`](SPEC.md); deviations and their trade-offs are in
[`DECISIONS.md`](DECISIONS.md).

## 1. Environment

| Requirement | Version | Where it's pinned |
|---|---|---|
| Node | 24 (minimum 23.4.0) | `.nvmrc`, `package.json` `engines` |
| pnpm | 11.x | `pnpm-workspace.yaml` |

`.npmrc` has `engine-strict=true`, so a Node version below the minimum aborts the
install instead of just warning.

```bash
pnpm install
```

Installs the whole workspace and links the internal packages (`workspace:*`). There's no
build step: packages are consumed directly from `src/` via the `exports` field.

> Environment note: on the author's machine pnpm is installed globally with npm, because
> `corepack` fails with EPERM. If `pnpm` isn't on the PATH: `npm i -g pnpm`.

## 2. Repository map

```
apps/
  server/    Telegram bot (grammY, long polling) — @gym-tracker/server
  web/       web dashboard SPA (Vite + React) — @gym-tracker/web
packages/
  core/      pure domain logic, zero dependencies — @gym-tracker/core
  db/        Drizzle schema, migrations, repositories — @gym-tracker/db
docs/superpowers/
  specs/     approved designs, one per phase
  plans/     implementation plans, one per phase
```

Per-package commands are run with `--filter`:

```bash
pnpm --filter @gym-tracker/web <script>
pnpm --filter @gym-tracker/server <script>
```

## 3. Tests

A single runner (Vitest 4) with **two projects** declared in the root `vitest.config.ts`:

| Project | Environment | What it includes |
|---|---|---|
| `node` | node | `packages/*/src/**/*.test.ts`, `apps/server/src/**/*.test.ts` |
| `web` | jsdom | `apps/web/src/**/*.test.{ts,tsx}` |

```bash
# Whole suite (both projects)
pnpm test

# Just one project
pnpm vitest run --project node
pnpm vitest run --project web

# A specific file
pnpm vitest run apps/web/src/presenters/overview.test.ts

# Filter by test name
pnpm vitest run --project web -t "heatmap"

# Watch mode while developing
pnpm vitest --project web
```

Reference for what should currently pass green: **446 tests in 59 files**
(384 in `node`, 62 in `web`).

Tests live next to the code they test (`foo.ts` → `foo.test.ts`), not in a separate
`__tests__` tree.

## 4. Type checking

```bash
pnpm typecheck                                # all 4 workspaces (pnpm -r)
pnpm --filter @gym-tracker/web typecheck      # just one
```

`tsconfig.base.json` is in strict mode, and three options change how code is written day
to day:

- **`noUncheckedIndexedAccess`** — indexing an array returns `T | undefined`. `arr[0]`
  must be checked before use.
- **`exactOptionalPropertyTypes`** — a `rpe?: number` property can't be assigned
  `undefined`. Omit the key instead (conditional spread: `...(rpe === undefined ? {} : { rpe })`).
- **`verbatimModuleSyntax`** — type imports use `import type`.

## 5. Starting the web dashboard

```bash
pnpm --filter @gym-tracker/web dev       # dev server at http://localhost:5173
pnpm --filter @gym-tracker/web build     # production bundle in apps/web/dist
pnpm --filter @gym-tracker/web preview   # serves the already-built bundle
```

Today the SPA is fed by **fake data** (`apps/web/src/data/mock.ts`): it needs neither a
database nor a server. The generator produces raw series that pass through the real
`@gym-tracker/core` functions, so the figures are real calculations over fake data. Once
the HTTP API exists, only the series' origin changes.

The four screens are hash routes, navigable by hand:

```
#/overview    #/sessions    #/routines    #/exercise/<id>
```

## 6. Starting the Telegram bot

Needs configuration via environment variables. `apps/server/src/config.ts` validates them
on startup and aborts with a clear message if any is missing:

| Variable | Required | What it is |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | Bot token from @BotFather |
| `ALLOWED_TELEGRAM_IDS` | yes | Authorized Telegram user ids, comma-separated |
| `TIMEZONE` | no | IANA zone; defaults to the system's |
| `DB_PATH` | no | SQLite path; defaults to the OS's data directory |

```bash
# PowerShell
$env:TELEGRAM_BOT_TOKEN = '…'; $env:ALLOWED_TELEGRAM_IDS = '123456789'
pnpm --filter @gym-tracker/server start

# bash
TELEGRAM_BOT_TOKEN=… ALLOWED_TELEGRAM_IDS=123456789 pnpm --filter @gym-tracker/server start
```

`main.ts` creates the database directory, opens the SQLite file and **applies only the
pending migrations** before starting long polling. There's no manual migration step at
startup.

The dev runner is `tsx` (not `node src/main.ts`): the code uses extension-less imports,
which Node ESM doesn't resolve. The final binary's runtime is decided in Phase 4.

## 7. Database and migrations

The schema is written in `packages/db/src/schema.ts` and migrations are **generated**,
not hand-written:

```bash
pnpm --filter @gym-tracker/db generate    # drizzle-kit generate
```

That leaves a new `.sql` file in `packages/db/drizzle/` and updates `meta/_journal.json`.
Both get committed. Migrations apply themselves on server startup (§6).

**`better-sqlite3` is forbidden**, along with any native module that requires compiling on
the user's machine (SPEC §3): `node:sqlite` is used instead. Hence the SQLite
`ExperimentalWarning` in the test output, deliberately silenced with `execArgv` in
`vitest.config.ts`.

`*.db` files are in `.gitignore`.

## 8. Conventions

**Language.** Conversation and documents in Spanish. Identifiers and file names in
English; code comments in Spanish. Interface text (bot and dashboard) in Spanish.
Commit messages in English.

**Commits.** Conventional Commits with scope: `feat(web):`, `fix(server):`, `docs(web):`.
Committed when the author asks for it, not automatically.

**Where logic lives.** `packages/core` has all the business formulas (tonnage, effective
sets, estimated 1RM, records, weekly volume, stagnation, rest). Neither `apps/server` nor
`apps/web` reimplement them: the bot and the dashboard call exactly the same function. If
a figure is needed in both places, it lives in `core`.

**Components don't calculate.** In `apps/web`, every screen has a *presenter* in
`src/presenters/`: a pure function that receives domain data and returns the already
formatted view model. Components in `src/components/` receive that model and render it.
Test priority is on the presenters.

**Muscle groups.** Always the `MUSCLE_GROUPS` enum from `core` (17 values) with
`MUSCLE_GROUP_LABELS` for display. Never loose strings.

**Timezone.** `core` functions that need it receive it as a parameter. In the web app it
comes from the single `TIME_ZONE` constant in `apps/web/src/config.ts`; in the server,
from config. Never scattered literals.

**Dependencies.** Every new dependency is justified before being added (SPEC §12). The
actual stack, including the four deviations from the original (Nocturne instead of
Tailwind/shadcn, hand-written SVG instead of Recharts, a custom router instead of
react-router, the Google Fonts `@import` kept as-is), is in the SPEC §3 table and
explained in `DECISIONS.md`.

**No invented functionality.** If the spec doesn't ask for it, it doesn't get
implemented; when a product ambiguity comes up, ask the author instead of assuming.

## 9. i18n

The bot's texts live in `apps/server/src/i18n/locales/{es,en}.ts` and are resolved with
`i18next`. The language, unit and weight increment for the current update are in the
global module `apps/server/src/i18n/current.ts`, populated by the `bot/preferences.ts`
middleware.

**Mandatory rule:** any code that generates text OUTSIDE an update's lifecycle (a
`setTimeout`, a cron, a webhook, a deferred task) must capture `snapshot()` when it's
scheduled and restore it with `withCurrent()` when it runs. `bot/rest-timer.ts` is the
example. Without that, the message can come out in another user's language or another
update's.

To add a language: a new file in `locales/`, an entry in `LOCALES` (`i18n/index.ts`) and
extend the `users.locale` `CHECK` with a migration. The `i18n/parity.test.ts` test forces
the whole catalog to be translated.

Changing units does NOT convert any weight: it's just a label.

## 10. Before calling something done

```bash
pnpm test && pnpm typecheck && pnpm --filter @gym-tracker/web build
```

All three green, with the output visible. A UI change also needs a real visual pass in
the browser: jsdom tests can't see how it actually looks.
