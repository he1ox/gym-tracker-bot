import type { Overview } from '@gym-tracker/core';
import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  insertSet,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setCurrent } from '../i18n/current';
import { initI18n } from '../i18n/index';
import { BOT_INFO, callbackUpdate, makeHarness, outgoingCalls } from './test-harness';
import { botCommands, escapeHtml, renderHelp, renderWelcome, setBotCommands } from './welcome';

// El renderizador real abre un canvas y tarda; aquí solo importa QUÉ se envía.
// El PNG de verdad lo cubre charts/render.test.ts.
const renderChart = vi.hoisted(() => vi.fn(async () => Buffer.from('fake-png')));
vi.mock('../charts/render', () => ({ renderChart }));

// Los renders leen el idioma del estado global; estos tests no pasan por el
// middleware de preferencias, así que lo fijan a mano.
beforeAll(() => {
  initI18n();
  setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
});


function metric(current: number, previous: number, changePercent: number | null) {
  return { current, previous, changePercent };
}

const EMPTY: Overview = {
  workouts: metric(0, 0, null),
  effectiveSets: metric(0, 0, null),
  reps: metric(0, 0, null),
  tonnageKg: metric(0, 0, null),
  heaviest: { ...metric(0, 0, null), exerciseName: null },
};

const FULL: Overview = {
  workouts: metric(12, 10, 20),
  effectiveSets: metric(148, 136, 9),
  reps: metric(1184, 1221, -3),
  tonnageKg: metric(58420, 52161, 12),
  heaviest: { ...metric(140, 135, 4), exerciseName: 'Peso muerto' },
};

const datas = (rendered: ReturnType<typeof renderWelcome>): string[] =>
  rendered.keyboard.inline_keyboard.flat().map((b) => ('callback_data' in b ? b.callback_data : ''));

describe('escapeHtml', () => {
  it('escapes the three characters Telegram HTML cares about', () => {
    expect(escapeHtml('Curl <martillo> & polea')).toBe('Curl &lt;martillo&gt; &amp; polea');
  });

  it('escapes ampersands before angle brackets, not after', () => {
    expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;');
  });
});

