import { MIGRATIONS_DIR, createUser, openDatabase, runMigrations } from '@gym-tracker/db';
import { BotError, type Bot } from 'grammy';
import { describe, expect, it } from 'vitest';
import type { CustomContext } from './context';
import { BOT_INFO, commandUpdate, makeHarness } from './test-harness';

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };

function baseDb() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  return d;
}

// grammY 1.45.1: `Bot.handleUpdate` (singular) SIEMPRE relanza un `BotError` si el
// middleware falla — nunca invoca `bot.errorHandler` (el handler de `bot.catch`).
// Solo el bucle interno de long polling (`handleUpdates`, plural — privado, el que
// usa `bot.start()`) atrapa ese `BotError` y se lo pasa a `bot.errorHandler`. Para
// probar en un test rápido y determinista que nuestro `bot.catch` realmente evita
// que un fallo tumbe el polling en producción, reproducimos aquí ese mismo
// contrato usando solo API pública de grammY (`bot.handleUpdate`, `BotError`,
// `bot.errorHandler` — las tres son públicas en bot.d.ts).
async function deliverUpdate(bot: Bot<CustomContext>, update: Parameters<Bot<CustomContext>['handleUpdate']>[0]): Promise<void> {
  try {
    await bot.handleUpdate(update);
  } catch (err) {
    if (err instanceof BotError) {
      await bot.errorHandler(err);
      return;
    }
    throw err;
  }
}

describe('global error handler (bot.catch)', () => {
  it('contains a throwing outgoing API call instead of crashing the poll loop', async () => {
    const d = baseDb();
    // El transformer del harness lanza en cualquier llamada a sendMessage; /start
    // sin sesión responde el selector de día con ctx.reply → sendMessage.
    const { bot } = makeHarness(d, BOT_INFO, CONFIG, 'sendMessage');

    await expect(deliverUpdate(bot, commandUpdate(1, 'start'))).resolves.toBeUndefined();
  });
});
