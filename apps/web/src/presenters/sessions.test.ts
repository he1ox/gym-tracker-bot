import { describe, expect, it } from 'vitest';
import { buildDataset } from '../data/mock';
import { buildSessions } from './sessions';

const NOW = new Date('2026-07-25T18:00:00Z');
const MODEL = buildSessions(buildDataset(NOW));

describe('buildSessions', () => {
  it('offers a "Todas" filter plus one per routine day', () => {
    expect(MODEL.filters[0]).toEqual({ dayName: 'Todas', count: MODEL.summaries.length });
    expect(MODEL.filters.map((f) => f.dayName)).toContain('Empuje');
  });

  it('lists sessions newest first', () => {
    const first = MODEL.summaries[0];
    const second = MODEL.summaries[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
  });

  it('compares against the previous session of the same routine day', () => {
    const target = MODEL.summaries.find((s) => s.dayName === 'Empuje');
    expect(target).toBeDefined();
    if (target === undefined) return;
    const detail = MODEL.detailFor(target.id);
    expect(detail?.comparison).toBeDefined();
    expect(detail?.comparison?.liftsTotal).toBeGreaterThan(0);
    expect(detail?.comparison?.liftsUp).toBeLessThanOrEqual(detail?.comparison?.liftsTotal ?? 0);
  });

  it('marks warm-up rows with W and numbers the working sets from 1', () => {
    const first = MODEL.summaries[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const exercise = MODEL.detailFor(first.id)?.exercises.find((e) => e.sets.some((s) => s.isWarmup));
    expect(exercise).toBeDefined();
    const labels = exercise?.sets.map((s) => s.label) ?? [];
    expect(labels[0]).toBe('W');
    expect(labels.filter((l) => l !== 'W')[0]).toBe('1');
  });

  it('returns undefined for an unknown session id', () => {
    expect(MODEL.detailFor(-1)).toBeUndefined();
  });
});
