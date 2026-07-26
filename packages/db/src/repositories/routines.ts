import type { MuscleGroup } from '@gym-tracker/core';
import type { DatabaseSync } from 'node:sqlite';

export interface RoutineRow {
  id: number;
  userId: number;
  name: string;
  isActive: boolean;
  archived: boolean;
  createdAt: number;
}

export interface RoutineDayRow {
  id: number;
  routineId: number;
  name: string;
  position: number;
}

export interface RoutineExerciseDetail {
  id: number;
  routineDayId: number;
  exerciseId: number;
  position: number;
  name: string;
  nameKey: string | null;
  muscleGroup: MuscleGroup;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetRestSeconds: number | null;
}

interface RoutineRowDb {
  id: number;
  user_id: number;
  name: string;
  is_active: number;
  archived: number;
  created_at: number;
}

const mapRoutine = (r: RoutineRowDb): RoutineRow => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  isActive: Boolean(r.is_active),
  archived: Boolean(r.archived),
  createdAt: r.created_at,
});

const ROUTINE_SELECT = 'SELECT id, user_id, name, is_active, archived, created_at FROM routines';

export function listRoutines(db: DatabaseSync, userId: number): RoutineRow[] {
  const rows = db
    .prepare(`${ROUTINE_SELECT} WHERE user_id = ? AND archived = 0 ORDER BY created_at`)
    .all(userId) as unknown as RoutineRowDb[];
  return rows.map(mapRoutine);
}

export function getActiveRoutine(db: DatabaseSync, userId: number): RoutineRow | undefined {
  const row = db
    .prepare(`${ROUTINE_SELECT} WHERE user_id = ? AND is_active = 1 AND archived = 0`)
    .get(userId) as RoutineRowDb | undefined;
  return row ? mapRoutine(row) : undefined;
}

export function createRoutine(
  db: DatabaseSync,
  params: { userId: number; name: string; createdAt: number },
): RoutineRow {
  const info = db
    .prepare('INSERT INTO routines (user_id, name, is_active, archived, created_at) VALUES (?, ?, 0, 0, ?)')
    .run(params.userId, params.name, params.createdAt);
  return {
    id: Number(info.lastInsertRowid),
    userId: params.userId,
    name: params.name,
    isActive: false,
    archived: false,
    createdAt: params.createdAt,
  };
}

export function setActiveRoutine(db: DatabaseSync, params: { userId: number; routineId: number }): void {
  db.prepare('UPDATE routines SET is_active = 0 WHERE user_id = ?').run(params.userId);
  db.prepare('UPDATE routines SET is_active = 1 WHERE id = ? AND user_id = ?').run(
    params.routineId,
    params.userId,
  );
}

export function createRoutineDay(
  db: DatabaseSync,
  params: { routineId: number; name: string; position: number },
): RoutineDayRow {
  const info = db
    .prepare('INSERT INTO routine_days (routine_id, name, position) VALUES (?, ?, ?)')
    .run(params.routineId, params.name, params.position);
  return { id: Number(info.lastInsertRowid), routineId: params.routineId, name: params.name, position: params.position };
}

export function listRoutineDays(db: DatabaseSync, routineId: number): RoutineDayRow[] {
  const rows = db
    .prepare('SELECT id, routine_id, name, position FROM routine_days WHERE routine_id = ? ORDER BY position')
    .all(routineId) as Array<{ id: number; routine_id: number; name: string; position: number }>;
  return rows.map((r) => ({ id: r.id, routineId: r.routine_id, name: r.name, position: r.position }));
}

export function getRoutineDayById(db: DatabaseSync, id: number): RoutineDayRow | undefined {
  const r = db
    .prepare('SELECT id, routine_id, name, position FROM routine_days WHERE id = ?')
    .get(id) as { id: number; routine_id: number; name: string; position: number } | undefined;
  return r ? { id: r.id, routineId: r.routine_id, name: r.name, position: r.position } : undefined;
}

export function addRoutineExercise(
  db: DatabaseSync,
  params: {
    routineDayId: number;
    exerciseId: number;
    position: number;
    targetSets: number | null;
    targetRepsMin: number | null;
    targetRepsMax: number | null;
    targetRestSeconds: number | null;
  },
): void {
  db.prepare(
    `INSERT INTO routine_exercises
       (routine_day_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_rest_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.routineDayId,
    params.exerciseId,
    params.position,
    params.targetSets,
    params.targetRepsMin,
    params.targetRepsMax,
    params.targetRestSeconds,
  );
}

interface RoutineExerciseDetailDb {
  id: number;
  routine_day_id: number;
  exercise_id: number;
  position: number;
  name: string;
  name_key: string | null;
  muscle_group: MuscleGroup;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_rest_seconds: number | null;
}

export function listRoutineExerciseDetails(db: DatabaseSync, routineDayId: number): RoutineExerciseDetail[] {
  const rows = db
    .prepare(
      `SELECT re.id, re.routine_day_id, re.exercise_id, re.position,
              e.name, e.name_key, e.muscle_group,
              re.target_sets, re.target_reps_min, re.target_reps_max, re.target_rest_seconds
         FROM routine_exercises re
         JOIN exercises e ON e.id = re.exercise_id
        WHERE re.routine_day_id = ?
        ORDER BY re.position`,
    )
    .all(routineDayId) as unknown as RoutineExerciseDetailDb[];
  return rows.map((r) => ({
    id: r.id,
    routineDayId: r.routine_day_id,
    exerciseId: r.exercise_id,
    position: r.position,
    name: r.name,
    nameKey: r.name_key,
    muscleGroup: r.muscle_group,
    targetSets: r.target_sets,
    targetRepsMin: r.target_reps_min,
    targetRepsMax: r.target_reps_max,
    targetRestSeconds: r.target_rest_seconds,
  }));
}
