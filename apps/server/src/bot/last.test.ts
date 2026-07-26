import { beforeAll, describe, expect, it } from 'vitest';
import { setCurrent } from '../i18n/current';
import { initI18n } from '../i18n/index';
import { MUSCLE_GROUPS } from '@gym-tracker/core';
import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  finishWorkout,
  getExerciseById,
  insertSet,
  listExercisesByMuscleGroup,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import { renderLast } from './last';
import { BOT_INFO, callbackUpdate, commandUpdate, lastKeyboardDatas, makeHarness, outgoingTexts, textUpdate } from './test-harness';

// Los renders leen el idioma del estado global; estos tests no pasan por el
// middleware de preferencias, así que lo fijan a mano.
beforeAll(() => {
  initI18n();
  setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
});


const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };
const LAST_MSG = 800;

const EX = 1;

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
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

describe('/last with the exercise picker', () => {
  it('opens the group menu when called with no argument', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('grupo muscular');
    expect(lastKeyboardDatas(outgoing, 'sendMessage').some((x) => x.startsWith('pick:l:g:'))).toBe(true);
  });

  it('offers candidate buttons for an ambiguous query', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(textUpdate(1, '/last polea'));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).not.toContain('Sé más específico');
    expect(lastKeyboardDatas(outgoing, 'sendMessage').some((x) => x.startsWith('pick:l:x:'))).toBe(true);
  });

  it('offers the group menu when the query matches nothing', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(textUpdate(1, '/last zancada rusa inexistente'));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('No encontré');
    expect(lastKeyboardDatas(outgoing, 'sendMessage')).toContain('pick:l:g');
  });

  it('navigates groups in place and shows the history for the chosen exercise', async () => {
    const d = db();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const first = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);

    await bot.handleUpdate(commandUpdate(1, 'last'));
    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(2, `pick:l:g:${chestIndex}:0`, LAST_MSG));
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toContain(`pick:l:x:${first.id}`);

    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(3, `pick:l:x:${first.id}`, LAST_MSG));
    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain(first.name);
  });

  it('goes back to the group list from a group', async () => {
    const d = db();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    await bot.handleUpdate(callbackUpdate(2, `pick:l:g:${chestIndex}:0`, LAST_MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, 'pick:l:g', LAST_MSG));
    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('grupo muscular');
  });

  it('points to /last <nombre> from the search button instead of asking to type (F1)', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(2, 'pick:l:s', LAST_MSG));
    const answered = outgoing.filter((c) => c.method === 'answerCallbackQuery');
    // /last no tiene listener de texto libre: el toast debe mandar a /last <nombre>,
    // no invitar a escribir (eso caería en el handler de captura, ver F1).
    expect(answered.some((c) => String(c.payload.text ?? '').includes('/last'))).toBe(true);
  });

  it('does not register a message:text listener that could hijack a live workout (F1)', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(2, 'pick:l:s', LAST_MSG));
    outgoing.length = 0;
    await bot.handleUpdate(textUpdate(3, 'sentadilla'));

    // Sin sesión activa de captura, el texto libre debe caer en el mensaje de
    // "sin sesión activa", NUNCA silenciosamente interpretarse como /last.
    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('No tienes una sesión activa');
  });
});
