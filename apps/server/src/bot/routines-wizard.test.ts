import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '@gym-tracker/core';
import {
  MIGRATIONS_DIR,
  createUser,
  getExerciseById,
  listCatalogAndOwn,
  listExercisesByMuscleGroup,
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

describe('/routines wizard with the exercise picker', () => {
  it('adds an exercise picked from the group menu, without typing its name', async () => {
    const d = db();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const target = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Empuje'));
    await bot.handleUpdate(callbackUpdate(next(), 'pick:c:g', 700)); // "Ver por grupo"
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:g:${chestIndex}:0`, 700));
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:x:${target.id}`, 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:skiptargets', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:daydone', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:done', 700));

    const routines = listRoutines(d, 1);
    const days = listRoutineDays(d, routines[0]!.id);
    const exercises = listRoutineExerciseDetails(d, days[0]!.id);
    expect(exercises.map((x) => x.exerciseId)).toEqual([target.id]);
  });

  it('turns an ambiguous typed query into candidate buttons', async () => {
    const d = db();
    const candidates = listCatalogAndOwn(d, 1).filter((e) =>
      e.name.toLowerCase().includes('polea'),
    );
    expect(candidates.length).toBeGreaterThan(1); // premisa del test
    const chosen = candidates[0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Tirón'));
    outgoing.length = 0;
    await bot.handleUpdate(textUpdate(next(), 'polea'));

    const datas = outgoing
      .filter((c) => c.method === 'sendMessage')
      .flatMap((c) => {
        const markup = c.payload.reply_markup as
          | { inline_keyboard?: Array<Array<{ callback_data?: string }>> }
          | undefined;
        return (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? '');
      });
    expect(datas.some((x) => x.startsWith('pick:c:x:'))).toBe(true);

    await bot.handleUpdate(callbackUpdate(next(), `pick:c:x:${chosen.id}`, 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:skiptargets', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:daydone', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:done', 700));

    const days = listRoutineDays(d, listRoutines(d, 1)[0]!.id);
    expect(listRoutineExerciseDetails(d, days[0]!.id).map((x) => x.exerciseId)).toEqual([chosen.id]);
  });
});
