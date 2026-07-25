import { describe, expect, it } from 'vitest';
import { parseRoute } from './router';

describe('parseRoute', () => {
  it('defaults to overview for an empty hash', () => {
    expect(parseRoute('')).toEqual({ route: 'overview' });
    expect(parseRoute('#')).toEqual({ route: 'overview' });
  });

  it('reads a known route', () => {
    expect(parseRoute('#/sessions')).toEqual({ route: 'sessions' });
    expect(parseRoute('#/routines')).toEqual({ route: 'routines' });
  });

  it('reads the exercise id segment', () => {
    expect(parseRoute('#/exercise/7')).toEqual({ route: 'exercise', exerciseId: 7 });
  });

  it('omits the id when the exercise segment is not a number', () => {
    expect(parseRoute('#/exercise/abc')).toEqual({ route: 'exercise' });
  });

  it('falls back to overview for an unknown route', () => {
    expect(parseRoute('#/nope')).toEqual({ route: 'overview' });
  });
});
