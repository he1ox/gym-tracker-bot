import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { markUpdateProcessed } from './processed-updates';

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  return d;
}

describe('processed-updates repository', () => {
  it('returns true the first time and false on a duplicate update_id', () => {
    const d = db();
    expect(markUpdateProcessed(d, { updateId: 777, processedAt: 1 })).toBe(true);
    expect(markUpdateProcessed(d, { updateId: 777, processedAt: 2 })).toBe(false);
    expect(markUpdateProcessed(d, { updateId: 778, processedAt: 3 })).toBe(true);
  });
});
