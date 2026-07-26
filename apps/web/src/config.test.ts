import { describe, expect, it } from 'vitest';
import { TIME_ZONE } from './config';

describe('config', () => {
  it('exposes a valid IANA time zone', () => {
    expect(() => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })).not.toThrow();
  });
});
