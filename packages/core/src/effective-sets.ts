export function effectiveSets<T extends { isWarmup: boolean }>(sets: readonly T[]): T[] {
  return sets.filter((set) => !set.isWarmup);
}
