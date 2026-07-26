import { beforeAll, describe, expect, it } from 'vitest';
import { setCurrent } from '../i18n/current';
import { initI18n } from '../i18n/index';
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

const accented = [
  { id: 10, name: 'Jalón al pecho en polea' },
  { id: 11, name: 'Extensión de tríceps en polea' },
  { id: 12, name: 'Elevaciones laterales en polea' },
];

describe('matchExercise — accents and multi-term queries', () => {
  it('matches a query typed without accents', () => {
    expect(matchExercise('jalon', accented)).toEqual({ kind: 'unique', exercise: accented[0] });
  });

  it('matches an accented query against an accented name', () => {
    expect(matchExercise('jalón', accented)).toEqual({ kind: 'unique', exercise: accented[0] });
  });

  it('matches all terms in any order', () => {
    expect(matchExercise('polea triceps', accented)).toEqual({ kind: 'unique', exercise: accented[1] });
    expect(matchExercise('triceps polea', accented)).toEqual({ kind: 'unique', exercise: accented[1] });
  });

  it('returns every exercise whose name contains all the terms', () => {
    const r = matchExercise('polea', accented);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') {
      expect(r.candidates.map((c) => c.id)).toEqual([10, 11, 12]);
    }
  });

  it('requires every term, not just one', () => {
    expect(matchExercise('polea sentadilla', accented)).toEqual({ kind: 'none' });
  });

  it('still prefers an exact name over a broader term match', () => {
    const pool = [
      { id: 1, name: 'Remo' },
      { id: 2, name: 'Remo con barra' },
    ];
    expect(matchExercise('remo', pool)).toEqual({ kind: 'unique', exercise: pool[0] });
  });

  it('ignores accents and case when comparing the exact name', () => {
    expect(matchExercise('JALON AL PECHO EN POLEA', accented)).toEqual({
      kind: 'unique',
      exercise: accented[0],
    });
  });

  it('collapses runs of whitespace between terms', () => {
    expect(matchExercise('  polea   triceps  ', accented)).toEqual({ kind: 'unique', exercise: accented[1] });
  });

  it('encuentra por el nombre traducido y por el original', () => {
    initI18n();
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    const pool = [{ id: 1, name: 'Sentadilla con barra', nameKey: 'squat_barbell' }];
    expect(matchExercise('squat', pool)).toEqual({ kind: 'unique', exercise: pool[0] });
    // El usuario que lleva meses escribiendo "sentadilla" no debe perder el atajo.
    expect(matchExercise('sentadilla', pool)).toEqual({ kind: 'unique', exercise: pool[0] });
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
  });
});
