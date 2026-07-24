import { getSession, updateSession } from '@gym-tracker/db';
import { Bot, type BotConfig } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { auth } from './auth';
import { renderActive, registerCapture } from './capture';
import type { CustomContext } from './context';
import { dedup } from './dedup';
import { registerLast } from './last';
import { createRestTimers } from './rest-timer';
import { registerRoutines } from './routines-wizard';

export interface BotDeps {
  allowedTelegramIds: number[];
  timezone: string;
}

export function createBot(
  token: string,
  db: DatabaseSync,
  config: BotDeps,
  botInfo?: BotConfig<CustomContext>['botInfo'],
): Bot<CustomContext> {
  const bot = new Bot<CustomContext>(token, botInfo ? { botInfo } : undefined);

  bot.use(dedup(db));
  bot.use(auth(db, config));

  // --- Fase 1: /routines antes de la captura; /last se añade en la Task 16 ---
  registerRoutines(bot, db, config);
  registerLast(bot, db, config);

  const restTimers = createRestTimers({
    send: async (chatId, text) => (await bot.api.sendMessage(chatId, text)).message_id,
    storeEphemeral: (userId, messageId) => updateSession(db, userId, { ephemeralMessageId: messageId }, Date.now()),
    rerender: async (userId) => {
      const session = getSession(db, userId);
      if (session) {
        await renderActive(bot.api, db, session, restTimers);
      }
    },
  });

  registerCapture(bot, db, config, restTimers);
  return bot;
}
