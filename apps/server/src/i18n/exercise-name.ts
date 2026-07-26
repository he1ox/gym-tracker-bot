import type { MuscleGroup } from '@gym-tracker/core';
import type { ExerciseOption } from '@gym-tracker/db';
import { t } from './current';

export interface Nameable {
  name: string;
  nameKey: string | null;
}

/**
 * Nombre a mostrar. Los del catálogo base tienen clave y se traducen; los que crea
 * el usuario (nameKey NULL) se muestran tal cual los escribió, en cualquier idioma.
 */
export function displayName(row: Nameable): string {
  return row.nameKey === null ? row.name : t(`exercise:${row.nameKey}`);
}

export function localizeOptions(options: readonly ExerciseOption[]): ExerciseOption[] {
  return options.map((option) => ({ ...option, name: displayName(option) }));
}

export function localizeGroups(
  byGroup: ReadonlyMap<MuscleGroup, readonly ExerciseOption[]>,
): Map<MuscleGroup, ExerciseOption[]> {
  const out = new Map<MuscleGroup, ExerciseOption[]>();
  for (const [group, options] of byGroup) {
    out.set(group, localizeOptions(options)); // conserva el orden de inserción
  }
  return out;
}

export const groupLabel = (group: MuscleGroup): string => t(`muscleGroup:${group}`);
