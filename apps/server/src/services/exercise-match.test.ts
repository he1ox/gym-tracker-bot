import { describe, expect, it } from 'vitest';
import { matchExercise } from './exercise-match';

const gym = [
  { id: 1, name: 'Press de banca con barra' },
  { id: 2, name: 'Press inclinado con barra' },
  { id: 3, name: 'Curl con barra' },
];

describe('matchExercise', () => {
  it('returns none when nothing matches', () => {
    expect(matchExercise('sentadilla', gym)).toEqual({ kind: 'none' });
  });

  it('returns the unique substring match, case-insensitively', () => {
    const r = matchExercise('INCLINADO', gym);
    expect(r).toEqual({ kind: 'unique', exercise: gym[1] });
  });

  it('returns ambiguous when several names contain the query', () => {
    const r = matchExercise('press', gym);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') {
      expect(r.candidates.map((c) => c.id)).toEqual([1, 2]);
    }
  });

  it('prefers an exact (case-insensitive) name over broader substring matches', () => {
    const r = matchExercise('curl con barra', gym);
    expect(r).toEqual({ kind: 'unique', exercise: gym[2] });
  });

  it('treats an empty query as no match', () => {
    expect(matchExercise('   ', gym)).toEqual({ kind: 'none' });
  });
});
