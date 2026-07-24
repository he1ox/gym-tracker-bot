import { markUpdateProcessed } from '@gym-tracker/db';
import type { MiddlewareFn } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import type { CustomContext } from './context';

export function dedup(db: DatabaseSync): MiddlewareFn<CustomContext> {
  return async (ctx, next) => {
    const isNew = markUpdateProcessed(db, { updateId: ctx.update.update_id, processedAt: Date.now() });
    if (!isNew) {
      return; // Telegram reintentó un update ya procesado: descartar sin efectos.
    }
    await next();
  };
}
