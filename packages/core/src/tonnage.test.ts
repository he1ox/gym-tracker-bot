import { describe, expect, it } from 'vitest';
import { sessionTonnage, setTonnage } from './tonnage';

describe('setTonnage', () => {
  it('multiplies weight by reps', () => {
    expect(setTonnage({ weightKg: 60, reps: 8 })).toBe(480);
    expect(setTonnage({ weightKg: 32.5, reps: 10 })).toBe(325);
  });
});

describe('sessionTonnage', () => {
  it('sums effective sets and ignores warmups', () => {
    const sets = [
      { weightKg: 40, reps: 10, isWarmup: true },
      { weightKg: 60, reps: 8, isWarmup: false },
      { weightKg: 60, reps: 6, isWarmup: false },
    ];
    expect(sessionTonnage(sets)).toBe(480 + 360);
  });

  it('returns 0 for an empty session', () => {
    expect(sessionTonnage([])).toBe(0);
  });
});
