import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { createUser } from './users';
import { createWorkout } from './workouts';
import { createSession, deleteSession, getSession, updateSession } from './bot-sessions';

function seeded() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 1, timezone: 'UTC', createdAt: 0 });
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
  return { d, workoutId: w.id };
}

describe('bot-sessions repository', () => {
  it('creates a session with sensible defaults', () => {
    const { d, workoutId } = seeded();
    const s = createSession(d, { userId: 1, workoutId, chatId: 555, updatedAt: 10 });
    expect(s).toEqual({
      userId: 1,
      workoutId,
      chatId: 555,
      messageId: null,
      currentExerciseId: null,
      pendingWeightKg: null,
      pendingReps: null,
      nextSetIsWarmup: false,
      ephemeralMessageId: null,
      updatedAt: 10,
    });
    expect(getSession(d, 1)).toEqual(s);
  });

  it('patches only the given fields and bumps updated_at', () => {
    const { d, workoutId } = seeded();
    createSession(d, { userId: 1, workoutId, chatId: 555, updatedAt: 10 });
    updateSession(d, 1, { messageId: 900, currentExerciseId: 1, pendingWeightKg: 60, pendingReps: 8 }, 20);
    const s = getSession(d, 1);
    expect(s).toMatchObject({ messageId: 900, currentExerciseId: 1, pendingWeightKg: 60, pendingReps: 8, updatedAt: 20 });
    updateSession(d, 1, { nextSetIsWarmup: true }, 30);
    expect(getSession(d, 1)).toMatchObject({ nextSetIsWarmup: true, pendingWeightKg: 60, updatedAt: 30 });
  });

  it('can null out a field via patch', () => {
    const { d, workoutId } = seeded();
    createSession(d, { userId: 1, workoutId, chatId: 555, updatedAt: 10 });
    updateSession(d, 1, { ephemeralMessageId: 123 }, 20);
    expect(getSession(d, 1)?.ephemeralMessageId).toBe(123);
    updateSession(d, 1, { ephemeralMessageId: null }, 30);
    expect(getSession(d, 1)?.ephemeralMessageId).toBeNull();
  });

  it('deletes the session', () => {
    const { d, workoutId } = seeded();
    createSession(d, { userId: 1, workoutId, chatId: 555, updatedAt: 10 });
    deleteSession(d, 1);
    expect(getSession(d, 1)).toBeUndefined();
  });
});
