import type { DatabaseSync } from 'node:sqlite';
import type { MuscleGroup } from '@gym-tracker/core';

export interface SetRow {
  id: number;
  workoutId: number;
  exerciseId: number;
  position: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  restSeconds: number | null;
  isWarmup: boolean;
  createdAt: number;
}

interface SetRowDb {
  id: number;
  workout_id: number;
  exercise_id: number;
  position: number;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  rest_seconds: number | null;
  is_warmup: number;
  created_at: number;
}

const mapSet = (r: SetRowDb): SetRow => ({
  id: r.id,
  workoutId: r.workout_id,
  exerciseId: r.exercise_id,
  position: r.position,
  weightKg: r.weight_kg,
  reps: r.reps,
  rpe: r.rpe,
  restSeconds: r.rest_seconds,
  isWarmup: Boolean(r.is_warmup),
  createdAt: r.created_at,
});

const SELECT =
  'SELECT id, workout_id, exercise_id, position, weight_kg, reps, rpe, rest_seconds, is_warmup, created_at FROM sets';

export function insertSet(
  db: DatabaseSync,
  params: Omit<SetRow, 'id'>,
): SetRow {
  const info = db
    .prepare(
      `INSERT INTO sets
         (workout_id, exercise_id, position, weight_kg, reps, rpe, rest_seconds, is_warmup, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.workoutId,
      params.exerciseId,
      params.position,
      params.weightKg,
      params.reps,
      params.rpe,
      params.restSeconds,
      params.isWarmup ? 1 : 0,
      params.createdAt,
    );
  return { id: Number(info.lastInsertRowid), ...params };
}

export function nextSetPosition(db: DatabaseSync, workoutId: number): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(position), 0) AS maxPos FROM sets WHERE workout_id = ?')
    .get(workoutId) as { maxPos: number };
  return row.maxPos + 1;
}

export function listSetsForWorkout(db: DatabaseSync, workoutId: number): SetRow[] {
  const rows = db.prepare(`${SELECT} WHERE workout_id = ? ORDER BY position`).all(workoutId) as unknown as SetRowDb[];
  return rows.map(mapSet);
}

export function listSetsForWorkoutExercise(db: DatabaseSync, workoutId: number, exerciseId: number): SetRow[] {
  const rows = db
    .prepare(`${SELECT} WHERE workout_id = ? AND exercise_id = ? ORDER BY position`)
    .all(workoutId, exerciseId) as unknown as SetRowDb[];
  return rows.map(mapSet);
}

export function lastEffectiveSetForExercise(
  db: DatabaseSync,
  params: { userId: number; exerciseId: number; excludeWorkoutId: number },
): SetRow | undefined {
  const row = db
    .prepare(
      `SELECT s.id, s.workout_id, s.exercise_id, s.position, s.weight_kg, s.reps, s.rpe, s.rest_seconds, s.is_warmup, s.created_at
         FROM sets s
         JOIN workouts w ON w.id = s.workout_id
        WHERE w.user_id = ? AND s.exercise_id = ? AND s.workout_id != ? AND s.is_warmup = 0
        ORDER BY s.created_at DESC LIMIT 1`,
    )
    .get(params.userId, params.exerciseId, params.excludeWorkoutId) as SetRowDb | undefined;
  return row ? mapSet(row) : undefined;
}

export function listHistorySetsForExercise(
  db: DatabaseSync,
  params: { userId: number; exerciseId: number; excludeWorkoutId: number },
): SetRow[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.workout_id, s.exercise_id, s.position, s.weight_kg, s.reps, s.rpe, s.rest_seconds, s.is_warmup, s.created_at
         FROM sets s
         JOIN workouts w ON w.id = s.workout_id
        WHERE w.user_id = ? AND s.exercise_id = ? AND s.workout_id != ?
        ORDER BY s.created_at`,
    )
    .all(params.userId, params.exerciseId, params.excludeWorkoutId) as unknown as SetRowDb[];
  return rows.map(mapSet);
}

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
