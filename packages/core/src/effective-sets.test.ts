import { describe, expect, it } from 'vitest';
import { effectiveSets } from './effective-sets';

describe('effectiveSets', () => {
  it('filters out warmup sets', () => {
    const sets = [
      { isWarmup: true, weightKg: 40 },
      { isWarmup: false, weightKg: 60 },
      { isWarmup: false, weightKg: 62.5 },
    ];
    expect(effectiveSets(sets)).toEqual([
      { isWarmup: false, weightKg: 60 },
      { isWarmup: false, weightKg: 62.5 },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(effectiveSets([])).toEqual([]);
  });
});
