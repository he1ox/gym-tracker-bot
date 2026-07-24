import { describe, expect, it } from 'vitest';
import { deriveRestSeconds } from './rest';

describe('deriveRestSeconds', () => {
  it('derives rest from consecutive createdAt gaps, ordered by position', () => {
    const sets = [
      { position: 2, createdAt: new Date('2026-01-12T10:02:30Z') },
      { position: 1, createdAt: new Date('2026-01-12T10:00:00Z') },
      { position: 3, createdAt: new Date('2026-01-12T10:04:00Z') },
    ];
    expect(deriveRestSeconds(sets)).toEqual([undefined, 150, 90]);
  });

  it('returns [undefined] for a single set and [] for none', () => {
    expect(deriveRestSeconds([{ position: 1, createdAt: new Date() }])).toEqual([undefined]);
    expect(deriveRestSeconds([])).toEqual([]);
  });
});
