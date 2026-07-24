import { describe, expect, it } from 'vitest';
import { detectStagnation } from './stagnation';

// Semanas ISO 2026 usadas (lunes): W02=ene05, W03=ene12, W04=ene19, W05=ene26, W06=feb02.
const set = (weightKg: number, reps: number, iso: string, isWarmup = false) => ({
  weightKg,
  reps,
  isWarmup,
  createdAt: new Date(iso),
});
const UTC = { timeZone: 'UTC' };

describe('detectStagnation', () => {
  it('is not stagnant with no sets', () => {
    expect(detectStagnation([], UTC)).toEqual({ stagnant: false });
  });

  it('is not stagnant with a single trained week', () => {
    expect(detectStagnation([set(100, 1, '2026-01-05T12:00:00Z')], UTC)).toEqual({ stagnant: false });
  });

  it('is not stagnant with fewer trained weeks after the record than the threshold', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record 100
      set(80, 5, '2026-01-12T12:00:00Z'), // W03: 93.3
      set(80, 5, '2026-01-19T12:00:00Z'), // W04: 93.3
    ];
    expect(detectStagnation(sets, UTC)).toEqual({ stagnant: false });
  });

  it('is stagnant with exactly 3 trained weeks after the record without beating it', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record
      set(80, 5, '2026-01-12T12:00:00Z'), // W03
      set(82.5, 5, '2026-01-19T12:00:00Z'), // W04: 96.25
      set(80, 5, '2026-01-26T12:00:00Z'), // W05
    ];
    expect(detectStagnation(sets, UTC)).toEqual({
      stagnant: true,
      recordWeekKey: '2026-W02',
      record1RM: 100,
      weeksWithoutImprovement: 3,
      best1RMSinceRecord: 82.5 * (1 + 5 / 30),
    });
  });

  it('ignores calendar weeks without training (gaps do not count)', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record
      set(80, 5, '2026-01-19T12:00:00Z'), // W04 (W03 sin entrenar)
      set(80, 5, '2026-02-02T12:00:00Z'), // W06
      set(80, 5, '2026-02-16T12:00:00Z'), // W08
    ];
    const result = detectStagnation(sets, UTC);
    expect(result.stagnant).toBe(true);
    expect(result.stagnant && result.weeksWithoutImprovement).toBe(3);
  });

  it('does not renew the record when it is merely equaled later', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record
      set(100, 1, '2026-01-12T12:00:00Z'), // W03: iguala, no renueva
      set(80, 5, '2026-01-19T12:00:00Z'), // W04
      set(80, 5, '2026-01-26T12:00:00Z'), // W05
    ];
    const result = detectStagnation(sets, UTC);
    expect(result).toEqual({
      stagnant: true,
      recordWeekKey: '2026-W02',
      record1RM: 100,
      weeksWithoutImprovement: 3,
      best1RMSinceRecord: 100,
    });
  });

  it('resets the count when the record is strictly beaten', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02
      set(90, 1, '2026-01-12T12:00:00Z'), // W03
      set(102, 1, '2026-01-19T12:00:00Z'), // W04: nuevo record
      set(95, 1, '2026-01-26T12:00:00Z'), // W05
      set(96, 1, '2026-02-02T12:00:00Z'), // W06
    ];
    expect(detectStagnation(sets, UTC)).toEqual({ stagnant: false }); // solo 2 semanas tras W04
  });

  it('honors a custom weeks threshold', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'),
      set(80, 5, '2026-01-12T12:00:00Z'),
      set(80, 5, '2026-01-19T12:00:00Z'),
    ];
    expect(detectStagnation(sets, { timeZone: 'UTC', weeks: 2 }).stagnant).toBe(true);
  });

  it('excludes warmup sets from 1RM computation', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record 100
      set(80, 5, '2026-01-12T12:00:00Z', false),
      set(150, 1, '2026-01-12T11:00:00Z', true), // warmup pesado: no cuenta
      set(80, 5, '2026-01-19T12:00:00Z'),
      set(80, 5, '2026-01-26T12:00:00Z'),
    ];
    const result = detectStagnation(sets, UTC);
    expect(result.stagnant).toBe(true);
    expect(result.stagnant && result.record1RM).toBe(100);
  });

  it('buckets by local week: same data differs between UTC and UTC-6', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'), // W02: record
      set(80, 5, '2026-01-12T12:00:00Z'), // W03 en ambas zonas
      set(80, 5, '2026-01-21T12:00:00Z'), // W04 en ambas zonas
      set(80, 5, '2026-01-26T03:00:00Z'), // lunes 03:00 UTC = domingo 21:00 en Guatemala
    ];
    expect(detectStagnation(sets, { timeZone: 'UTC' }).stagnant).toBe(true); // W03,W04,W05
    expect(detectStagnation(sets, { timeZone: 'America/Guatemala' }).stagnant).toBe(false); // W03,W04
  });

  it('keeps the best 1RM per week when a week has several sets', () => {
    const sets = [
      set(100, 1, '2026-01-05T12:00:00Z'),
      set(60, 8, '2026-01-12T10:00:00Z'), // 76
      set(90, 2, '2026-01-12T10:10:00Z'), // 96 (mejor de W03)
      set(80, 5, '2026-01-19T12:00:00Z'),
      set(80, 5, '2026-01-26T12:00:00Z'),
    ];
    const result = detectStagnation(sets, UTC);
    expect(result.stagnant && result.best1RMSinceRecord).toBe(96);
  });

  it('throws on an invalid weeks threshold', () => {
    expect(() => detectStagnation([], { timeZone: 'UTC', weeks: 0 })).toThrow();
    expect(() => detectStagnation([], { timeZone: 'UTC', weeks: 1.5 })).toThrow();
  });
});
