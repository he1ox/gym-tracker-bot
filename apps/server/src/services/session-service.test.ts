import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  finishWorkout as closeWorkout,
  getSession,
  insertSet,
  nextSetPosition,
  openDatabase,
  runMigrations,
  updateSession,
} from '@gym-tracker/db';
import {
  ValidationError,
  adjustPending,
  buildSessionView,
  finishWorkout,
  recordSet,
  startWorkout,
  switchExercise,
} from './session-service';

const EX = 1; // ejercicio 1 del catálogo seed

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', createdAt: 0 });
  return d;
}

describe('session-service', () => {
  it('startWorkout creates an active workout and a session', () => {
    const d = db();
    const s = startWorkout(d, { userId: 1, chatId: 555, routineDayId: null, dayNameSnapshot: null, now: 1000 });
    expect(s.workoutId).toBeGreaterThan(0);
    expect(s.currentExerciseId).toBeNull();
    expect(getSession(d, 1)?.workoutId).toBe(s.workoutId);
  });

  it('recordSet rejects non-positive weight and reps < 1', () => {
    const d = db();
    const s = startWorkout(d, { userId: 1, chatId: 555, routineDayId: null, dayNameSnapshot: null, now: 1000 });
    switchExercise(d, { session: s, exerciseId: EX, now: 1000 });
    const session = getSession(d, 1)!;
    expect(() => recordSet(d, { session, weightKg: 0, reps: 8, rpe: null, isWarmup: false, now: 1 })).toThrow(ValidationError);
    expect(() => recordSet(d, { session, weightKg: 60, reps: 0, rpe: null, isWarmup: false, now: 1 })).toThrow(ValidationError);
  });

  it('recordSet inserts a set and updates pending to the recorded values', () => {
    const d = db();
    const s = startWorkout(d, { userId: 1, chatId: 555, routineDayId: null, dayNameSnapshot: null, now: 1000 });
    switchExercise(d, { session: s, exerciseId: EX, now: 1000 });
    const { set } = recordSet(d, { session: getSession(d, 1)!, weightKg: 60, reps: 8, rpe: null, isWarmup: false, now: 1100 });
    expect(set).toMatchObject({ exerciseId: EX, weightKg: 60, reps: 8, position: 1, isWarmup: false });
    const after = getSession(d, 1)!;
    expect(after.pendingWeightKg).toBe(60);
    expect(after.pendingReps).toBe(8);
    expect(after.nextSetIsWarmup).toBe(false);
  });

  it('switchExercise seeds pending from the last historical set', () => {
    const d = db();
    const past = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    insertSet(d, { workoutId: past.id, exerciseId: EX, position: nextSetPosition(d, past.id), weightKg: 62.5, reps: 7, rpe: null, restSeconds: null, isWarmup: false, createdAt: 100 });
    closeWorkout(d, { workoutId: past.id, finishedAt: 200 });

    const s = startWorkout(d, { userId: 1, chatId: 555, routineDayId: null, dayNameSnapshot: null, now: 1000 });
    switchExercise(d, { session: s, exerciseId: EX, now: 1000 });
    const session = getSession(d, 1)!;
    expect(session.pendingWeightKg).toBe(62.5);
    expect(session.pendingReps).toBe(7);
  });

  it('buildSessionView reflects choosing vs in-exercise states', () => {
    const d = db();
    const s = startWorkout(d, { userId: 1, chatId: 555, routineDayId: null, dayNameSnapshot: 'Empuje', now: 1000 });
    expect(buildSessionView(d, getSession(d, 1)!).kind).toBe('choosing_exercise');
    switchExercise(d, { session: s, exerciseId: EX, now: 1000 });
    recordSet(d, { session: getSession(d, 1)!, weightKg: 60, reps: 8, rpe: null, isWarmup: false, now: 1100 });
    const view = buildSessionView(d, getSession(d, 1)!);
    expect(view.kind).toBe('in_exercise');
    if (view.kind === 'in_exercise') {
      expect(view.today).toEqual([{ weightKg: 60, reps: 8 }]);
      expect(view.header.effectiveSets).toBe(1);
    }
  });

  it('adjustPending applies weight/rep steps, clamps at zero, and avoids float drift', () => {
    const d = db();
    const s = startWorkout(d, { userId: 1, chatId: 555, routineDayId: null, dayNameSnapshot: null, now: 1000 });
    switchExercise(d, { session: s, exerciseId: EX, now: 1000 });

    // Peso: paso +2.5 desde null (tratado como 0)
    adjustPending(d, { session: getSession(d, 1)!, weightDelta: 2.5, now: 1100 });
    expect(getSession(d, 1)!.pendingWeightKg).toBe(2.5);

    // Reps: paso +1
    adjustPending(d, { session: getSession(d, 1)!, repsDelta: 1, now: 1200 });
    expect(getSession(d, 1)!.pendingReps).toBe(1);

    // Reps: paso -1 vuelve a 0
    adjustPending(d, { session: getSession(d, 1)!, repsDelta: -1, now: 1300 });
    expect(getSession(d, 1)!.pendingReps).toBe(0);

    // Reps: no baja de 0 (clamp)
    adjustPending(d, { session: getSession(d, 1)!, repsDelta: -1, now: 1400 });
    expect(getSession(d, 1)!.pendingReps).toBe(0);

    // Peso: paso -2.5 vuelve a 0
    adjustPending(d, { session: getSession(d, 1)!, weightDelta: -2.5, now: 1500 });
    expect(getSession(d, 1)!.pendingWeightKg).toBe(0);

    // Peso: no baja de 0 (clamp)
    adjustPending(d, { session: getSession(d, 1)!, weightDelta: -2.5, now: 1600 });
    expect(getSession(d, 1)!.pendingWeightKg).toBe(0);

    // Peso: redondea a un decimal sin arrastre de coma flotante (0.1 + 0.2 = 0.30000000000000004 sin redondeo)
    adjustPending(d, { session: getSession(d, 1)!, weightDelta: 0.1, now: 1700 });
    expect(getSession(d, 1)!.pendingWeightKg).toBe(0.1);
    adjustPending(d, { session: getSession(d, 1)!, weightDelta: 0.2, now: 1800 });
    expect(getSession(d, 1)!.pendingWeightKg).toBe(0.3);
  });

  it('finishWorkout closes the workout, deletes the session and reports a record', () => {
    const d = db();
    // histórico previo, 1RM bajo
    const past = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    insertSet(d, { workoutId: past.id, exerciseId: EX, position: 1, weightKg: 60, reps: 5, rpe: null, restSeconds: null, isWarmup: false, createdAt: 100 });
    closeWorkout(d, { workoutId: past.id, finishedAt: 200 });

    const s = startWorkout(d, { userId: 1, chatId: 555, routineDayId: null, dayNameSnapshot: 'Empuje', now: 1000 });
    switchExercise(d, { session: s, exerciseId: EX, now: 1000 });
    recordSet(d, { session: getSession(d, 1)!, weightKg: 100, reps: 5, rpe: null, isWarmup: false, now: 1100 });

    const summary = finishWorkout(d, { session: getSession(d, 1)!, now: 1000 + 47 * 60000 });
    expect(getSession(d, 1)).toBeUndefined();
    expect(summary.effectiveSets).toBe(1);
    expect(summary.durationMinutes).toBe(47);
    expect(summary.records).toHaveLength(1);
    expect(summary.records[0]?.estimated1RM).toBeGreaterThan(summary.records[0]?.previous1RM ?? 0);
  });
});
