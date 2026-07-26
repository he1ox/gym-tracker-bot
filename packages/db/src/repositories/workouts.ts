import type { DatabaseSync } from 'node:sqlite';

export interface WorkoutRow {
  id: number;
  userId: number;
  routineDayId: number | null;
  dayNameSnapshot: string | null;
  startedAt: number;
  finishedAt: number | null;
  notes: string | null;
}

interface WorkoutRowDb {
  id: number;
  user_id: number;
  routine_day_id: number | null;
  day_name_snapshot: string | null;
  started_at: number;
  finished_at: number | null;
  notes: string | null;
}

const mapWorkout = (r: WorkoutRowDb): WorkoutRow => ({
  id: r.id,
  userId: r.user_id,
  routineDayId: r.routine_day_id,
  dayNameSnapshot: r.day_name_snapshot,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  notes: r.notes,
});

const SELECT =
  'SELECT id, user_id, routine_day_id, day_name_snapshot, started_at, finished_at, notes FROM workouts';

export function createWorkout(
  db: DatabaseSync,
  params: { userId: number; routineDayId: number | null; dayNameSnapshot: string | null; startedAt: number },
): WorkoutRow {
  const info = db
    .prepare(
      'INSERT INTO workouts (user_id, routine_day_id, day_name_snapshot, started_at) VALUES (?, ?, ?, ?)',
    )
    .run(params.userId, params.routineDayId, params.dayNameSnapshot, params.startedAt);
  return {
    id: Number(info.lastInsertRowid),
    userId: params.userId,
    routineDayId: params.routineDayId,
    dayNameSnapshot: params.dayNameSnapshot,
    startedAt: params.startedAt,
    finishedAt: null,
    notes: null,
  };
}

export function getActiveWorkout(db: DatabaseSync, userId: number): WorkoutRow | undefined {
  const row = db
    .prepare(`${SELECT} WHERE user_id = ? AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1`)
    .get(userId) as WorkoutRowDb | undefined;
  return row ? mapWorkout(row) : undefined;
}

export function getWorkoutById(db: DatabaseSync, id: number): WorkoutRow | undefined {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as WorkoutRowDb | undefined;
  return row ? mapWorkout(row) : undefined;
}

export function finishWorkout(db: DatabaseSync, params: { workoutId: number; finishedAt: number }): void {
  db.prepare('UPDATE workouts SET finished_at = ? WHERE id = ?').run(params.finishedAt, params.workoutId);
}

/**
 * `started_at` de los entrenamientos del usuario en `[fromMs, toMs]`, ambos
 * inclusive. Incluye los no terminados: un entrenamiento cuenta por haber
 * empezado, tenga o no series efectivas (spec §3).
 */
export function listWorkoutStartsBetween(
  db: DatabaseSync,
  params: { userId: number; fromMs: number; toMs: number },
): number[] {
  const rows = db
    .prepare(
      `SELECT started_at FROM workouts
        WHERE user_id = ? AND started_at >= ? AND started_at <= ?
        ORDER BY started_at`,
    )
    .all(params.userId, params.fromMs, params.toMs) as unknown as Array<{ started_at: number }>;
  return rows.map((r) => r.started_at);
}
