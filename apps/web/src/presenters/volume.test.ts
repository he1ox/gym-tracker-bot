import { describe, expect, it } from 'vitest';
import { isVolumeInBand } from './volume';

describe('isVolumeInBand', () => {
  it('flags a count below the band as out of band', () => {
    expect(isVolumeInBand(9)).toBe(false);
  });

  it('includes the lower boundary in the band', () => {
    expect(isVolumeInBand(10)).toBe(true);
  });

  it('includes the upper boundary in the band', () => {
    expect(isVolumeInBand(20)).toBe(true);
  });

  it('flags a count above the band as out of band', () => {
    expect(isVolumeInBand(21)).toBe(false);
  });
});
