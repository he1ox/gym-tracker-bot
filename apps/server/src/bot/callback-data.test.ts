import { describe, expect, it } from 'vitest';
import { CB, parseCallback, WEIGHT_STEP } from './callback-data';

describe('callback-data', () => {
  it('builds namespaced ids', () => {
    expect(CB.day(7)).toBe('day:7');
    expect(CB.ex(42)).toBe('ex:42');
    expect(CB.free).toBe('free');
    expect(CB.restCancel).toBe('rest:cancel');
  });

  it('round-trips every builder through the parser', () => {
    expect(parseCallback(CB.day(7))).toEqual({ type: 'day', routineDayId: 7 });
    expect(parseCallback(CB.ex(42))).toEqual({ type: 'ex', exerciseId: 42 });
    expect(parseCallback(CB.free)).toEqual({ type: 'free' });
    expect(parseCallback(CB.rec)).toEqual({ type: 'rec' });
    expect(parseCallback(CB.wPlus)).toEqual({ type: 'weight', delta: WEIGHT_STEP });
    expect(parseCallback(CB.wMinus)).toEqual({ type: 'weight', delta: -WEIGHT_STEP });
    expect(parseCallback(CB.rPlus)).toEqual({ type: 'reps', delta: 1 });
    expect(parseCallback(CB.rMinus)).toEqual({ type: 'reps', delta: -1 });
    expect(parseCallback(CB.warmup)).toEqual({ type: 'warmup' });
    expect(parseCallback(CB.list)).toEqual({ type: 'list' });
    expect(parseCallback(CB.add)).toEqual({ type: 'add' });
    expect(parseCallback(CB.restCancel)).toEqual({ type: 'rest_cancel' });
  });

  it('maps unknown or malformed data to { type: "unknown" }', () => {
    expect(parseCallback('nope')).toEqual({ type: 'unknown' });
    expect(parseCallback('day:notanumber')).toEqual({ type: 'unknown' });
    expect(parseCallback('')).toEqual({ type: 'unknown' });
  });
});
