export type MatchResult<T> =
  | { kind: 'none' }
  | { kind: 'unique'; exercise: T }
  | { kind: 'ambiguous'; candidates: T[] };

// NFD separa la tilde del carácter base y \p{Diacritic} la borra: "Jalón" → "jalon".
// Nativo del motor de JS, sin dependencias.
const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export function matchExercise<T extends { name: string }>(
  query: string,
  exercises: readonly T[],
): MatchResult<T> {
  const q = normalize(query);
  if (q === '') {
    return { kind: 'none' };
  }
  // Un nombre completo idéntico gana sobre cualquier coincidencia parcial.
  const exact = exercises.filter((e) => normalize(e.name) === q);
  if (exact.length === 1) {
    return { kind: 'unique', exercise: exact[0] as T };
  }
  // Coincidencia por términos: todos los términos, como subcadena, en cualquier orden.
  const terms = q.split(' ');
  const matches = exercises.filter((e) => {
    const name = normalize(e.name);
    return terms.every((term) => name.includes(term));
  });
  if (matches.length === 0) {
    return { kind: 'none' };
  }
  if (matches.length === 1) {
    return { kind: 'unique', exercise: matches[0] as T };
  }
  return { kind: 'ambiguous', candidates: matches };
}
