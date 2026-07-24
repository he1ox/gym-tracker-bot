export type MatchResult<T> =
  | { kind: 'none' }
  | { kind: 'unique'; exercise: T }
  | { kind: 'ambiguous'; candidates: T[] };

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function matchExercise<T extends { name: string }>(
  query: string,
  exercises: readonly T[],
): MatchResult<T> {
  const q = normalize(query);
  if (q === '') {
    return { kind: 'none' };
  }
  const exact = exercises.filter((e) => normalize(e.name) === q);
  if (exact.length === 1) {
    return { kind: 'unique', exercise: exact[0] as T };
  }
  const substring = exercises.filter((e) => normalize(e.name).includes(q));
  if (substring.length === 0) {
    return { kind: 'none' };
  }
  if (substring.length === 1) {
    return { kind: 'unique', exercise: substring[0] as T };
  }
  return { kind: 'ambiguous', candidates: substring };
}
