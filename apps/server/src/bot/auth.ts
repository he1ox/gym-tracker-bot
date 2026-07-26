import { type Locale, createUser, getUserByTelegramId } from '@gym-tracker/db';
import type { MiddlewareFn } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import type { CustomContext } from './context';

/**
 * Idioma inicial a partir del `language_code` de Telegram. Solo el español tiene
 * catálogo propio además del inglés, y el INGLÉS es la reserva (decisión del
 * autor): quien llega con 'pt', 'fr' o sin código ve el bot en inglés.
 * El prefijo cubre 'es-MX', 'es-419' y compañía.
 */
export function detectLocale(languageCode: string | undefined): Locale {
  return languageCode !== undefined && languageCode.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function auth(
  db: DatabaseSync,
  config: { allowedTelegramIds: number[]; timezone: string },
): MiddlewareFn<CustomContext> {
  const allowed = new Set(config.allowedTelegramIds);
  return async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (fromId === undefined || !allowed.has(fromId)) {
      console.log(`[auth] ignored update from unauthorized id=${fromId ?? 'unknown'}`);
      return;
    }
    const user =
      getUserByTelegramId(db, fromId) ??
      createUser(db, {
        telegramUserId: fromId,
        timezone: config.timezone,
        locale: detectLocale(ctx.from?.language_code),
        createdAt: Date.now(),
      });
    ctx.user = user;
    await next();
  };
}
