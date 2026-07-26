import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from './index';

/**
 * Copia las primeras `count` migraciones a un directorio temporal, con su journal
 * recortado. Sirve para simular una BD que se quedó en una versión anterior: sin
 * esto, todos los tests migran desde cero y nunca ejercitan una actualización
 * sobre datos ya existentes.
 */
function partialMigrationsDir(count: number): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ idx: number; tag: string }> };
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx).slice(0, count);
  const dir = mkdtempSync(join(tmpdir(), 'gym-migrations-'));
  mkdirSync(join(dir, 'meta'));
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) {
    copyFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

const EXPECTED_TABLES = [
  'bot_sessions',
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

  it('creates the bot_sessions table with the session-state columns', () => {
    const db = migratedDb();
    const cols = db
      .prepare("SELECT name FROM pragma_table_info('bot_sessions') ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toEqual([
      'chat_id',
      'current_exercise_id',
      'ephemeral_message_id',
      'message_id',
      'next_set_is_warmup',
      'pending_reps',
      'pending_weight_kg',
      'updated_at',
      'user_id',
      'workout_id',
    ]);
  });

  it('makes user_id the primary key of bot_sessions', () => {
    const db = migratedDb();
    const pk = db
      .prepare("SELECT name FROM pragma_table_info('bot_sessions') WHERE pk = 1")
      .get() as { name: string } | undefined;
    expect(pk?.name).toBe('user_id');
  });

  it('0002 asigna name_key a las 51 filas del catálogo y a ninguna propia', () => {
    const db = migratedDb();
    const withKey = db
      .prepare('SELECT COUNT(*) AS n FROM exercises WHERE user_id IS NULL AND name_key IS NOT NULL')
      .get() as { n: number };
    const withoutKey = db
      .prepare('SELECT COUNT(*) AS n FROM exercises WHERE user_id IS NULL AND name_key IS NULL')
      .get() as { n: number };
    expect(withKey.n).toBe(51);
    expect(withoutKey.n).toBe(0);
    db.close();
  });

  it('0002 actualiza una BD que YA tiene un usuario con datos colgando de él', () => {
    // El caso real: la 0002 recrea la tabla users (DROP + RENAME) y las FK están
    // activas, así que las filas hijas la bloquean. Migrar desde cero no lo
    // detecta porque no hay ninguna fila hija todavía.
    const db = openDatabase(':memory:');
    runMigrations(db, partialMigrationsDir(2));
    db.prepare("INSERT INTO users (telegram_user_id, timezone, created_at) VALUES (777, 'Europe/Madrid', 42)").run();
    db.prepare('INSERT INTO workouts (user_id, started_at) VALUES (1, 100)').run();

    expect(runMigrations(db, MIGRATIONS_DIR)).toHaveLength(1);

    expect(db.prepare('SELECT locale, weight_unit, weight_step FROM users WHERE telegram_user_id = 777').get()).toEqual(
      { locale: 'en', weight_unit: 'kg', weight_step: 2.5 },
    );
    // El workout sigue apuntando a un usuario que existe: la recreación de la
    // tabla no puede dejar referencias colgando.
    expect(db.prepare('SELECT user_id FROM workouts').get()).toEqual({ user_id: 1 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.close();
  });

  it('vuelve a dejar las foreign keys activas después de migrar', () => {
    const db = migratedDb();
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    db.close();
  });

  it('0002 deja los defaults de preferencias en la tabla users recreada', () => {
    const db = migratedDb();
    db.prepare('INSERT INTO users (telegram_user_id, timezone, created_at) VALUES (1, ?, 0)').run('UTC');
    const row = db
      .prepare('SELECT locale, weight_unit, weight_step FROM users WHERE telegram_user_id = 1')
      .get();
    expect(row).toEqual({ locale: 'en', weight_unit: 'kg', weight_step: 2.5 });
    db.close();
  });

  it('enforces the bot_sessions foreign keys', () => {
    const db = migratedDb();
    const insert = db.prepare(
      'INSERT INTO bot_sessions (user_id, workout_id, chat_id, next_set_is_warmup, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    // user_id 1 / workout_id 1 no existen todavía → viola FK.
    expect(() => insert.run(1, 1, 555, 0, Date.now())).toThrow(/FOREIGN KEY|constraint/i);
  });
});
