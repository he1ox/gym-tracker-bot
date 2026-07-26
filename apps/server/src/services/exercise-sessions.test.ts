import { describe, expect, it } from 'vitest';
import { sessionSeries } from './exercise-sessions';

const set = (workoutId: number, weightKg: number, reps: number, createdAt: number, isWarmup = false) => ({
  id: createdAt,
  workoutId,
  exerciseId: 1,
  position: 1,
  weightKg,
  reps,
  rpe: null,
  restSeconds: null,
  isWarmup,
  createdAt,
});

describe('sessionSeries', () => {
  it('da un punto por sesión, con el mejor 1RM y ordenado por fecha', () => {
    const points = sessionSeries([
      set(2, 70, 5, 2_000),
      set(1, 60, 8, 1_000),
      set(1, 62.5, 6, 1_100),
    ]);
    expect(points.map((p) => p.at)).toEqual([1_100, 2_000]);
    expect(points[0]?.best1RM).toBeCloseTo(76, 5); // 60 × (1 + 8/30) = best of the two sets
    expect(points[1]?.best1RM).toBeCloseTo(81.666, 2);
  });

  it('marca como récord solo las sesiones que superan a todas las anteriores', () => {
    const points = sessionSeries([
      set(1, 60, 5, 1_000),
      set(2, 55, 5, 2_000),
      set(3, 65, 5, 3_000),
      set(4, 65, 5, 4_000), // empate: no es récord
    ]);
    expect(points.map((p) => p.isRecord)).toEqual([true, false, true, false]);
  });

  it('ignora las series de calentamiento y las sesiones que solo tienen calentamiento', () => {
    const points = sessionSeries([
      set(1, 100, 5, 1_000, true),
      set(2, 60, 5, 2_000),
      set(2, 100, 5, 2_100, true),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]?.best1RM).toBeCloseTo(70, 5);
  });

  it('no devuelve nada sin series', () => {
    expect(sessionSeries([])).toEqual([]);
  });
});
