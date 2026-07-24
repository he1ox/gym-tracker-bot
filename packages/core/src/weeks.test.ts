import { describe, expect, it } from 'vitest';
import { compareWeekKeys, isoWeekKey } from './weeks';

describe('isoWeekKey', () => {
  it('computes the ISO week of a mid-week UTC instant', () => {
    expect(isoWeekKey(new Date('2026-07-22T12:00:00Z'), 'UTC')).toBe('2026-W30');
  });

  it('zero-pads week numbers below 10', () => {
    expect(isoWeekKey(new Date('2026-01-26T12:00:00Z'), 'UTC')).toBe('2026-W05');
  });

  it('assigns late-December days to week 1 of the next ISO year', () => {
    expect(isoWeekKey(new Date('2025-12-29T12:00:00Z'), 'UTC')).toBe('2026-W01');
  });

  it('assigns early-January days to week 53 of the previous ISO year', () => {
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'), 'UTC')).toBe('2026-W53');
  });

  it('uses the local date of the timezone: Monday 03:00 UTC is still Sunday in UTC-6', () => {
    const instant = new Date('2026-07-20T03:00:00Z');
    expect(isoWeekKey(instant, 'UTC')).toBe('2026-W30');
    expect(isoWeekKey(instant, 'America/Guatemala')).toBe('2026-W29');
  });

  it('handles half-hour offset timezones', () => {
    const instant = new Date('2026-07-19T19:00:00Z'); // 00:30 Monday in Kolkata
    expect(isoWeekKey(instant, 'UTC')).toBe('2026-W29');
    expect(isoWeekKey(instant, 'Asia/Kolkata')).toBe('2026-W30');
  });

  it('throws on an invalid timezone', () => {
    expect(() => isoWeekKey(new Date(), 'Not/AZone')).toThrow();
  });
});

describe('compareWeekKeys', () => {
  it('orders keys chronologically across year boundaries', () => {
    expect(compareWeekKeys('2025-W52', '2026-W01')).toBeLessThan(0);
    expect(compareWeekKeys('2026-W05', '2026-W30')).toBeLessThan(0);
    expect(compareWeekKeys('2026-W30', '2026-W30')).toBe(0);
    expect(compareWeekKeys('2026-W02', '2025-W53')).toBeGreaterThan(0);
  });
});
