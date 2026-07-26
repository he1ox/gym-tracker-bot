import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { createUser, getUserByTelegramId, updateUserPreferences } from './users';

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
    const created = createUser(d, {
      telegramUserId: 42,
      timezone: 'Europe/Madrid',
      locale: 'es',
      createdAt: 1000,
    });
    expect(created).toEqual({
      id: 1,
      telegramUserId: 42,
      timezone: 'Europe/Madrid',
      locale: 'es',
      weightUnit: 'kg',
      weightStep: 2.5,
      createdAt: 1000,
    });
    expect(getUserByTelegramId(d, 42)).toEqual(created);
  });

  it('crea el usuario con los valores por defecto de preferencias', () => {
    const d = db();
    const user = createUser(d, {
      telegramUserId: 555,
      timezone: 'Europe/Madrid',
      locale: 'en',
      createdAt: 1000,
    });
    expect(user.locale).toBe('en');
    expect(user.weightUnit).toBe('kg');
    expect(user.weightStep).toBe(2.5);
  });

  it('actualiza solo las preferencias del patch', () => {
    const d = db();
    const user = createUser(d, {
      telegramUserId: 556,
      timezone: 'Europe/Madrid',
      locale: 'es',
      createdAt: 1000,
    });
    updateUserPreferences(d, user.id, { weightUnit: 'lb' });
    const reloaded = getUserByTelegramId(d, 556);
    expect(reloaded?.weightUnit).toBe('lb');
    expect(reloaded?.locale).toBe('es'); // no lo tocaba el patch
    expect(reloaded?.weightStep).toBe(2.5);
  });

  it('rechaza un idioma fuera del enum', () => {
    const d = db();
    const user = createUser(d, {
      telegramUserId: 557,
      timezone: 'Europe/Madrid',
      locale: 'es',
      createdAt: 1000,
    });
    expect(() => d.prepare('UPDATE users SET locale = ? WHERE id = ?').run('fr', user.id)).toThrow();
  });
});
