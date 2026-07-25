import { describe, expect, it } from 'vitest';
import { buildDataset } from '../data/mock';
import { buildRoutines, clampInt } from './routines';

const MODEL = buildRoutines(buildDataset(new Date('2026-07-25T18:00:00Z')));

describe('clampInt', () => {
  it('keeps values inside the range', () => {
    expect(clampInt('5', 1, 20)).toBe(5);
    expect(clampInt('99', 1, 20)).toBe(20);
    expect(clampInt('0', 1, 20)).toBe(1);
  });
  it('falls back to the minimum for junk input', () => {
    expect(clampInt('abc', 1, 20)).toBe(1);
    expect(clampInt('', 1, 20)).toBe(1);
  });
});

describe('buildRoutines', () => {
  it('describes each routine with day and exercise counts', () => {
    const active = MODEL.cards.find((c) => c.isActive);
    expect(active).toBeDefined();
    expect(active?.meta).toMatch(/días · \d+ ejercicios/);
  });

  it('separates archived routines', () => {
    expect(MODEL.cards.some((c) => c.archived)).toBe(true);
  });

  it('lists days in position order with their exercise counts', () => {
    const active = MODEL.cards.find((c) => c.isActive);
    expect(active).toBeDefined();
    if (active === undefined) return;
    const days = MODEL.daysFor(active.id);
    expect(days.length).toBeGreaterThan(0);
    expect(days[0]?.count).toBeGreaterThan(0);
  });

  it('labels catalog entries with Spanish muscle names', () => {
    expect(MODEL.catalog.length).toBeGreaterThan(0);
    for (const entry of MODEL.catalog) {
      expect(entry.muscleLabel).toMatch(/[A-Za-zÁÉÍÓÚáéíóú]/);
    }
  });
});
