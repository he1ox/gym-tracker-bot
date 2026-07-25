import { describe, expect, it } from 'vitest';
import { buildDataset } from '../data/mock';
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
    const groups = MODEL.volume.map((v) => v.group);
    expect(groups.length).toBeGreaterThan(0);
  });
});
