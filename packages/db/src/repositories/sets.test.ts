import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { createUser } from './users';
import { createWorkout, finishWorkout } from './workouts';
import {
  insertSet,
  lastEffectiveSetForExercise,
  listHistorySetsForExercise,
  listSetsForWorkout,
  listSetsForWorkoutExercise,
  nextSetPosition,
} from './sets';

const EX = 1; // ejercicio 1 del catálogo seed

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 1, timezone: 'UTC', createdAt: 0 });
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
