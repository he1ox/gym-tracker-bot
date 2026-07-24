import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from './index';

const EXPECTED_TABLES = [
  'exercises',
  'processed_updates',
  'routine_days',
  'routine_exercises',
  'routines',
  'sets',
  'users',
  'workouts',
];

function migratedDb() {
  const db = openDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('runMigrations', () => {
  it('creates all tables from SPEC §4', () => {
    const db = migratedDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(rows.map((row) => row.name)).toEqual(EXPECTED_TABLES);
  });

  it('creates the analytics indexes', () => {
    const db = migratedDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    const names = rows.map((row) => row.name);
    expect(names).toContain('sets_workout_idx');
    expect(names).toContain('sets_exercise_created_idx');
    expect(names).toContain('workouts_user_started_idx');
  });

  it('is idempotent: a second run applies nothing', () => {
    const db = openDatabase(':memory:');
    const first = runMigrations(db, MIGRATIONS_DIR);
    expect(first.length).toBeGreaterThan(0);
    expect(runMigrations(db, MIGRATIONS_DIR)).toEqual([]);
  });

  it('rejects a muscle_group outside the enum via CHECK', () => {
    const db = migratedDb();
    const insert = db.prepare('INSERT INTO exercises (name, muscle_group) VALUES (?, ?)');
    expect(() => insert.run('Press banca', 'legs')).toThrow();
    expect(() => insert.run('Press banca', 'chest')).not.toThrow();
  });

  it('enforces foreign keys', () => {
    const db = migratedDb();
    const insert = db.prepare(
      'INSERT INTO sets (workout_id, exercise_id, position, weight_kg, reps, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    expect(() => insert.run(999, 999, 1, 60, 8, Date.now())).toThrow(/FOREIGN KEY|constraint/i);
  });

  it('applies boolean defaults', () => {
    const db = migratedDb();
    db.prepare('INSERT INTO exercises (name, muscle_group) VALUES (?, ?)').run('Sentadilla', 'quads');
    const row = db.prepare('SELECT is_custom, archived FROM exercises').get() as {
      is_custom: number;
      archived: number;
    };
    expect(row).toEqual({ is_custom: 0, archived: 0 });
  });
});
