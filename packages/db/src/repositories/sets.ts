import type { DatabaseSync } from 'node:sqlite';

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
