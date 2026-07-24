import { effectiveSets } from './effective-sets';
import { estimate1RM } from './one-rep-max';
import { compareWeekKeys, isoWeekKey } from './weeks';

export interface StagnationOptions {
  timeZone: string;
  /** Semanas entrenadas sin superar el récord para considerar estancamiento. Default 3. */
  weeks?: number;
}

export type StagnationResult =
  | { stagnant: false }
  | {
      stagnant: true;
      recordWeekKey: string;
      record1RM: number;
      weeksWithoutImprovement: number;
      best1RMSinceRecord: number;
    };

export function detectStagnation(
  sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean; createdAt: Date }>,
  options: StagnationOptions,
): StagnationResult {
  const weeks = options.weeks ?? 3;
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new Error(`weeks must be a positive integer, got ${weeks}`);
  }

  const bestByWeek = new Map<string, number>();
  for (const set of effectiveSets(sets)) {
    const weekKey = isoWeekKey(set.createdAt, options.timeZone);
    const estimated = estimate1RM(set.weightKg, set.reps);
    const currentBest = bestByWeek.get(weekKey);
    if (currentBest === undefined || estimated > currentBest) {
      bestByWeek.set(weekKey, estimated);
    }
  }
  if (bestByWeek.size === 0) {
    return { stagnant: false };
  }

  const orderedWeeks = [...bestByWeek.entries()].sort(([a], [b]) => compareWeekKeys(a, b));

  // Con comparación estricta (>), los empates conservan la semana más antigua:
  // la "semana del récord" es la PRIMERA que alcanzó el máximo histórico.
  let recordWeekKey = '';
  let record1RM = 0;
  for (const [weekKey, best] of orderedWeeks) {
    if (best > record1RM) {
      record1RM = best;
      recordWeekKey = weekKey;
    }
  }

  const weeksAfterRecord = orderedWeeks.filter(([weekKey]) => compareWeekKeys(weekKey, recordWeekKey) > 0);
  if (weeksAfterRecord.length < weeks) {
    return { stagnant: false };
  }

  // record1RM es el máximo global, así que ninguna semana posterior pudo superarlo:
  // basta con contar cuántas semanas entrenadas hay después del récord.
  let best1RMSinceRecord = 0;
  for (const [, best] of weeksAfterRecord) {
    if (best > best1RMSinceRecord) {
      best1RMSinceRecord = best;
    }
  }
  return {
    stagnant: true,
    recordWeekKey,
    record1RM,
    weeksWithoutImprovement: weeksAfterRecord.length,
    best1RMSinceRecord,
  };
}
