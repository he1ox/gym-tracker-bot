import { MUSCLE_GROUPS, type MuscleGroup } from '@gym-tracker/core';
import type { DatabaseSync } from 'node:sqlite';

export interface ExerciseRow {
  id: number;
  userId: number | null;
  name: string;
  muscleGroup: MuscleGroup;
  isCustom: boolean;
  archived: boolean;
}

interface ExerciseRowDb {
  id: number;
  user_id: number | null;
  name: string;
  muscle_group: MuscleGroup;
  is_custom: number;
  archived: number;
}

const mapExercise = (r: ExerciseRowDb): ExerciseRow => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  muscleGroup: r.muscle_group,
  isCustom: Boolean(r.is_custom),
  archived: Boolean(r.archived),
});

const SELECT = 'SELECT id, user_id, name, muscle_group, is_custom, archived FROM exercises';

export function getExerciseById(db: DatabaseSync, id: number): ExerciseRow | undefined {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as ExerciseRowDb | undefined;
  return row ? mapExercise(row) : undefined;
}

export function createCustomExercise(
  db: DatabaseSync,
  params: { userId: number; name: string; muscleGroup: MuscleGroup },
): ExerciseRow {
  const info = db
    .prepare('INSERT INTO exercises (user_id, name, muscle_group, is_custom, archived) VALUES (?, ?, ?, 1, 0)')
    .run(params.userId, params.name, params.muscleGroup);
  return {
    id: Number(info.lastInsertRowid),
    userId: params.userId,
    name: params.name,
    muscleGroup: params.muscleGroup,
    isCustom: true,
    archived: false,
  };
}

export function listCatalogAndOwn(db: DatabaseSync, userId: number): ExerciseRow[] {
  const rows = db
    .prepare(
      `${SELECT} WHERE (user_id IS NULL OR user_id = ?) AND archived = 0 ORDER BY name COLLATE NOCASE`,
    )
    .all(userId) as unknown as ExerciseRowDb[];
  return rows.map(mapExercise);
}

export interface ExerciseOption {
  id: number;
  name: string;
}

/**
 * Catálogo + ejercicios propios no archivados, agrupados por grupo muscular.
 * Solo aparecen los grupos con al menos un ejercicio; las claves siguen el orden
 * anatómico de MUSCLE_GROUPS para que el índice del callback_data sea estable.
 */
export function listExercisesByMuscleGroup(
  db: DatabaseSync,
  userId: number,
): Map<MuscleGroup, ExerciseOption[]> {
  const rows = db
    .prepare(
      `SELECT id, name, muscle_group FROM exercises
       WHERE (user_id IS NULL OR user_id = ?) AND archived = 0
       ORDER BY name COLLATE NOCASE`,
    )
    .all(userId) as unknown as Array<{ id: number; name: string; muscle_group: MuscleGroup }>;

  const buckets = new Map<MuscleGroup, ExerciseOption[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.muscle_group);
    if (bucket) {
      bucket.push({ id: row.id, name: row.name });
    } else {
      buckets.set(row.muscle_group, [{ id: row.id, name: row.name }]);
    }
  }

  // Reconstruye el mapa en orden anatómico: el orden de inserción de un Map es
  // el de llegada de las filas, que va por nombre, no por grupo.
  const ordered = new Map<MuscleGroup, ExerciseOption[]>();
  for (const group of MUSCLE_GROUPS) {
    const options = buckets.get(group);
    if (options !== undefined && options.length > 0) {
      ordered.set(group, options);
    }
  }
  return ordered;
}
