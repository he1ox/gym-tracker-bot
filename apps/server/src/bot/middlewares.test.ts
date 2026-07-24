import { describe, expect, it, vi } from 'vitest';
import { MIGRATIONS_DIR, getUserByTelegramId, openDatabase, runMigrations } from '@gym-tracker/db';
import { auth } from './auth';
import { dedup } from './dedup';
import type { CustomContext } from './context';

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  return d;
}

// ctx mínimo: solo lo que leen los middlewares.
function ctx(partial: { updateId?: number; fromId?: number }): CustomContext {
  return {
    update: { update_id: partial.updateId ?? 1 },
    from: partial.fromId === undefined ? undefined : { id: partial.fromId },
  } as unknown as CustomContext;
}

describe('dedup middleware', () => {
  it('runs next once and skips duplicates of the same update_id', async () => {
    const d = db();
    const mw = dedup(d);
    const calls: number[] = [];
    const c = ctx({ updateId: 5 });
    await mw(c, async () => void calls.push(1));
    await mw(c, async () => void calls.push(1));
    expect(calls).toHaveLength(1);
  });
});

describe('auth middleware', () => {
  const config = { allowedTelegramIds: [111], timezone: 'Europe/Madrid' };

  it('ignores updates from ids outside the allow-list', async () => {
    const d = db();
    const mw = auth(d, config);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let nexted = false;
    await mw(ctx({ fromId: 999 }), async () => void (nexted = true));
    expect(nexted).toBe(false);
    expect(getUserByTelegramId(d, 999)).toBeUndefined();
    logSpy.mockRestore();
  });

  it('creates the user on first contact and sets ctx.user for allowed ids', async () => {
    const d = db();
    const mw = auth(d, config);
    const c = ctx({ fromId: 111 });
    let nexted = false;
    await mw(c, async () => void (nexted = true));
    expect(nexted).toBe(true);
    expect(c.user.telegramUserId).toBe(111);
    expect(c.user.timezone).toBe('Europe/Madrid');
    expect(getUserByTelegramId(d, 111)?.id).toBe(c.user.id);
  });
});
