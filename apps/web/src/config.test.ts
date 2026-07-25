import { describe, expect, it } from 'vitest';
import { TIME_ZONE, VOLUME_TARGET_MAX, VOLUME_TARGET_MIN } from './config';

describe('config', () => {
  it('exposes a valid IANA time zone', () => {
    expect(() => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })).not.toThrow();
  });

  it('describes the 10-20 effective-set target band from SPEC §8', () => {
    expect(VOLUME_TARGET_MIN).toBe(10);
    expect(VOLUME_TARGET_MAX).toBe(20);
  });
});
