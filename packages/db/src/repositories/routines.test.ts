import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { createUser } from './users';
import {
  addRoutineExercise,
  createRoutine,
  createRoutineDay,
  getActiveRoutine,
  listRoutineDays,
  listRoutineExerciseDetails,
  listRoutines,
  setActiveRoutine,
} from './routines';

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 1, timezone: 'UTC', createdAt: 0 });
  return d;
}

describe('routines repository', () => {
  it('creates a routine and lists it (inactive by default)', () => {
    const d = db();
    const r = createRoutine(d, { userId: 1, name: 'PPL', createdAt: 100 });
    expect(r).toMatchObject({ id: 1, userId: 1, name: 'PPL', isActive: false, archived: false });
    expect(listRoutines(d, 1)).toEqual([r]);
    expect(getActiveRoutine(d, 1)).toBeUndefined();
  });

  it('activates exactly one routine at a time', () => {
    const d = db();
    const a = createRoutine(d, { userId: 1, name: 'A', createdAt: 1 });
    const b = createRoutine(d, { userId: 1, name: 'B', createdAt: 2 });
    setActiveRoutine(d, { userId: 1, routineId: a.id });
    expect(getActiveRoutine(d, 1)?.id).toBe(a.id);
    setActiveRoutine(d, { userId: 1, routineId: b.id });
    const active = getActiveRoutine(d, 1);
    expect(active?.id).toBe(b.id);
    expect(listRoutines(d, 1).filter((x) => x.isActive)).toHaveLength(1);
  });

  it('adds days and exercises and reads them back joined and ordered', () => {
    const d = db();
    const r = createRoutine(d, { userId: 1, name: 'Full body', createdAt: 1 });
    const day = createRoutineDay(d, { routineId: r.id, name: 'Día A', position: 1 });
    // ids 1 y 2 del catálogo seed
    addRoutineExercise(d, {
      routineDayId: day.id,
      exerciseId: 2,
      position: 2,
      targetSets: null,
      targetRepsMin: null,
      targetRepsMax: null,
      targetRestSeconds: null,
    });
    addRoutineExercise(d, {
      routineDayId: day.id,
      exerciseId: 1,
      position: 1,
      targetSets: 4,
      targetRepsMin: 6,
      targetRepsMax: 10,
      targetRestSeconds: 90,
    });

    expect(listRoutineDays(d, r.id)).toEqual([day]);
    const details = listRoutineExerciseDetails(d, day.id);
    expect(details.map((x) => x.exerciseId)).toEqual([1, 2]); // ordenado por position
    expect(details[0]).toMatchObject({ exerciseId: 1, targetSets: 4, targetRestSeconds: 90 });
    expect(typeof details[0]?.name).toBe('string');
    expect(details[1]).toMatchObject({ exerciseId: 2, targetSets: null, targetRestSeconds: null });
  });
});
