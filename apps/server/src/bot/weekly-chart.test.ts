import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  insertSet,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrent } from '../i18n/current';
import { initI18n } from '../i18n/index';
import { BOT_INFO, callbackUpdate, commandUpdate, makeHarness, outgoingCalls, outgoingTexts, textUpdate } from './test-harness';

// El renderizador real abre un canvas y tarda; aquí solo importa QUÉ se envía.
// El PNG de verdad lo cubre charts/render.test.ts.
const renderChart = vi.hoisted(() => vi.fn());
vi.mock('../charts/render', () => ({ renderChart }));

beforeAll(() => {
  initI18n();
  setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
});

beforeEach(() => {
  renderChart.mockReset();
  renderChart.mockResolvedValue(Buffer.from('fake-png'));
});

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };
const MSG = 900;

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  return d;
}

describe('/finish', () => {
  it('envía el resumen y, después, la gráfica de la semana', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await bot.handleUpdate(textUpdate(4, '60x8'));
    outgoing.length = 0;

    await bot.handleUpdate(commandUpdate(5, 'finish'));

    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('Entrenamiento terminado');
    const photos = outgoingCalls(outgoing, 'sendPhoto');
    expect(photos).toHaveLength(1);
    expect(String(photos[0]?.payload.caption ?? '')).toContain('Semana');
    // La foto va DESPUÉS del resumen: el chat queda con el texto y su gráfica.
    const methods = outgoing.map((c) => c.method);
    expect(methods.indexOf('sendPhoto')).toBeGreaterThan(methods.indexOf('editMessageText'));
  });

  it('manda el resumen igualmente cuando el render falla', async () => {
    renderChart.mockResolvedValue(null);
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await bot.handleUpdate(textUpdate(4, '60x8'));
    outgoing.length = 0;

    await bot.handleUpdate(commandUpdate(5, 'finish'));

    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('Entrenamiento terminado');
    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(0);
  });

  it('no envía foto al cerrar un entrenamiento sin series', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(commandUpdate(3, 'finish'));

    expect(outgoingCalls(outgoing, 'sendPhoto')).toHaveLength(0);
    expect(renderChart).not.toHaveBeenCalled(); // ni siquiera se intenta
  });
});
