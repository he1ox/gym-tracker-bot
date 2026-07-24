import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  finishWorkout,
  getExerciseById,
  insertSet,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import { renderLast } from './last';

const EX = 1;

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', createdAt: 0 });
  return d;
}

describe('renderLast', () => {
  it('reports no history when the exercise was never trained', () => {
    const d = db();
    const name = getExerciseById(d, EX)!.name;
    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' })).toContain('Todavía no');
    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' })).toContain(name);
  });

  it('lists recent sessions and the best estimated 1RM', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 1_000_000 });
    insertSet(d, { workoutId: w.id, exerciseId: EX, position: 1, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: false, createdAt: 1_000_100 });
    insertSet(d, { workoutId: w.id, exerciseId: EX, position: 2, weightKg: 62.5, reps: 6, rpe: 8, restSeconds: null, isWarmup: false, createdAt: 1_000_200 });
    finishWorkout(d, { workoutId: w.id, finishedAt: 1_000_300 });

    const text = renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' });
    expect(text).toContain('60×8');
    expect(text).toContain('62.5×6');
    expect(text).toContain('1RM'); // línea del mejor 1RM
  });
});
