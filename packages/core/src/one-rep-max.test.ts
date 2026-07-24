import { describe, expect, it } from 'vitest';
import { estimate1RM, session1RM } from './one-rep-max';

describe('estimate1RM', () => {
  it('returns the weight itself for a single (reps = 1)', () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });

  it('applies the Epley formula for reps >= 2', () => {
    expect(estimate1RM(60, 8)).toBeCloseTo(76, 5);
    expect(estimate1RM(100, 2)).toBeCloseTo(106.6667, 3);
  });

  it('throws on non-positive weight', () => {
    expect(() => estimate1RM(0, 5)).toThrow();
    expect(() => estimate1RM(-10, 5)).toThrow();
  });

  it('throws on invalid reps', () => {
    expect(() => estimate1RM(60, 0)).toThrow();
    expect(() => estimate1RM(60, 1.5)).toThrow();
  });
});

describe('session1RM', () => {
  it('returns the max estimated 1RM among effective sets', () => {
    const sets = [
      { weightKg: 120, reps: 1, isWarmup: true },
      { weightKg: 60, reps: 8, isWarmup: false },
      { weightKg: 80, reps: 3, isWarmup: false },
    ];
    expect(session1RM(sets)).toBeCloseTo(88, 5); // 80 * (1 + 3/30)
  });

  it('returns undefined when there are no effective sets', () => {
    expect(session1RM([])).toBeUndefined();
    expect(session1RM([{ weightKg: 40, reps: 10, isWarmup: true }])).toBeUndefined();
  });
});
