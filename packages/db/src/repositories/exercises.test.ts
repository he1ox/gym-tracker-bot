import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '../index';
import { MUSCLE_GROUPS } from '@gym-tracker/core';
import { createUser } from './users';
import {
  createCustomExercise,
  getExerciseById,
  listCatalogAndOwn,
  listExercisesByMuscleGroup,
} from './exercises';

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

describe('listExercisesByMuscleGroup', () => {
  it('groups the catalog by muscle group and omits empty groups', () => {
    const d = seededDb();
    const byGroup = listExercisesByMuscleGroup(d, 1);

    expect(byGroup.size).toBeGreaterThan(0);
    for (const [group, options] of byGroup) {
      expect(options.length).toBeGreaterThan(0); // ningún grupo vacío en el mapa
      expect(MUSCLE_GROUPS).toContain(group);
      expect(options.every((o) => typeof o.id === 'number' && typeof o.name === 'string')).toBe(true);
    }
    // Todos los ejercicios visibles están repartidos, sin perder ninguno.
    const total = [...byGroup.values()].reduce((n, options) => n + options.length, 0);
    expect(total).toBe(listCatalogAndOwn(d, 1).length);
  });

  it('keys follow the anatomical order of MUSCLE_GROUPS', () => {
    const d = seededDb();
    const keys = [...listExercisesByMuscleGroup(d, 1).keys()];
    const indices = keys.map((g) => MUSCLE_GROUPS.indexOf(g));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('sorts exercises by name inside each group', () => {
    const d = seededDb();
    for (const options of listExercisesByMuscleGroup(d, 1).values()) {
      const names = options.map((o) => o.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
    }
  });

  it('includes own exercises, excludes archived ones and other users', () => {
    const d = seededDb();
    createUser(d, { telegramUserId: 2, timezone: 'UTC', createdAt: 0 });
    const mine = createCustomExercise(d, { userId: 1, name: 'Mi curl', muscleGroup: 'biceps' });
    const archived = createCustomExercise(d, { userId: 1, name: 'Curl viejo', muscleGroup: 'biceps' });
    createCustomExercise(d, { userId: 2, name: 'Curl ajeno', muscleGroup: 'biceps' });
    d.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(archived.id);

    const names = [...listExercisesByMuscleGroup(d, 1).values()].flat().map((o) => o.name);
    expect(names).toContain('Mi curl');
    expect(names).not.toContain('Curl viejo'); // archivado
    expect(names).not.toContain('Curl ajeno'); // de otro usuario
    expect([...listExercisesByMuscleGroup(d, 1).get('biceps')!].some((o) => o.id === mine.id)).toBe(true);
  });

  it('omits a group with no available exercises', () => {
    const d = seededDb();
    // Archiva todo lo de un grupo concreto y comprueba que desaparece del mapa.
    d.prepare("UPDATE exercises SET archived = 1 WHERE muscle_group = 'calves'").run();
    expect(listExercisesByMuscleGroup(d, 1).has('calves')).toBe(false);
  });
});
