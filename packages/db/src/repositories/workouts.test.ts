import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { createUser } from './users';
import { createWorkout, finishWorkout, getActiveWorkout, getWorkoutById } from './workouts';

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 1, timezone: 'UTC', createdAt: 0 });
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
