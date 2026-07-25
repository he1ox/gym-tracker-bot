import { describe, expect, it } from 'vitest';
import { buildDataset } from '../data/mock';
import type { Dataset, MockExercise, MockSet, MockWorkout } from '../data/types';
import { buildExercise, firstExerciseId } from './exercise';

const DAY_MS = 86_400_000;

const DATA = buildDataset(new Date('2026-07-25T18:00:00Z'));
const ID = firstExerciseId(DATA);

/**
 * Two workouts a day apart, each with three sets 150s apart (positions
 * restart at 0 in the second workout, exactly like real data). The true
 * average rest is 150s — a naive cross-workout sort would instead measure
 * gaps spanning most of a day.
 */
function twoWorkoutDataset(): Dataset {
  const exercise: MockExercise = { id: 1, name: 'Press de prueba', muscleGroup: 'chest', isBodyweight: false };
  const day1 = new Date('2026-01-01T10:00:00Z');
  const day2 = new Date(day1.getTime() + DAY_MS);
  const workouts: MockWorkout[] = [
    { id: 1, dayName: 'Día A', startedAt: day1, finishedAt: new Date(day1.getTime() + 20 * 60_000) },
    { id: 2, dayName: 'Día A', startedAt: day2, finishedAt: new Date(day2.getTime() + 20 * 60_000) },
  ];
  const sets: MockSet[] = [];
  let id = 1;
  for (const workout of workouts) {
    for (let position = 0; position < 3; position++) {
      sets.push({
        id: id++,
        workoutId: workout.id,
        exerciseId: exercise.id,
        position,
        weightKg: 50,
        reps: 8,
        isWarmup: false,
        createdAt: new Date(workout.startedAt.getTime() + position * 150_000),
      });
    }
  }
  return { exercises: [exercise], workouts, sets, routines: [] };
}