describe('renderWelcome', () => {
  it('greets by name and shows the five buttons', () => {
    const { text, keyboard } = renderWelcome({ firstName: 'George', overview: FULL, weeklyVolume: [] });
    expect(text).toContain('👋 Hola, George');
    expect(text).toContain('Registra tus series desde aquí');
    expect(datas({ text, keyboard })).toEqual(['wc:s', 'wc:r', 'wc:l', 'wc:h', 'wc:g']);
  });

  it('drops the name when Telegram gives none', () => {
    const { text } = renderWelcome({ firstName: null, overview: FULL, weeklyVolume: [] });
    expect(text).toContain('👋 Hola\n');
    expect(text).not.toContain('Hola,');
  });

  it('renders every figure with its change inside a single <pre> block', () => {
    const { text } = renderWelcome({ firstName: 'George', overview: FULL, weeklyVolume: [] });
    const block = text.slice(text.indexOf('<pre>') + 5, text.indexOf('</pre>'));
    const lines = block.split('\n');

    expect(text.split('<pre>')).toHaveLength(2); // exactamente un bloque
    expect(lines[0]).toContain('Últimos 30 días');
    expect(lines[0]).toContain('vs. 30 anteriores');
    expect(lines[1]).toContain('12');
    expect(lines[1]).toContain('▲ 20 %');
    expect(lines[2]).toContain('148');
    expect(lines[3]).toContain('1,184'); // separador de millares
    expect(lines[3]).toContain('▼  3 %'); // bajada
    expect(lines[4]).toContain('58,420 kg');
    expect(lines[5]).toContain('140 kg');
    expect(lines[6]?.trim()).toBe('Peso muerto');
  });

  it('aligns every metric row to the same width', () => {
    const { text } = renderWelcome({ firstName: 'George', overview: FULL, weeklyVolume: [] });
    const block = text.slice(text.indexOf('<pre>') + 5, text.indexOf('</pre>'));
    const widths = new Set(block.split('\n').slice(0, 6).map((line) => line.length));
    expect(widths.size).toBe(1);
  });

  it('pinta la tabla con la unidad activa y sin descuadrar', () => {
    setCurrent({ locale: 'es', unit: 'lb', step: 2.5 });
    const { text } = renderWelcome({ firstName: 'George', overview: FULL, weeklyVolume: [] });
    expect(text).toContain('lb');
    expect(text).not.toContain('kg');
    const block = text.slice(text.indexOf('<pre>') + 5, text.indexOf('</pre>'));
    const widths = new Set(block.split('\n').slice(0, 6).map((line) => line.length));
    expect(widths.size).toBe(1); // todas las filas de la tabla miden lo mismo
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
  });

  it('menciona /settings en la bienvenida', () => {
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
    expect(renderWelcome({ firstName: 'George', overview: FULL, weeklyVolume: [] }).text).toContain('/settings');
  });

  it('shows every change as a dash for a user with no history and no exercise name', () => {
    const { text } = renderWelcome({ firstName: 'George', overview: EMPTY, weeklyVolume: [] });
    const block = text.slice(text.indexOf('<pre>') + 5, text.indexOf('</pre>'));
    const rows = block.split('\n');
    expect(rows).toHaveLength(6); // cabecera + 5 métricas, sin línea de ejercicio
    for (const row of rows.slice(1)) {
      expect(row).toContain('—');
    }
    expect(text).toContain('Registra tus series desde aquí'); // el texto explica de qué va
  });

  it('shows a dash for a metric whose previous window was zero', () => {
    const overview: Overview = { ...FULL, workouts: metric(3, 0, null) };
    const { text } = renderWelcome({ firstName: 'George', overview, weeklyVolume: [] });
    const row = text.split('\n').find((l) => l.includes('Entrenamientos'));
    expect(row).toContain('—');
    expect(row).not.toContain('▲');
  });

  it('shows no arrow when a metric did not move', () => {
    const overview: Overview = { ...FULL, effectiveSets: metric(148, 148, 0) };
    const { text } = renderWelcome({ firstName: 'George', overview, weeklyVolume: [] });
    const row = text.split('\n').find((l) => l.includes('Series'));
    expect(row).toContain('0 %');
    expect(row).not.toContain('▲');
    expect(row).not.toContain('▼');
  });

  it('does not round a fractional heaviest weight', () => {
    const overview: Overview = { ...FULL, heaviest: { ...metric(62.5, 60, 4), exerciseName: 'Curl' } };
    const { text } = renderWelcome({ firstName: 'George', overview, weeklyVolume: [] });
    expect(text).toContain('62.5 kg');
  });

  it('escapes an own exercise name with HTML characters (§3)', () => {
    const overview: Overview = {
      ...FULL,
      heaviest: { ...metric(140, 135, 4), exerciseName: 'Curl <martillo> & polea' },
    };
    const { text } = renderWelcome({ firstName: 'George', overview, weeklyVolume: [] });
    expect(text).toContain('Curl &lt;martillo&gt; &amp; polea');
    expect(text).not.toContain('<martillo>');
  });

  it('escapes a Telegram first name with HTML characters', () => {
    const { text } = renderWelcome({ firstName: '<b>George</b>', overview: FULL, weeklyVolume: [] });
    expect(text).toContain('&lt;b&gt;George&lt;/b&gt;');
  });
});

describe('bloque de volumen semanal', () => {
  it('pinta un segundo <pre> con una fila por grupo entrenado', () => {
    const { text } = renderWelcome({
      firstName: 'George',
      overview: FULL,
      weeklyVolume: [
        { group: 'chest', count: 14 },
        { group: 'biceps', count: 6 },
      ],
    });
    expect(text.split('<pre>')).toHaveLength(3); // la tabla de métricas y las barras
    expect(text).toContain('Series por músculo');
    expect(text).toContain('Pecho');
    expect(text).toContain('█████│██░░░ 14');
    expect(text).toContain('Bíceps');
  });

  it('no pinta el bloque cuando la semana no tiene series', () => {
    const { text } = renderWelcome({ firstName: 'George', overview: FULL, weeklyVolume: [] });
    expect(text.split('<pre>')).toHaveLength(2); // solo la tabla de métricas
    expect(text).not.toContain('Series por músculo');
  });
});

