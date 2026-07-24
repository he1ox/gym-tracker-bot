import type { DatabaseSync } from 'node:sqlite';

export function markUpdateProcessed(
  db: DatabaseSync,
  params: { updateId: number; processedAt: number },
): boolean {
  const info = db
    .prepare('INSERT OR IGNORE INTO processed_updates (update_id, processed_at) VALUES (?, ?)')
    .run(params.updateId, params.processedAt);
  return info.changes === 1;
}
