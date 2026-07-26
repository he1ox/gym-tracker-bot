import { getSession, updateSession } from '@gym-tracker/db';
import { Bot, type BotConfig } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { auth } from './auth';
import { renderActive, registerCapture } from './capture';
import type { CustomContext } from './context';
import { dedup } from './dedup';
import { registerLast } from './last';
import { preferences } from './preferences';
import { createRestTimers } from './rest-timer';
import { registerRoutines } from './routines-wizard';
import { T } from './texts';
import { registerWelcome } from './welcome';

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
  // Detrás de auth: lee ctx.user. Delante de todo lo demás: cualquier handler que
  // pinte texto necesita el idioma ya fijado.
  bot.use(preferences());

  // --- Todo lo que tenga callbacks propios va ANTES de registerCapture ---
  registerRoutines(bot, db, config);
  registerLast(bot, db, config);
  // ANTES que registerCapture, que engancha un bot.on('callback_query:data')
  // genérico (capture.ts): cualquier handler de wc:* registrado después nunca se
  // ejecutaría. Es la misma trampa que obligó a meter el segmento de origen en el
  // espacio pick: (ver el comentario de callback-data.ts).
  registerWelcome(bot, db, config);

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

  // Handler global de errores: grammY, por defecto, loguea, detiene el polling
  // (bot.stop()) y relanza el error de cualquier handler no capturado. El
  // contrato de errores del diseño exige seguir escuchando: logueamos y
  // respondemos un mensaje genérico "best-effort", sin nunca relanzar.
  bot.catch(async (err) => {
    console.error(`Unhandled error while handling update ${err.ctx.update.update_id}:`, err.error);
    try {
      if (err.ctx.callbackQuery) {
        await err.ctx.answerCallbackQuery(T.genericError);
      } else {
        await err.ctx.reply(T.genericError);
      }
    } catch {
      // Best-effort: si incluso responder falla, no hay nada más que hacer.
    }
  });

  return bot;
}
