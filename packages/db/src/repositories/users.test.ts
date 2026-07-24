import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { createUser, getUserByTelegramId } from './users';

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  return d;
}

describe('users repository', () => {
  it('returns undefined for an unknown telegram id', () => {
    expect(getUserByTelegramId(db(), 42)).toBeUndefined();
  });

  it('creates and fetches a user', () => {
    const d = db();
    const created = createUser(d, { telegramUserId: 42, timezone: 'Europe/Madrid', createdAt: 1000 });
    expect(created).toEqual({ id: 1, telegramUserId: 42, timezone: 'Europe/Madrid', createdAt: 1000 });
    expect(getUserByTelegramId(d, 42)).toEqual(created);
  });
});
