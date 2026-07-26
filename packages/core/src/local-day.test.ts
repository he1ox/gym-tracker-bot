import { describe, expect, it } from 'vitest';
import { startOfLocalDay } from './local-day';

// Helper de lectura: la hora local de un epoch, para afirmar sobre lo que ve el usuario.
function localTime(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(epochMs));
}

describe('startOfLocalDay', () => {
  it('returns the same instant for UTC midnight in UTC', () => {
    const midnight = Date.UTC(2026, 6, 25);
    expect(startOfLocalDay(new Date(midnight), 'UTC')).toBe(midnight);
    expect(startOfLocalDay(new Date(midnight + 23 * 3_600_000), 'UTC')).toBe(midnight);
  });

  it('keeps a 23:50 set inside its own local day (America/Mexico_City)', () => {
    const tz = 'America/Mexico_City'; // UTC-6 fijo desde 2022
    // 2026-07-25 23:50 local = 2026-07-26 05:50 UTC
    const lateNight = Date.UTC(2026, 6, 26, 5, 50);
    const start = startOfLocalDay(new Date(lateNight), tz);
    expect(localTime(start, tz)).toBe('2026-07-25, 00:00');
    expect(start).toBeLessThanOrEqual(lateNight);
    // Y diez minutos después ya es otro día local.
    expect(startOfLocalDay(new Date(lateNight + 20 * 60_000), tz)).toBeGreaterThan(start);
  });

  it('handles a spring-forward day (America/New_York, 2026-03-08)', () => {
    const tz = 'America/New_York'; // 02:00 EST -> 03:00 EDT
    const afternoon = Date.UTC(2026, 2, 8, 19, 0); // 15:00 EDT
    const start = startOfLocalDay(new Date(afternoon), tz);
    expect(localTime(start, tz)).toBe('2026-03-08, 00:00');
    expect(start).toBe(Date.UTC(2026, 2, 8, 5, 0)); // 00:00 EST = 05:00 UTC
  });

  it('handles a fall-back day (America/New_York, 2025-11-02)', () => {
    const tz = 'America/New_York'; // 02:00 EDT -> 01:00 EST
    const afternoon = Date.UTC(2025, 10, 2, 20, 0); // 15:00 EST
    const start = startOfLocalDay(new Date(afternoon), tz);
    expect(localTime(start, tz)).toBe('2025-11-02, 00:00');
    expect(start).toBe(Date.UTC(2025, 10, 2, 4, 0)); // 00:00 EDT = 04:00 UTC
  });

  it('handles a half-hour offset zone (Asia/Kolkata)', () => {
    const tz = 'Asia/Kolkata'; // UTC+5:30 fijo
    const start = startOfLocalDay(new Date(Date.UTC(2026, 2, 15, 10, 0)), tz);
    expect(localTime(start, tz)).toBe('2026-03-15, 00:00');
    expect(start).toBe(Date.UTC(2026, 2, 14, 18, 30));
  });

  it('starts the day at 01:00 when the DST jump deletes local midnight (America/Santiago)', () => {
    const tz = 'America/Santiago'; // 2025-09-07: 00:00 -> 01:00, las 00:00 no existen
    const start = startOfLocalDay(new Date(Date.UTC(2025, 8, 7, 18, 0)), tz);
    expect(localTime(start, tz)).toBe('2025-09-07, 01:00');
  });

  it('is idempotent: the start of a day is its own start of day', () => {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Kolkata', 'Europe/Madrid']) {
      const start = startOfLocalDay(new Date(Date.UTC(2026, 2, 8, 19, 0)), tz);
      expect(startOfLocalDay(new Date(start), tz)).toBe(start);
    }
  });
});
