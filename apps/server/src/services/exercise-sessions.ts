import { session1RM } from '@gym-tracker/core';
import type { SetRow } from '@gym-tracker/db';

export interface SessionPoint {
  /** Instante de la última serie de la sesión: es la fecha que se pinta en el eje. */
  at: number;
  best1RM: number;
  isRecord: boolean;
}

/**
 * Mejor 1RM estimado de cada sesión de un ejercicio, de la más antigua a la más
 * reciente, con las sesiones récord marcadas.
 *
 * Récord = supera ESTRICTAMENTE a todas las anteriores, igual que
 * `detectStagnation`: en un empate gana la sesión más antigua.
 *
 * `session1RM` devuelve `undefined` si la sesión no tiene ninguna serie efectiva
 * (todo calentamiento): esa sesión no pinta punto.
 */
export function sessionSeries(sets: ReadonlyArray<SetRow>): SessionPoint[] {
  const byWorkout = new Map<number, SetRow[]>();
  for (const set of sets) {
    const bucket = byWorkout.get(set.workoutId);
    if (bucket) {
      bucket.push(set);
    } else {
      byWorkout.set(set.workoutId, [set]);
    }
  }

  const points: Array<{ at: number; best1RM: number }> = [];
  for (const rows of byWorkout.values()) {
    const best = session1RM(rows);
    if (best === undefined) {
      continue;
    }
    points.push({ at: Math.max(...rows.map((row) => row.createdAt)), best1RM: best });
  }
  points.sort((a, b) => a.at - b.at);

  let historicalBest = 0;
  return points.map((point) => {
    const isRecord = point.best1RM > historicalBest;
    if (isRecord) {
      historicalBest = point.best1RM;
    }
    return { ...point, isRecord };
  });
}
