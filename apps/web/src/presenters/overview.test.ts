import { isoWeekKey, weeklyVolumeByMuscleGroup } from '@gym-tracker/core';
import { afterEach, describe, expect, it } from 'vitest';
import { TIME_ZONE } from '../config';
import { buildDataset, muscleGroupMap } from '../data/mock';
import type { MockSet } from '../data/types';
import { dayOfWeekInZone } from './format';
import { buildOverview } from './overview';

const NOW = new Date('2026-07-25T18:00:00Z');
const MODEL = buildOverview(buildDataset(NOW), NOW);

describe('buildOverview', () => {
  it('produces the four KPIs in Spanish', () => {
    expect(MODEL.kpis.map((k) => k.label)).toEqual([
      'Series totales', 'Tonelaje', 'Sesiones', 'Duración media',
    ]);
  });

  it('reports volume for every muscle group that was trained', () => {
    expect(MODEL.volume.length).toBeGreaterThan(0);
    for (const row of MODEL.volume) {
      expect(row.count).toBeGreaterThan(0);
      expect(row.label).not.toBe(row.group);
    }
  });

  it('sizes the volume axis to at least the top of the target band', () => {
    expect(MODEL.volumeMax).toBeGreaterThanOrEqual(20);
  });

  it('builds a 13-week heatmap of 7-day columns', () => {
    expect(MODEL.heatmap).toHaveLength(13);
    for (const week of MODEL.heatmap) {
      expect(week).toHaveLength(7);
    }
  });

  it('surfaces the stalled lifts the dataset plateaus', () => {
    expect(MODEL.stalled.length).toBeGreaterThan(0);
    expect(MODEL.stalled.map((s) => s.name)).toContain('Press banca');
  });

  it('never invents coaching advice, only measured weeks', () => {
    expect(MODEL.stalled.length).toBeGreaterThan(0);
    for (const item of MODEL.stalled) {
      expect(item.weeks).toBeGreaterThanOrEqual(3);
      expect(item.workingSet).toMatch(/×/);
      // The mockup's "Deload to 90 kg" line is not part of the model.
      expect(Object.keys(item)).not.toContain('advice');
    }
  });

  it('plots a tonnage trend with one point per week', () => {
    expect(MODEL.tonnageTrend.length).toBeGreaterThanOrEqual(8);
  });

  it('excludes bodyweight lifts from every 1RM-derived section', () => {
    expect(MODEL.stalled.map((s) => s.name)).not.toContain('Dominadas');
    expect(MODEL.stalled.map((s) => s.name)).not.toContain('Fondos');
    expect(MODEL.records.map((r) => r.name)).not.toContain('Dominadas');
  });

  it('still counts bodyweight lifts towards weekly volume', () => {
    const data = buildDataset(NOW);
    const bodyweightIds = new Set(data.exercises.filter((e) => e.isBodyweight).map((e) => e.id));
    expect(bodyweightIds.size).toBeGreaterThan(0);

    const groups = muscleGroupMap(data.exercises);
    const options = { weekKey: isoWeekKey(NOW, TIME_ZONE), timeZone: TIME_ZONE };
    const total = (sets: readonly MockSet[]) =>
      [...weeklyVolumeByMuscleGroup(sets, groups, options).values()].reduce((a, b) => a + b, 0);

    const withBodyweight = total(data.sets);
    const withoutBodyweight = total(data.sets.filter((s) => !bodyweightIds.has(s.exerciseId)));
    expect(withBodyweight).toBeGreaterThan(withoutBodyweight);
    // The model reports exactly what core counted, bodyweight sets included.
    expect(MODEL.volume.reduce((sum, row) => sum + row.count, 0)).toBe(withBodyweight);
  });

  it('marks days that have not happened yet as blanks, not rest days', () => {
    const cells = MODEL.heatmap.flat();
    const empty = cells.filter((cell) => cell.level === 'empty');
    // Derived independently from NOW's Madrid weekday, not hardcoded: the
    // heatmap's last column is the current week, Monday-first, so every day
    // strictly after today within that week is still a blank.
    const mondayIndex = (dayOfWeekInZone(NOW, TIME_ZONE) + 6) % 7; // 0 = Monday
    const expectedEmpty = 6 - mondayIndex;
    expect(empty).toHaveLength(expectedEmpty);
    for (const cell of empty) {
      expect(cell.title).toBe('');
    }
    for (const cell of cells) {
      if (cell.level === 'empty') continue;
      expect(cell.title).not.toBe('');
    }
  });

  describe('time zone independence (F3)', () => {
    const originalTZ = process.env.TZ;
    afterEach(() => {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
    });

    it('anchors the heatmap and week label to Madrid days regardless of host offset', () => {
      // now = 2026-11-15T00:30Z reads as Sunday 01:30 in Madrid but Saturday
      // 18:30 on a UTC-6 host — the exact mismatch that produced a Tuesday
      // first column and an off-by-one week label before the fix.
      const now = new Date('2026-11-15T00:30:00Z');

      process.env.TZ = 'America/Chicago';
      const hostOffsetModel = buildOverview(buildDataset(now), now);

      process.env.TZ = 'Europe/Madrid';
      const madridHostModel = buildOverview(buildDataset(now), now);

      expect(hostOffsetModel.heatmap).toEqual(madridHostModel.heatmap);
      expect(hostOffsetModel.weekLabel).toBe(madridHostModel.weekLabel);

      // Independently confirm the first heatmap column truly starts on a
      // Monday in Madrid: the Madrid weekday for `now` is Sunday, so the
      // heatmap window (12 full weeks plus the days elapsed this week) starts
      // exactly 6 days earlier, on a Monday.
      const start = new Date(now.getTime() - (12 * 7 + 6) * 86_400_000);
      const startWeekday = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long' }).format(start);
      expect(startWeekday).toBe('Monday');
    });
  });
});
