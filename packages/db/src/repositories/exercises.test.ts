import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { createUser } from './users';
import { createCustomExercise, getExerciseById, listCatalogAndOwn } from './exercises';

function seededDb() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 1, timezone: 'UTC', createdAt: 0 });
  return d;
}

describe('exercises repository', () => {
  it('fetches a seeded catalog exercise by id', () => {
    const d = seededDb();
    const found = getExerciseById(d, 1);
    expect(found?.userId).toBeNull();
    expect(found?.isCustom).toBe(false);
    expect(typeof found?.name).toBe('string');
  });

  it('creates a custom exercise owned by the user', () => {
    const d = seededDb();
    const created = createCustomExercise(d, { userId: 1, name: 'Curl araña', muscleGroup: 'biceps' });
    expect(created.userId).toBe(1);
    expect(created.isCustom).toBe(true);
    expect(created.archived).toBe(false);
    expect(getExerciseById(d, created.id)).toEqual(created);
  });

  it('lists catalog + own exercises, excluding other users and archived', () => {
    const d = seededDb();
    createUser(d, { telegramUserId: 2, timezone: 'UTC', createdAt: 0 });
    const mine = createCustomExercise(d, { userId: 1, name: 'Mi ejercicio', muscleGroup: 'abs' });
    createCustomExercise(d, { userId: 2, name: 'Ajeno', muscleGroup: 'abs' });
    d.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(mine.id);

    const list = listCatalogAndOwn(d, 1);
    const names = list.map((e) => e.name);
    expect(names).not.toContain('Ajeno'); // de otro usuario
    expect(names).not.toContain('Mi ejercicio'); // archivado
    expect(list.every((e) => e.userId === null || e.userId === 1)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(50); // el catálogo base
  });
});
