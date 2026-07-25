import type { Bot } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { createBot } from './bot';
import type { CustomContext } from './context';

// Un botInfo mínimo evita el getMe de red al llamar handleUpdate.
// `any` deliberado: el tipo `UserFromGetMe` de grammY cambia entre versiones y es
// demasiado estricto para este botInfo mínimo de test (no hay ESLint en el repo).
export const BOT_INFO: any = {
  id: 1,
  is_bot: true,
  first_name: 'Test',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
};

export interface OutgoingCall {
  method: string;
  payload: Record<string, unknown>;
}

export function makeHarness(
  db: DatabaseSync,
  botInfo: unknown,
  config: { allowedTelegramIds: number[]; timezone: string },
  failOn?: string,
): { bot: Bot<CustomContext>; outgoing: OutgoingCall[] } {
  const bot = createBot('TEST:TOKEN', db, config, botInfo as never);
  const outgoing: OutgoingCall[] = [];
  let seq = 1000;

  // Transformer: intercepta todas las llamadas salientes, no toca la red y devuelve
  // respuestas mínimas para que los handlers avancen. `Bot.handleUpdate` copia los
  // transformers instalados aquí sobre el `ctx.api` de cada update ("configure it
  // with the same transformers as bot.api", ver grammy/out/bot.js), y `registerRoutines`
  // (routines-wizard.ts) hace lo mismo para el `ctx.api` que el motor de replay de
  // @grammyjs/conversations reconstruye dentro del wizard, así que un único
  // transformer instalado aquí basta para interceptar también esas llamadas.
  // `any` deliberado: el tipo `Transformer` de grammY es demasiado estricto para
  // simular respuestas mínimas (no hay ESLint en el repo).
  bot.api.config.use(((_prev: unknown, method: string, payload: Record<string, unknown>) => {
    outgoing.push({ method, payload });
    if (failOn !== undefined && method === failOn) {
      // Simula un fallo de la API de Telegram en esta llamada concreta, para
      // probar que bot.catch contiene el error sin detener el polling.
      throw new Error(`simulated failure for ${method}`);
    }
    let result: unknown = true;
    if (method === 'sendMessage') {
      seq += 1;
      result = { message_id: seq, date: 0, chat: { id: payload.chat_id, type: 'private' } };
    }
    return Promise.resolve({ ok: true, result });
  }) as any);

  return { bot, outgoing };
}

type AnyUpdate = Parameters<Bot<CustomContext>['handleUpdate']>[0];

function privateChat(fromId: number) {
  return { id: fromId, type: 'private' as const };
}

export function textUpdate(updateId: number, text: string, fromId = 111): AnyUpdate {
  const isCommand = text.startsWith('/');
  return {
    update_id: updateId,
    message: {
      message_id: updateId * 10,
      date: 0,
      chat: privateChat(fromId),
      from: { id: fromId, is_bot: false, first_name: 'U' },
      text,
      ...(isCommand ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]?.length ?? text.length }] } : {}),
    },
  } as unknown as AnyUpdate;
}

export function commandUpdate(updateId: number, command: string, fromId = 111): AnyUpdate {
  return textUpdate(updateId, `/${command}`, fromId);
}

// Textos enviados/editados por el bot para un método dado (sendMessage, editMessageText…).
export function outgoingTexts(outgoing: readonly OutgoingCall[], method: string): string[] {
  return outgoing.filter((c) => c.method === method).map((c) => String(c.payload.text ?? ''));
}

// callback_data de los botones de la última llamada al método indicado.
export function lastKeyboardDatas(outgoing: readonly OutgoingCall[], method: string): string[] {
  const call = outgoing.filter((c) => c.method === method).at(-1);
  const markup = call?.payload.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> } | undefined;
  return (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? '');
}

export function callbackUpdate(updateId: number, data: string, messageId: number, fromId = 111): AnyUpdate {
  return {
    update_id: updateId,
    callback_query: {
      id: String(updateId),
      from: { id: fromId, is_bot: false, first_name: 'U' },
      chat_instance: 'ci',
      data,
      message: {
        message_id: messageId,
        date: 0,
        chat: privateChat(fromId),
        from: { id: 1, is_bot: true, first_name: 'Test' },
        text: 'x',
      },
    },
  } as unknown as AnyUpdate;
}
