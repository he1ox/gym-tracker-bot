import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { createUser } from './users';
import { createWorkout, finishWorkout } from './workouts';
import { createCustomExercise, getExerciseById } from './exercises';
import {
  insertSet,
  lastEffectiveSetForExercise,
  listEffectiveSetsBetween,
  listEffectiveSetsForUser,
  listHistorySetsForExercise,
  listSetsForWorkout,
  listSetsForWorkoutExercise,
  nextSetPosition,
} from './sets';

const EX = 1; // ejercicio 1 del catálogo seed

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 1, timezone: 'UTC', locale: 'es', createdAt: 0 });
  return d;
}

function add(d: ReturnType<typeof db>, workoutId: number, over: Partial<Parameters<typeof insertSet>[1]> = {}) {
  return insertSet(d, {
    workoutId,
    exerciseId: EX,
    position: nextSetPosition(d, workoutId),
    weightKg: 60,
    reps: 8,
    rpe: null,
    restSeconds: null,
    isWarmup: false,
    createdAt: 1000,
    ...over,
  });
}

describe('sets repository', () => {
  it('assigns incrementing positions and lists in order', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, w.id, { weightKg: 60 });
    add(d, w.id, { weightKg: 62.5 });
    const list = listSetsForWorkout(d, w.id);
    expect(list.map((s) => s.position)).toEqual([1, 2]);
    expect(list.map((s) => s.weightKg)).toEqual([60, 62.5]);
    expect(listSetsForWorkoutExercise(d, w.id, EX)).toHaveLength(2);
  });

  it('finds the last effective set for an exercise across finished workouts', () => {
    const d = db();
    const old = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, old.id, { weightKg: 60, reps: 8, createdAt: 1000 });
    add(d, old.id, { weightKg: 100, reps: 3, isWarmup: true, createdAt: 1100 }); // calentamiento: se ignora
    add(d, old.id, { weightKg: 62.5, reps: 7, createdAt: 1200 });
    finishWorkout(d, { workoutId: old.id, finishedAt: 2000 });

    const current = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 3000 });
    const last = lastEffectiveSetForExercise(d, { userId: 1, exerciseId: EX, excludeWorkoutId: current.id });
    expect(last).toMatchObject({ weightKg: 62.5, reps: 7, isWarmup: false });
  });

  it('lists history sets excluding the current workout', () => {
    const d = db();
    const past = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, past.id, { weightKg: 60, createdAt: 1000 });
    finishWorkout(d, { workoutId: past.id, finishedAt: 1500 });
    const current = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 2000 });
    add(d, current.id, { weightKg: 65, createdAt: 2100 });

    const history = listHistorySetsForExercise(d, { userId: 1, exerciseId: EX, excludeWorkoutId: current.id });
    expect(history).toHaveLength(1);
    expect(history[0]?.weightKg).toBe(60);
  });
});

describe('listEffectiveSetsBetween', () => {
  it('includes both boundaries and excludes what falls outside', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, w.id, { createdAt: 999 });
    add(d, w.id, { createdAt: 1000 });
    add(d, w.id, { createdAt: 2000 });
    add(d, w.id, { createdAt: 2001 });

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 1000, toMs: 2000 });
    expect(rows.map((r) => r.createdAt)).toEqual([1000, 2000]);
  });

  it('excludes warmup sets', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, w.id, { createdAt: 1000, isWarmup: true });
    add(d, w.id, { createdAt: 1100, isWarmup: false });

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdAt).toBe(1100);
  });

  it('isolates by user_id', () => {
    const d = db();
    createUser(d, { telegramUserId: 2, timezone: 'UTC', locale: 'es', createdAt: 0 });
    const mine = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    const theirs = createWorkout(d, { userId: 2, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, mine.id, { createdAt: 1000, weightKg: 60 });
    add(d, theirs.id, { createdAt: 1000, weightKg: 200 });

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.weightKg).toBe(60);
  });

  it('joins the exercise name, including a custom one', () => {
    const d = db();
    const own = createCustomExercise(d, { userId: 1, name: 'Curl <martillo> & polea', muscleGroup: 'biceps' });
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, w.id, { createdAt: 1000, exerciseId: own.id });

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 });
    expect(rows[0]?.exerciseName).toBe('Curl <martillo> & polea');
  });

  it('trae el grupo muscular de cada serie efectiva', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    const exercise = getExerciseById(d, EX)!;
    add(d, w.id, { createdAt: 1_000 });

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 2_000 });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.muscleGroup).toBe(exercise.muscleGroup);
    // El resto del contrato no cambia: buildOverview sigue recibiendo lo mismo.
    expect(rows[0]?.exerciseName).toBe(exercise.name);
    expect(rows[0]?.weightKg).toBe(60);
  });

  it('incluye las series de un ejercicio archivado, con su grupo', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    add(d, w.id, { createdAt: 1_000 });
    d.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(EX);

    const rows = listEffectiveSetsBetween(d, { userId: 1, fromMs: 0, toMs: 2_000 });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.muscleGroup).toBe(getExerciseById(d, EX)!.muscleGroup);
  });
});

describe('listEffectiveSetsForUser', () => {
  it('lista las series efectivas de todos los ejercicios del usuario en una consulta', () => {
    const d = db();
    createUser(d, { telegramUserId: 222, timezone: 'UTC', locale: 'es', createdAt: 0 });
    const mine = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    const theirs = createWorkout(d, { userId: 2, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    insertSet(d, { workoutId: mine.id, exerciseId: 1, position: 1, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: false, createdAt: 1_000 });
    insertSet(d, { workoutId: mine.id, exerciseId: 2, position: 2, weightKg: 40, reps: 10, rpe: null, restSeconds: null, isWarmup: true, createdAt: 1_100 });
    insertSet(d, { workoutId: theirs.id, exerciseId: 1, position: 1, weightKg: 99, reps: 1, rpe: null, restSeconds: null, isWarmup: false, createdAt: 1_200 });

    const rows = listEffectiveSetsForUser(d, 1);

    expect(rows).toEqual([{ exerciseId: 1, weightKg: 60, reps: 8, createdAt: 1_000 }]);
  });
});
