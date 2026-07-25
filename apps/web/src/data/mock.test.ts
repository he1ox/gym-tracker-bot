import { detectStagnation, effectiveSets, sessionTonnage, session1RM, weeklyVolumeByMuscleGroup, isoWeekKey } from '@gym-tracker/core';
import { describe, expect, it } from 'vitest';
import { TIME_ZONE } from '../config';
import { buildDataset, muscleGroupMap } from './mock';

const NOW = new Date('2026-07-25T18:00:00Z');

describe('buildDataset', () => {
  it('is deterministic for a given instant', () => {
    expect(JSON.stringify(buildDataset(NOW))).toBe(JSON.stringify(buildDataset(NOW)));
  });

  it('produces raw sets, never aggregates', () => {
    const data = buildDataset(NOW);
    expect(data.sets.length).toBeGreaterThan(200);
    for (const set of data.sets) {
      expect(set.reps).toBeGreaterThan(0);
      expect(set.weightKg).toBeGreaterThanOrEqual(0);
      expect(set.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('includes warm-up sets so effectiveSets has something to filter', () => {
    const data = buildDataset(NOW);
    expect(data.sets.some((s) => s.isWarmup)).toBe(true);
    expect(effectiveSets(data.sets).length).toBeLessThan(data.sets.length);
  });

  it('feeds core without any adaptation', () => {
    const data = buildDataset(NOW);
    const first = data.workouts[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const sets = data.sets.filter((s) => s.workoutId === first.id);
    expect(sessionTonnage(sets)).toBeGreaterThan(0);
    expect(session1RM(sets)).toBeGreaterThan(0);

    const volume = weeklyVolumeByMuscleGroup(data.sets, muscleGroupMap(data.exercises), {
      weekKey: isoWeekKey(NOW, TIME_ZONE),
      timeZone: TIME_ZONE,
    });
    expect(volume.size).toBeGreaterThan(0);
  });

  it('references only existing exercises and workouts', () => {
    const data = buildDataset(NOW);
    const exerciseIds = new Set(data.exercises.map((e) => e.id));
    const workoutIds = new Set(data.workouts.map((w) => w.id));
    for (const set of data.sets) {
      expect(exerciseIds.has(set.exerciseId)).toBe(true);
      expect(workoutIds.has(set.workoutId)).toBe(true);
    }
  });

  it('ships one active routine and one archived routine', () => {
    const { routines } = buildDataset(NOW);
    expect(routines.filter((r) => r.isActive)).toHaveLength(1);
    expect(routines.some((r) => r.archived)).toBe(true);
  });

  it('leaves some lifts genuinely stagnant for detectStagnation to find', () => {
    const data = buildDataset(NOW);
    const bench = data.exercises.find((e) => e.name === 'Press banca');
    expect(bench).toBeDefined();
    if (bench === undefined) return;

    const result = detectStagnation(
      data.sets.filter((s) => s.exerciseId === bench.id),
      { timeZone: TIME_ZONE },
    );
    expect(result.stagnant).toBe(true);
  });

  it('keeps other lifts progressing', () => {
    const data = buildDataset(NOW);
    const press = data.exercises.find((e) => e.name === 'Prensa');
    expect(press).toBeDefined();
    if (press === undefined) return;

    const result = detectStagnation(
      data.sets.filter((s) => s.exerciseId === press.id),
      { timeZone: TIME_ZONE },
    );
    expect(result.stagnant).toBe(false);
  });
});
