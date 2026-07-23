import { session1RM } from './one-rep-max';

export interface PersonalRecord {
  estimated1RM: number;
  previous1RM?: number;
}

export function detectPersonalRecord(
  historySets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>,
  sessionSets: ReadonlyArray<{ weightKg: number; reps: number; isWarmup: boolean }>,
): PersonalRecord | undefined {
  const sessionBest = session1RM(sessionSets);
  if (sessionBest === undefined) {
    return undefined;
  }
  const previous = session1RM(historySets);
  if (previous === undefined) {
    return { estimated1RM: sessionBest };
  }
  return sessionBest > previous ? { estimated1RM: sessionBest, previous1RM: previous } : undefined;
}
