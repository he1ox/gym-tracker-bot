import { createUser, getUserByTelegramId } from '@gym-tracker/db';
import type { MiddlewareFn } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import type { CustomContext } from './context';

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
      createUser(db, { telegramUserId: fromId, timezone: config.timezone, createdAt: Date.now() });
    ctx.user = user;
    await next();
  };
}
