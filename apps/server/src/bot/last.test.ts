import type { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
import {
  BOT_INFO,
  callbackUpdate,
  commandUpdate,
  deliverUpdate,
  lastKeyboardDatas,
  makeHarness,
  outgoingCalls,
  outgoingTexts,
  textUpdate,
} from './test-harness';

// Los renders leen el idioma del estado global; estos tests no pasan por el
// middleware de preferencias, así que lo fijan a mano.
beforeAll(() => {
  initI18n();
  setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
});

// Tipado explícito como Promise<Buffer | null>: es la firma real de renderChart y,
// sin ella, TS infiere Promise<Buffer> a partir del valor por defecto y
// `mockResolvedValueOnce(null)` (usado más abajo) deja de typecheckar.
const renderChart = vi.hoisted(() => vi.fn(async (): Promise<Buffer | null> => Buffer.from('fake-png')));
vi.mock('../charts/render', () => ({ renderChart }));

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };
const LAST_MSG = 800;
const WEEK = 7 * 86_400_000;

const EX = 1;

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  return d;
}

/** Una sesión de un ejercicio, con su serie efectiva. */
function session(d: DatabaseSync, at: number, weightKg: number, reps: number) {
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: at });
  insertSet(d, { workoutId: w.id, exerciseId: EX, position: 1, weightKg, reps, rpe: null, restSeconds: null, isWarmup: false, createdAt: at });
  finishWorkout(d, { workoutId: w.id, finishedAt: at + 1 });
}

describe('renderLast', () => {
  it('reports no history when the exercise was never trained', () => {
    const d = db();
    const name = getExerciseById(d, EX)!.name;
    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' }).text).toContain('Todavía no');
    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' }).text).toContain(name);
  });

  it('lists recent sessions and the best estimated 1RM', () => {
    const d = db();
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 1_000_000 });
    insertSet(d, { workoutId: w.id, exerciseId: EX, position: 1, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: false, createdAt: 1_000_100 });
    insertSet(d, { workoutId: w.id, exerciseId: EX, position: 2, weightKg: 62.5, reps: 6, rpe: 8, restSeconds: null, isWarmup: false, createdAt: 1_000_200 });
    finishWorkout(d, { workoutId: w.id, finishedAt: 1_000_300 });

    const text = renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' }).text;
    expect(text).toContain('60×8');
    expect(text).toContain('62.5×6');
    expect(text).toContain('1RM'); // línea del mejor 1RM
  });
});

describe('detalle de /last', () => {
  it('avisa del estancamiento cuando el récord no se supera en tres semanas entrenadas', () => {
    const d = db();
    const base = Date.UTC(2026, 0, 5, 12, 0, 0); // lunes
    session(d, base, 100, 5); // récord
    session(d, base + WEEK, 90, 5);
    session(d, base + 2 * WEEK, 92.5, 5);
    session(d, base + 3 * WEEK, 95, 5);

    const { text } = renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' });
    expect(text).toContain('⚠️');
    expect(text).toContain('3'); // tres semanas sin superarlo
  });

  it('no avisa cuando el ejercicio progresa', () => {
    const d = db();
    const base = Date.UTC(2026, 0, 5, 12, 0, 0);
    session(d, base, 90, 5);
    session(d, base + WEEK, 95, 5);
    session(d, base + 2 * WEEK, 100, 5);

    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' }).text).not.toContain('⚠️');
  });

  it('cuenta las sesiones para decidir si cabe una gráfica', () => {
    const d = db();
    const base = Date.UTC(2026, 0, 5, 12, 0, 0);
    session(d, base, 90, 5);
    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' }).sessions).toBe(1);
    session(d, base + WEEK, 95, 5);
    expect(renderLast(d, { userId: 1, exerciseId: EX, timezone: 'UTC' }).sessions).toBe(2);
  });
});

describe('botón 📈 Ver gráfica', () => {
  const base = Date.UTC(2026, 0, 5, 12, 0, 0);

  it('no aparece con una sola sesión', async () => {
    const d = db();
    session(d, base, 90, 5);
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(2, `pick:l:x:${EX}`, LAST_MSG));
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toEqual([]);
  });

  it('aparece con dos sesiones y envía la foto como mensaje aparte', async () => {
    const d = db();
    session(d, base, 90, 5);
    session(d, base + WEEK, 95, 5);
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    await bot.handleUpdate(callbackUpdate(2, `pick:l:x:${EX}`, LAST_MSG));
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toEqual([`ch:${EX}`]);
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, `ch:${EX}`, LAST_MSG));

    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(1);
    // La ruedita se apaga ANTES de renderizar.
    const methods = outgoing.map((c) => c.method);
    expect(methods.indexOf('answerCallbackQuery')).toBeLessThan(methods.indexOf('sendPhoto'));
    expect(methods).toContain('sendChatAction');
    // Acción de un solo uso sobre una pantalla transitoria: el botón se retira.
    expect(outgoingCalls(outgoing, 'editMessageReplyMarkup')).toHaveLength(1);
  });

  it('deja el detalle intacto cuando el render falla', async () => {
    renderChart.mockResolvedValueOnce(null);
    const d = db();
    session(d, base, 90, 5);
    session(d, base + WEEK, 95, 5);
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'last'));
    await bot.handleUpdate(callbackUpdate(2, `pick:l:x:${EX}`, LAST_MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, `ch:${EX}`, LAST_MSG));

    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(0);
    expect(outgoingCalls(outgoing, 'answerCallbackQuery')).toHaveLength(1); // sin error visible
  });

  it('traga el fallo de sendPhoto: sin error genérico visible (defecto #2 del brief)', async () => {
    const d = db();
    session(d, base, 90, 5);
    session(d, base + WEEK, 95, 5);
    // El harness simula que la propia llamada a Telegram falla (red, chat
    // bloqueado…), aunque el render haya funcionado. Sin guardia, esto se cuela
    // en el bot.catch global y responde "Algo salió mal" sobre una acción que
    // ya había apagado la ruedita del botón.
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG, 'sendPhoto');
    await bot.handleUpdate(commandUpdate(1, 'last'));
    await bot.handleUpdate(callbackUpdate(2, `pick:l:x:${EX}`, LAST_MSG));
    outgoing.length = 0;

    await deliverUpdate(bot, callbackUpdate(3, `ch:${EX}`, LAST_MSG));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).not.toContain('Algo salió mal');
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
