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
- **`detectStagnation` no recibe `now`**: el diseño lo listaba, pero el algoritmo solo cuenta
  semanas presentes en los datos; un parámetro sin uso es superficie de confusión.
- **Supresión dirigida del `ExperimentalWarning` de `node:sqlite` en los tests** (vía
  `--disable-warning=ExperimentalWarning` en los workers de Vitest): en Node 24 el módulo ya
  no exige flag pero sigue emitiendo el warning; silenciarlo de forma dirigida mantiene la
  salida de tests limpia sin ocultar otros warnings.
