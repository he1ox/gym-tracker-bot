import { describe, expect, it } from 'vitest';
import { buildDataset } from '../data/mock';
import { buildExercise, firstExerciseId } from './exercise';

const DATA = buildDataset(new Date('2026-07-25T18:00:00Z'));
const ID = firstExerciseId(DATA);

describe('buildExercise', () => {
  it('returns undefined for an unknown exercise', () => {
    expect(buildExercise(DATA, -1)).toBeUndefined();
  });

  it('builds a 1RM trend in chronological order', () => {
    expect(ID).toBeDefined();
    if (ID === undefined) return;
    const model = buildExercise(DATA, ID);
    expect(model).toBeDefined();
    const keys = model?.trend.map((p) => p.weekKey) ?? [];
    expect([...keys].sort()).toEqual(keys);
  });

  it('marks records as the running maximum of estimated 1RM', () => {
    if (ID === undefined) return;
    const trend = buildExercise(DATA, ID)?.trend ?? [];
    expect(trend.length).toBeGreaterThan(0);
    expect(trend[0]?.isRecord).toBe(true);
    let running = 0;
    for (const point of trend) {
      if (point.isRecord) {
        expect(point.estimated1RM).toBeGreaterThan(running);
        running = point.estimated1RM;
      }
    }
  });

  it('reports one volume entry per session and a non-empty history', () => {
    if (ID === undefined) return;
    const model = buildExercise(DATA, ID);
    expect(model?.sessionVolume.length).toBeGreaterThan(0);
    expect(model?.history.length).toBe(model?.sessionVolume.length);
  });

  it('leaves bodyweight lifts without a 1RM figure but keeps their history', () => {
    const bodyweight = DATA.exercises.find((e) => e.isBodyweight);
    expect(bodyweight).toBeDefined();
    if (bodyweight === undefined) return;
    const model = buildExercise(DATA, bodyweight.id);
    expect(model?.trend).toEqual([]);
    expect(model?.current1RM).toBe('—');
    expect(model?.best1RM).toBe('—');
    expect(model?.history.length).toBeGreaterThan(0);
    expect(model?.bestEver).toMatch(/PC/);
  });
});
