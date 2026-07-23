import { effectiveSets } from './effective-sets';

export function setTonnage(set: { weightKg: number; reps: number }): number {
  return set.weightKg * set.reps;
}

export function sessionTonnage(
  sets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>,
): number {
  return effectiveSets(sets).reduce((sum, set) => sum + setTonnage(set), 0);
}
