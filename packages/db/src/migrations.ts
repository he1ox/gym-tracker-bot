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
    // Las FK se desactivan AQUÍ, fuera del BEGIN: `PRAGMA foreign_keys` es un
    // no-op dentro de una transacción, así que el que trae la propia migración
    // (drizzle lo emite al recrear una tabla) no serviría de nada. Sin esto, el
    // DROP+RENAME de la 0002 falla en cuanto la BD tiene un usuario con
    // workouts o rutinas colgando.
    const foreignKeysWereOn = wereForeignKeysOn(db);
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(migrationSql);
      // Desactivar las FK no puede significar renunciar a ellas: si la migración
      // dejó una referencia colgando, se deshace entera.
      const violations = db.prepare('PRAGMA foreign_key_check').all();
      if (violations.length > 0) {
        throw new Error(
          `migration ${entry.tag} left ${violations.length} dangling foreign key reference(s)`,
        );
      }
      insertApplied.run(entry.tag, Date.now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      if (foreignKeysWereOn) {
        db.exec('PRAGMA foreign_keys = ON');
      }
    }
    newlyApplied.push(entry.tag);
  }
  return newlyApplied;
}

function wereForeignKeysOn(db: DatabaseSync): boolean {
  const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number } | undefined;
  return row?.foreign_keys === 1;
}
