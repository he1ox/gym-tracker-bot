import { describe, expect, it } from 'vitest';
import { type OverviewSet, buildOverview, overviewTotals, percentChange } from './overview';

const DAY = 86_400_000;

// Ventana actual [1000, 1000 + 30*DAY]; anterior [1000 - 30*DAY, 1000).
const CURRENT_FROM = 1000;
const CURRENT_TO = 1000 + 30 * DAY;
const PREVIOUS_FROM = 1000 - 30 * DAY;

function set(createdAt: number, over: Partial<OverviewSet> = {}): OverviewSet {
  return { createdAt, weightKg: 100, reps: 5, exerciseName: 'Sentadilla', ...over };
}

function build(sets: OverviewSet[], workoutStarts: number[] = []) {
  return buildOverview({
    sets,
    workoutStarts,
    currentFrom: CURRENT_FROM,
    currentTo: CURRENT_TO,
    previousFrom: PREVIOUS_FROM,
  });
}

describe('percentChange', () => {
  it('returns null when the previous window is zero: there is nothing to divide by', () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it('reports an improvement as a positive integer', () => {
    expect(percentChange(120, 100)).toBe(20);
  });

  it('reports a worsening as a negative integer', () => {
    expect(percentChange(97, 100)).toBe(-3);
  });

  it('reports equal values as zero', () => {
    expect(percentChange(100, 100)).toBe(0);
  });

  it('rounds to the nearest integer', () => {
    expect(percentChange(1093, 1000)).toBe(9); // 9.3 %
    expect(percentChange(1096, 1000)).toBe(10); // 9.6 %
  });
});

describe('overviewTotals', () => {
  it('adds reps and tonnage over the given sets', () => {
    const totals = overviewTotals([set(1, { weightKg: 60, reps: 8 }), set(2, { weightKg: 100, reps: 5 })], [1]);
    expect(totals.effectiveSets).toBe(2);
    expect(totals.reps).toBe(13);
    expect(totals.tonnageKg).toBe(60 * 8 + 100 * 5);
    expect(totals.workouts).toBe(1);
  });

  it('reports no heaviest set when there are no sets', () => {
    const totals = overviewTotals([], []);
    expect(totals.heaviest).toBeNull();
    expect(totals.tonnageKg).toBe(0);
  });

  it('breaks a tie in the heaviest set with the most recent one', () => {
    const totals = overviewTotals(
      [
        set(100, { weightKg: 140, exerciseName: 'Peso muerto' }),
        set(200, { weightKg: 140, exerciseName: 'Sentadilla' }),
        set(300, { weightKg: 120, exerciseName: 'Press banca' }),
      ],
      [],
    );
    expect(totals.heaviest).toEqual({ weightKg: 140, exerciseName: 'Sentadilla' });
  });

  it('keeps the heavier set even when a lighter one is more recent', () => {
    const totals = overviewTotals(
      [set(100, { weightKg: 140, exerciseName: 'Peso muerto' }), set(999, { weightKg: 60, exerciseName: 'Curl' })],
      [],
    );
    expect(totals.heaviest).toEqual({ weightKg: 140, exerciseName: 'Peso muerto' });
  });
});

describe('buildOverview', () => {
  it('splits sets between the two windows without overlap or gap', () => {
    const overview = build([
      set(PREVIOUS_FROM), // primer instante de la ventana anterior: cuenta
      set(CURRENT_FROM - 1), // último instante de la anterior
      set(CURRENT_FROM), // primer instante de la actual
      set(CURRENT_TO), // último instante de la actual
    ]);
    expect(overview.effectiveSets.previous).toBe(2);
    expect(overview.effectiveSets.current).toBe(2);
  });

  it('ignores sets outside both windows', () => {
    const overview = build([set(PREVIOUS_FROM - 1), set(CURRENT_TO + 1)]);
    expect(overview.effectiveSets.current).toBe(0);
    expect(overview.effectiveSets.previous).toBe(0);
  });

  it('counts workouts with no effective sets at all', () => {
    const overview = build([], [CURRENT_FROM, CURRENT_FROM + DAY, PREVIOUS_FROM]);
    expect(overview.workouts.current).toBe(2);
    expect(overview.workouts.previous).toBe(1);
    expect(overview.effectiveSets.current).toBe(0);
    expect(overview.workouts.changePercent).toBe(100);
  });

  it('reports the heaviest set of the current window with its exercise name', () => {
    const overview = build([
      set(CURRENT_FROM, { weightKg: 140, exerciseName: 'Peso muerto' }),
      set(CURRENT_FROM + DAY, { weightKg: 100, exerciseName: 'Sentadilla' }),
      set(PREVIOUS_FROM, { weightKg: 135, exerciseName: 'Peso muerto' }),
    ]);
    expect(overview.heaviest.current).toBe(140);
    expect(overview.heaviest.previous).toBe(135);
    expect(overview.heaviest.exerciseName).toBe('Peso muerto');
    expect(overview.heaviest.changePercent).toBe(4); // 3.7 % -> 4
  });

  it('gives an all-zero overview with no exercise name for a user with no data', () => {
    const overview = build([]);
    expect(overview.workouts).toEqual({ current: 0, previous: 0, changePercent: null });
    expect(overview.tonnageKg).toEqual({ current: 0, previous: 0, changePercent: null });
    expect(overview.heaviest.current).toBe(0);
    expect(overview.heaviest.exerciseName).toBeNull();
    expect(overview.heaviest.changePercent).toBeNull();
  });

  it('leaves the exercise name null when only the previous window has sets', () => {
    const overview = build([set(PREVIOUS_FROM, { weightKg: 140, exerciseName: 'Peso muerto' })]);
    expect(overview.heaviest.exerciseName).toBeNull();
    expect(overview.heaviest.previous).toBe(140);
    expect(overview.heaviest.current).toBe(0);
  });
});
