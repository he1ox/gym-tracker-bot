import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'drizzle');

interface JournalEntry {
  idx: number;
  tag: string;
}

export function runMigrations(db: DatabaseSync, migrationsDir: string): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  const appliedRows = db.prepare('SELECT tag FROM schema_migrations').all() as Array<{ tag: string }>;
  const applied = new Set(appliedRows.map((row) => row.tag));
  const insertApplied = db.prepare('INSERT INTO schema_migrations (tag, applied_at) VALUES (?, ?)');

  const newlyApplied: string[] = [];
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    if (applied.has(entry.tag)) {
      continue;
    }
    // Los "--> statement-breakpoint" de drizzle-kit son comentarios SQL (--),
    // así que el archivo completo se puede ejecutar tal cual.
    const migrationSql = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(migrationSql);
      insertApplied.run(entry.tag, Date.now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    newlyApplied.push(entry.tag);
  }
  return newlyApplied;
}