describe('renderHelp', () => {
  it('covers both ways of recording, warmup, rest and every command', () => {
    const { text, keyboard } = renderHelp();
    for (const needle of [
      '60x8',
      '60 x 8',
      '60x8 rpe8',
      'sentadilla 100x5',
      'Calent.',
      'Descanso',
      '/start',
      '/finish',
      '/routines',
      '/last',
      '/help',
    ]) {
      expect(text).toContain(needle);
    }
    expect(keyboard.inline_keyboard.flat().map((b) => ('callback_data' in b ? b.callback_data : ''))).toEqual(['wc:b']);
  });
});

describe('setBotCommands', () => {
  it('registers the six commands of the spec once per language, in order', async () => {
    const d = openDatabase(':memory:');
    runMigrations(d, MIGRATIONS_DIR);
    createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
    const { bot, outgoing } = makeHarness(d, BOT_INFO, { allowedTelegramIds: [111], timezone: 'UTC' });

    await setBotCommands(bot.api);

    const calls = outgoing.filter((c) => c.method === 'setMyCommands');
    expect(calls).toHaveLength(2);
    // La primera va SIN language_code: es el menú por defecto, en inglés.
    expect(calls[0]?.payload.language_code).toBeUndefined();
    expect(calls[0]?.payload.commands).toEqual([
      { command: 'start', description: 'Home and progress' },
      { command: 'finish', description: 'Finish the workout' },
      { command: 'routines', description: 'My routines' },
      { command: 'last', description: 'History of an exercise' },
      { command: 'help', description: 'How it works' },
      { command: 'settings', description: 'Language and units' },
    ]);
    expect(calls[1]?.payload.language_code).toBe('es');
    expect(calls[1]?.payload.commands).toEqual([
      { command: 'start', description: 'Inicio y resumen' },
      { command: 'finish', description: 'Terminar el entrenamiento' },
      { command: 'routines', description: 'Mis rutinas' },
      { command: 'last', description: 'Historial de un ejercicio' },
      { command: 'help', description: 'Cómo funciona' },
      { command: 'settings', description: 'Idioma y unidades' },
    ]);
  });

  it('botCommands traduce las descripciones e incluye settings', () => {
    expect(botCommands('en').map((c) => c.command)).toContain('settings');
    expect(botCommands('en').find((c) => c.command === 'help')?.description).toBe('How it works');
    expect(botCommands('es').find((c) => c.command === 'help')?.description).toBe('Cómo funciona');
  });
});

describe('botón 📊 Semana', () => {
  it('envía la gráfica como mensaje nuevo y conserva el botón', async () => {
    const d = openDatabase(':memory:');
    runMigrations(d, MIGRATIONS_DIR);
    createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: Date.now() });
    insertSet(d, { workoutId: w.id, exerciseId: 1, position: 1, weightKg: 60, reps: 8, rpe: null, restSeconds: null, isWarmup: false, createdAt: Date.now() });
    const { bot, outgoing } = makeHarness(d, BOT_INFO, { allowedTelegramIds: [111], timezone: 'UTC' });

    await bot.handleUpdate(callbackUpdate(1, 'wc:g', 700));

    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(1);
    // La bienvenida NO se repinta ni se le quita el botón: es una entrada de menú
    // permanente y ‹ Volver la reconstruye entera de todos modos.
    expect(outgoingCalls(outgoing, 'editMessageText')).toHaveLength(0);
    expect(outgoingCalls(outgoing, 'editMessageReplyMarkup')).toHaveLength(0);
  });
});
