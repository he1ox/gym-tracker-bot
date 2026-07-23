import { effectiveSets } from './effective-sets';

export function estimate1RM(weightKg: number, reps: number): number {
  if (!(weightKg > 0)) {
    throw new Error(`weightKg must be positive, got ${weightKg}`);
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error(`reps must be a positive integer, got ${reps}`);
  }
  // A single already is a real one-rep max; Epley would overestimate it by 3.3%.
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export function session1RM(
  sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>,
): number | undefined {
  const effective = effectiveSets(sets);
  if (effective.length === 0) {
    return undefined;
  }
  return Math.max(...effective.map((set) => estimate1RM(set.weightKg, set.reps)));
}
