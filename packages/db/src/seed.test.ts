import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '@gym-tracker/core';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from './index';

function migratedDb() {
  const db = openDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('catalog seed', () => {
  it('seeds ~50 base-catalog exercises', () => {
    const db = migratedDb();
    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM exercises WHERE user_id IS NULL')
      .get() as { n: number };
    expect(n).toBeGreaterThanOrEqual(50);
  });

  it('every seeded exercise is a non-custom, non-archived catalog entry', () => {
    const db = migratedDb();
    const rows = db
      .prepare('SELECT is_custom, archived, user_id FROM exercises')
      .all() as Array<{ is_custom: number; archived: number; user_id: number | null }>;
    for (const row of rows) {
      expect(row.user_id).toBeNull();
      expect(row.is_custom).toBe(0);
      expect(row.archived).toBe(0);
    }
  });

  it('every seeded muscle_group is a valid enum member', () => {
    const db = migratedDb();
    const rows = db
      .prepare('SELECT DISTINCT muscle_group FROM exercises')
      .all() as Array<{ muscle_group: string }>;
    const valid = new Set<string>(MUSCLE_GROUPS);
    for (const row of rows) {
      expect(valid.has(row.muscle_group)).toBe(true);
    }
  });

  it('covers all 17 muscle groups', () => {
    const db = migratedDb();
    const rows = db
      .prepare('SELECT DISTINCT muscle_group FROM exercises')
      .all() as Array<{ muscle_group: string }>;
    expect(new Set(rows.map((r) => r.muscle_group)).size).toBe(17);
  });

  it('has no duplicate exercise names in the catalog', () => {
    const db = migratedDb();
    const { total, distinct } = db
      .prepare(
        'SELECT COUNT(*) AS total, COUNT(DISTINCT name) AS `distinct` FROM exercises WHERE user_id IS NULL',
      )
      .get() as { total: number; distinct: number };
    expect(distinct).toBe(total);
  });
});
