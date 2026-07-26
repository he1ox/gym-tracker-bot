import { isoWeekKey } from '@gym-tracker/core';
import { describe, expect, it } from 'vitest';
import { isoWeekRange, weeklyGroupCounts } from './weekly-volume';

const TZ = 'UTC';
// 2026-07-22 es miércoles; 2026-07-15, el miércoles anterior.
const WEDNESDAY = Date.UTC(2026, 6, 22, 10, 0, 0);
const WEEK_BEFORE = Date.UTC(2026, 6, 15, 10, 0, 0);
const WEEK = isoWeekKey(new Date(WEDNESDAY), TZ);

const set = (at: number, group: 'chest' | 'quads' | 'biceps') => ({ createdAt: at, muscleGroup: group } as const);

describe('weeklyGroupCounts', () => {
  it('cuenta las series de la semana pedida, agrupadas por músculo', () => {
    const counts = weeklyGroupCounts(
      [set(WEDNESDAY, 'chest'), set(WEDNESDAY, 'chest'), set(WEDNESDAY, 'quads')],
      { weekKey: WEEK, timeZone: TZ },
    );
    expect(counts).toEqual([
      { group: 'chest', count: 2 },
      { group: 'quads', count: 1 },
    ]);
  });

  it('descarta las series de otras semanas', () => {
    const counts = weeklyGroupCounts([set(WEEK_BEFORE, 'chest'), set(WEDNESDAY, 'quads')], {
      weekKey: WEEK,
      timeZone: TZ,
    });
    expect(counts).toEqual([{ group: 'quads', count: 1 }]);
  });

  it('ordena de más a menos series y desempata por orden anatómico', () => {
    const counts = weeklyGroupCounts(
      [set(WEDNESDAY, 'biceps'), set(WEDNESDAY, 'chest')],
      { weekKey: WEEK, timeZone: TZ },
    );
    // Empate a 1: chest va antes que biceps en MUSCLE_GROUPS.
    expect(counts.map((c) => c.group)).toEqual(['chest', 'biceps']);
  });

  it('devuelve una lista vacía sin series', () => {
    expect(weeklyGroupCounts([], { weekKey: WEEK, timeZone: TZ })).toEqual([]);
  });
});

describe('isoWeekRange', () => {
  const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date(ms));

  it('devuelve el lunes y el domingo de la semana de un miércoles', () => {
    const range = isoWeekRange(Date.UTC(2026, 6, 22, 10, 0, 0), 'UTC');
    expect(day(range.fromMs)).toBe('2026-07-20');
    expect(day(range.toMs)).toBe('2026-07-26');
  });

  it('trata el domingo como último día de su semana, no como el primero', () => {
    const range = isoWeekRange(Date.UTC(2026, 6, 26, 23, 0, 0), 'UTC');
    expect(day(range.fromMs)).toBe('2026-07-20');
    expect(day(range.toMs)).toBe('2026-07-26');
  });

  it('usa el día local, no el UTC', () => {
    // 2026-07-20T02:00Z es todavía domingo 19 en Nueva York: semana anterior.
    const range = isoWeekRange(Date.UTC(2026, 6, 20, 2, 0, 0), 'America/New_York');
    expect(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(range.fromMs)),
    ).toBe('2026-07-13');
  });
});
