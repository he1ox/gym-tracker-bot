import { MIGRATIONS_DIR, createUser, openDatabase, runMigrations } from '@gym-tracker/db';
import { describe, expect, it } from 'vitest';
import { BOT_INFO, commandUpdate, deliverUpdate, makeHarness } from './test-harness';

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };

function baseDb() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  return d;
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
