import { describe, expect, it } from 'vitest';
import { detectPersonalRecord } from './records';

const set = (weightKg: number, reps: number, isWarmup = false) => ({ weightKg, reps, isWarmup });

describe('detectPersonalRecord', () => {
  it('detects a record when the session strictly beats the historical max', () => {
    const history = [set(100, 5)]; // 1RM 116.67
    const session = [set(105, 5)]; // 1RM 122.5
    expect(detectPersonalRecord(history, session)).toEqual({
      estimated1RM: 105 * (1 + 5 / 30),
      previous1RM: 100 * (1 + 5 / 30),
    });
  });

  it('does not count equaling the record', () => {
    const history = [set(100, 5)];
    const session = [set(100, 5)];
    expect(detectPersonalRecord(history, session)).toBeUndefined();
  });

  it('does not count a session below the record', () => {
    expect(detectPersonalRecord([set(100, 5)], [set(90, 5)])).toBeUndefined();
  });

  it('treats the first-ever session as a record without previous1RM', () => {
    expect(detectPersonalRecord([], [set(60, 8)])).toEqual({ estimated1RM: 76 });
  });

  it('ignores warmups on both sides', () => {
    const history = [set(200, 1, true), set(100, 5)];
    const session = [set(105, 5), set(150, 1, true)];
    const record = detectPersonalRecord(history, session);
    expect(record?.estimated1RM).toBeCloseTo(122.5, 5);
    expect(record?.previous1RM).toBeCloseTo(116.6667, 3);
  });

  it('returns undefined when the session has no effective sets', () => {
    expect(detectPersonalRecord([set(100, 5)], [set(40, 10, true)])).toBeUndefined();
    expect(detectPersonalRecord([set(100, 5)], [])).toBeUndefined();
  });
});
