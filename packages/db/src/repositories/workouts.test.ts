import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { createUser } from './users';
import {
  createWorkout,
  finishWorkout,
  getActiveWorkout,
  getWorkoutById,
  listWorkoutStartsBetween,
} from './workouts';

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 1, timezone: 'UTC', locale: 'es', createdAt: 0 });
  return d;
}

describe('workouts repository', () => {
  it('creates a free workout and finds it as active', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 1000 });
    expect(w).toMatchObject({ id: 1, userId: 1, routineDayId: null, finishedAt: null });
    expect(getActiveWorkout(d, 1)?.id).toBe(w.id);
  });

  it('finishing a workout clears it from active', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: 'Empuje', startedAt: 1000 });
    finishWorkout(d, { workoutId: w.id, finishedAt: 5000 });
    expect(getActiveWorkout(d, 1)).toBeUndefined();
    expect(getWorkoutById(d, w.id)?.finishedAt).toBe(5000);
  });
});

describe('listWorkoutStartsBetween', () => {
  it('includes both boundaries and excludes what falls outside', () => {
    const d = db();
    for (const startedAt of [999, 1000, 2000, 2001]) {
      createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt });
    }
    expect(listWorkoutStartsBetween(d, { userId: 1, fromMs: 1000, toMs: 2000 })).toEqual([1000, 2000]);
  });

  it('counts unfinished workouts too', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 1500 });
    expect(w.finishedAt).toBeNull();
    expect(listWorkoutStartsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 })).toEqual([1500]);
  });

  it('isolates by user_id', () => {
    const d = db();
    createUser(d, { telegramUserId: 2, timezone: 'UTC', locale: 'es', createdAt: 0 });
    createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 1000 });
    createWorkout(d, { userId: 2, routineDayId: null, dayNameSnapshot: null, startedAt: 1000 });
    expect(listWorkoutStartsBetween(d, { userId: 1, fromMs: 0, toMs: 9999 })).toHaveLength(1);
  });
});
