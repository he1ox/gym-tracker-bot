import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS_DIR,
  createUser,
  getExerciseById,
  listRoutineDays,
  listRoutineExerciseDetails,
  listRoutines,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import { makeHarness, callbackUpdate, textUpdate, BOT_INFO } from './test-harness';

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', createdAt: 0 });
  return d;
}

describe('/routines wizard (happy path)', () => {
  it('creates a routine with one day and one exercise and activates it', async () => {
    const d = db();
    const exercise = getExerciseById(d, 1)!; // nombre del catálogo
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Empuje'));
    await bot.handleUpdate(textUpdate(next(), exercise.name)); // match único
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:skiptargets', 700)); // Saltar objetivos
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:daydone', 700)); // cerrar día
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:done', 700)); // terminar días

    const routines = listRoutines(d, 1);
    expect(routines).toHaveLength(1);
    expect(routines[0]?.isActive).toBe(true); // primera rutina → activa
    const days = listRoutineDays(d, routines[0]!.id);
    expect(days.map((x) => x.name)).toEqual(['Empuje']);
    const exercises = listRoutineExerciseDetails(d, days[0]!.id);
    expect(exercises.map((x) => x.exerciseId)).toEqual([exercise.id]);
    expect(exercises[0]?.targetSets).toBeNull(); // objetivos saltados
  });
});
