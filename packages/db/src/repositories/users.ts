import type { DatabaseSync } from 'node:sqlite';

export interface UserRow {
  id: number;
  telegramUserId: number;
  timezone: string;
  createdAt: number;
}

interface UserRowDb {
  id: number;
  telegram_user_id: number;
  timezone: string;
  created_at: number;
}

const mapUser = (r: UserRowDb): UserRow => ({
  id: r.id,
  telegramUserId: r.telegram_user_id,
  timezone: r.timezone,
  createdAt: r.created_at,
});

export function getUserByTelegramId(db: DatabaseSync, telegramUserId: number): UserRow | undefined {
  const row = db
    .prepare('SELECT id, telegram_user_id, timezone, created_at FROM users WHERE telegram_user_id = ?')
    .get(telegramUserId) as UserRowDb | undefined;
  return row ? mapUser(row) : undefined;
}

export function createUser(
  db: DatabaseSync,
  params: { telegramUserId: number; timezone: string; createdAt: number },
): UserRow {
  const info = db
    .prepare('INSERT INTO users (telegram_user_id, timezone, created_at) VALUES (?, ?, ?)')
    .run(params.telegramUserId, params.timezone, params.createdAt);
  return {
    id: Number(info.lastInsertRowid),
    telegramUserId: params.telegramUserId,
    timezone: params.timezone,
    createdAt: params.createdAt,
  };
}
