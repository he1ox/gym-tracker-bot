import { effectiveSets } from './effective-sets';
import type { MuscleGroup } from './types';
import { isoWeekKey } from './weeks';

export function weeklyVolumeByMuscleGroup(
  sets: ReadonlyArray<{ exerciseId: number; isWarmup: boolean; createdAt: Date }>,
  muscleGroupByExerciseId: ReadonlyMap<number, MuscleGroup>,
  options: { weekKey: string; timeZone: string },
): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>();
  for (const set of effectiveSets(sets)) {
    if (isoWeekKey(set.createdAt, options.timeZone) !== options.weekKey) {
      continue;
    }
    const group = muscleGroupByExerciseId.get(set.exerciseId);
    if (group === undefined) {
      throw new Error(`Unknown exerciseId ${set.exerciseId} in muscleGroupByExerciseId map`);
    }
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}

/** Series efectivas por grupo muscular y semana que persigue el SPEC §8.1. */
export const VOLUME_TARGET_MIN = 10;
export const VOLUME_TARGET_MAX = 20;

/** SPEC §8.1: la cuenta semanal de un grupo muscular debe caer en la banda 10-20. */
export function isVolumeInBand(count: number): boolean {
  return count >= VOLUME_TARGET_MIN && count <= VOLUME_TARGET_MAX;
}