describe('buildExercise', () => {
  it('returns undefined for an unknown exercise', () => {
    expect(buildExercise(DATA, -1)).toBeUndefined();
  });

  it('builds a 1RM trend in chronological order', () => {
    expect(ID).toBeDefined();
    if (ID === undefined) return;
    const model = buildExercise(DATA, ID);
    expect(model).toBeDefined();
    const keys = model?.trend.map((p) => p.weekKey) ?? [];
    expect([...keys].sort()).toEqual(keys);
  });

  it('marks records as the running maximum of estimated 1RM', () => {
    if (ID === undefined) return;
    const trend = buildExercise(DATA, ID)?.trend ?? [];
    expect(trend.length).toBeGreaterThan(0);
    expect(trend[0]?.isRecord).toBe(true);
    let running = 0;
    for (const point of trend) {
      if (point.isRecord) {
        expect(point.estimated1RM).toBeGreaterThan(running);
        running = point.estimated1RM;
      }
    }
  });

  it('reports one volume entry per session and a non-empty history', () => {
    if (ID === undefined) return;
    const model = buildExercise(DATA, ID);
    expect(model?.sessionVolume.length).toBeGreaterThan(0);
    expect(model?.history.length).toBe(model?.sessionVolume.length);
  });

  it('leaves bodyweight lifts without a 1RM figure but keeps their history', () => {
    const bodyweight = DATA.exercises.find((e) => e.isBodyweight);
    expect(bodyweight).toBeDefined();
    if (bodyweight === undefined) return;
    const model = buildExercise(DATA, bodyweight.id);
    expect(model?.trend).toEqual([]);
    expect(model?.current1RM).toBe('—');
    expect(model?.best1RM).toBe('—');
    expect(model?.history.length).toBeGreaterThan(0);
    expect(model?.bestEver).toMatch(/PC/);
  });

  it('averages rest within each workout, never across workouts (F1)', () => {
    const model = buildExercise(twoWorkoutDataset(), 1);
    expect(model).toBeDefined();
    // The true intra-workout gap is 150s. A cross-day sort would drag the
    // average up towards a large fraction of a day (86_400s), so a wide
    // upper bound is enough to catch the regression without being brittle.
    expect(model?.avgRestSeconds).toBe(150);
  });

  it('exposes ready-to-paint session-volume geometry and labels (F2)', () => {
    if (ID === undefined) return;
    const model = buildExercise(DATA, ID);
    expect(model?.sessionVolume.length).toBeGreaterThan(0);
    for (const entry of model?.sessionVolume ?? []) {
      expect(entry.percent).toBeGreaterThanOrEqual(0);
      expect(entry.percent).toBeLessThanOrEqual(100);
      expect(entry.tonnageLabel).toMatch(/^[\d.,]+ kg$/);
      expect(typeof entry.workoutId).toBe('number');
    }
    expect(model?.volumeMax).toBeGreaterThan(0);
  });

  it('reports the record count matching the trend flags (F2)', () => {
    if (ID === undefined) return;
    const model = buildExercise(DATA, ID);
    const expected = model?.trend.filter((p) => p.isRecord).length ?? 0;
    expect(model?.recordCount).toBe(expected);
    expect(model?.recordCount).toBeGreaterThan(0);
  });

  it('flags bodyweight status from the exercise fact, not from trend length (F4)', () => {
    const bodyweight = DATA.exercises.find((e) => e.isBodyweight);
    const loaded = DATA.exercises.find((e) => !e.isBodyweight);
    expect(bodyweight).toBeDefined();
    expect(loaded).toBeDefined();
    if (bodyweight === undefined || loaded === undefined) return;
    expect(buildExercise(DATA, bodyweight.id)?.isBodyweight).toBe(true);
    expect(buildExercise(DATA, loaded.id)?.isBodyweight).toBe(false);

    // A loaded exercise whose sets all land in a single ISO week must still
    // be reported as not bodyweight, even though its trend has fewer than 2
    // points — the bug this guards against inferred "bodyweight" from
    // `trend.length < 2` instead of the exercise's own fact.
    const single = twoWorkoutSameWeekLoadedExercise();
    const model = buildExercise(single.data, single.exerciseId);
    expect(model?.trend.length).toBeLessThan(2);
    expect(model?.isBodyweight).toBe(false);
  });

  it('gives each session-volume and history entry a workout id for a stable key (F4)', () => {
    if (ID === undefined) return;
    const model = buildExercise(DATA, ID);
    const volumeIds = model?.sessionVolume.map((v) => v.workoutId) ?? [];
    const historyIds = model?.history.map((h) => h.workoutId) ?? [];
    expect(new Set(volumeIds).size).toBe(volumeIds.length);
    expect(new Set(historyIds).size).toBe(historyIds.length);
  });
});

/** A loaded exercise with two workouts inside the same ISO week: trend has one point. */
function twoWorkoutSameWeekLoadedExercise(): { data: Dataset; exerciseId: number } {
  const exercise: MockExercise = { id: 1, name: 'Press de prueba', muscleGroup: 'chest', isBodyweight: false };
  const monday = new Date('2026-01-05T10:00:00Z'); // a Monday
  const wednesday = new Date(monday.getTime() + 2 * DAY_MS);
  const workouts: MockWorkout[] = [
    { id: 1, dayName: 'Día A', startedAt: monday, finishedAt: new Date(monday.getTime() + 20 * 60_000) },
    { id: 2, dayName: 'Día A', startedAt: wednesday, finishedAt: new Date(wednesday.getTime() + 20 * 60_000) },
  ];
  const sets: MockSet[] = [{
    id: 1, workoutId: 1, exerciseId: exercise.id, position: 0,
    weightKg: 50, reps: 8, isWarmup: false, createdAt: monday,
  }, {
    id: 2, workoutId: 2, exerciseId: exercise.id, position: 0,
    weightKg: 50, reps: 8, isWarmup: false, createdAt: wednesday,
  }];
  return { data: { exercises: [exercise], workouts, sets, routines: [] }, exerciseId: exercise.id };
}
