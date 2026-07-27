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
import { isoWeekRange } from '../services/weekly-volume';
import {
  BOT_INFO,
  callbackUpdate,
  commandUpdate,
  deliverUpdate,
  makeHarness,
  outgoingCalls,
  outgoingTexts,
  textUpdate,
} from './test-harness';

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

// Mismo formato que `shortDate` en weekly-chart.ts: día/mes en 2 dígitos.
const shortDate = (epochMs: number) =>
  new Intl.DateTimeFormat('es', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(new Date(epochMs));

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
    const caption = String(photos[0]?.payload.caption ?? '');
    expect(caption).toContain('Semana');
    // El rango completo, EN ORDEN: comprobar los dos fragmentos por separado no
    // detectaría una transposición entre `shortDate(fromMs, ...)` y
    // `shortDate(toMs, ...)` (los dos seguirían "presentes" aunque invertidos).
    const { fromMs, toMs } = isoWeekRange(Date.now(), 'UTC');
    expect(caption).toContain(`${shortDate(fromMs)} – ${shortDate(toMs)}`);
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

  it('traga el fallo de sendPhoto: el resumen llega y no aparece el error genérico', async () => {
    const d = db();
    // El harness simula que la propia llamada a Telegram falla (red, chat
    // bloqueado…), aunque el render haya funcionado. Sin guardia, esto se cuela
    // en el bot.catch global y responde "Algo salió mal" tras un cierre ya exitoso.
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG, 'sendPhoto');
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await bot.handleUpdate(textUpdate(4, '60x8'));
    outgoing.length = 0;

    await deliverUpdate(bot, commandUpdate(5, 'finish'));

    expect(outgoingTexts(outgoing, 'editMessageText').join('\n')).toContain('Entrenamiento terminado');
    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).not.toContain('Algo salió mal');
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
