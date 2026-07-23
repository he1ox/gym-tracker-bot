import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS } from './types';

describe('MUSCLE_GROUPS', () => {
  it('contains the 17 approved groups', () => {
    expect(MUSCLE_GROUPS).toHaveLength(17);
    expect(new Set(MUSCLE_GROUPS).size).toBe(17);
  });

  it('has a non-empty Spanish label for every group', () => {
    for (const group of MUSCLE_GROUPS) {
      expect(MUSCLE_GROUP_LABELS[group]).toBeTruthy();
    }
  });
});
