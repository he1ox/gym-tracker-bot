export function deriveRestSeconds(
  sets: ReadonlyArray<{ position: number; createdAt: Date }>,
): Array<number | undefined> {
  const ordered = [...sets].sort((a, b) => a.position - b.position);
  return ordered.map((set, index) => {
    const previous = ordered[index - 1];
    if (previous === undefined) {
      return undefined;
    }
    return Math.round((set.createdAt.getTime() - previous.createdAt.getTime()) / 1000);
  });
}
