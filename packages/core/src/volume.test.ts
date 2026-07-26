import { describe, expect, it } from 'vitest';
import type { MuscleGroup } from './types';
import { VOLUME_TARGET_MAX, VOLUME_TARGET_MIN, isVolumeInBand, weeklyVolumeByMuscleGroup } from './volume';

const groups: ReadonlyMap<number, MuscleGroup> = new Map([
  [1, 'chest'],
  [2, 'quads'],
  [3, 'chest'],
]);

const set = (exerciseId: number, iso: string, isWarmup = false) => ({
  exerciseId,
  isWarmup,
  createdAt: new Date(iso),
});

describe('weeklyVolumeByMuscleGroup', () => {
  it('counts effective sets of the given ISO week grouped by muscle', () => {
    const sets = [
      set(1, '2026-01-12T10:00:00Z'),
      set(1, '2026-01-12T10:05:00Z'),
      set(3, '2026-01-14T10:00:00Z'),
      set(2, '2026-01-13T10:00:00Z'),
      set(2, '2026-01-13T10:05:00Z'),
      set(2, '2026-01-13T09:55:00Z', true), // warmup: excluded
      set(1, '2026-01-19T10:00:00Z'), // W04: excluded
    ];
    const result = weeklyVolumeByMuscleGroup(sets, groups, { weekKey: '2026-W03', timeZone: 'UTC' });
    expect(result).toEqual(new Map([['chest', 3], ['quads', 2]]));
  });

  it('omits muscle groups with zero sets', () => {
    const result = weeklyVolumeByMuscleGroup(
      [set(1, '2026-01-12T10:00:00Z')],
      groups,
      { weekKey: '2026-W03', timeZone: 'UTC' },
    );
    expect(result.has('quads')).toBe(false);
  });

  it('returns an empty map for no sets', () => {
    const result = weeklyVolumeByMuscleGroup([], groups, { weekKey: '2026-W03', timeZone: 'UTC' });
    expect(result.size).toBe(0);
  });

  it('throws when a set references an exercise missing from the map', () => {
    expect(() =>
      weeklyVolumeByMuscleGroup([set(99, '2026-01-12T10:00:00Z')], groups, {
        weekKey: '2026-W03',
        timeZone: 'UTC',
      }),
    ).toThrow(/99/);
  });
});

describe('banda de volumen (SPEC §8.1)', () => {
  it('describe la banda 10-20', () => {
    expect(VOLUME_TARGET_MIN).toBe(10);
    expect(VOLUME_TARGET_MAX).toBe(20);
  });

  it('deja fuera una cuenta por debajo de la banda', () => {
    expect(isVolumeInBand(9)).toBe(false);
  });

  it('incluye el límite inferior', () => {
    expect(isVolumeInBand(10)).toBe(true);
  });

  it('incluye el límite superior', () => {
    expect(isVolumeInBand(20)).toBe(true);
  });

  it('deja fuera una cuenta por encima de la banda', () => {
    expect(isVolumeInBand(21)).toBe(false);
  });
});
