import { MUSCLE_GROUPS, type MuscleGroup, isoWeekKey } from '@gym-tracker/core';

export interface GroupVolume {
  group: MuscleGroup;
  count: number;
}

/**
 * Series efectivas por grupo muscular dentro de una semana ISO.
 *
 * Recibe únicamente series EFECTIVAS: el filtro de calentamiento lo hace la
 * consulta (`listEffectiveSetsBetween`), igual que en `buildOverview`.
 *
 * No usa `weeklyVolumeByMuscleGroup` de core a propósito: esa función resuelve el
 * grupo con un mapa `exerciseId → muscle_group` y lanza si falta una clave (el caso
 * del ejercicio archivado). Aquí el grupo viene en la propia fila, del JOIN.
 */
export function weeklyGroupCounts(
  sets: ReadonlyArray<{ createdAt: number; muscleGroup: MuscleGroup }>,
  options: { weekKey: string; timeZone: string },
): GroupVolume[] {
  const counts = new Map<MuscleGroup, number>();
  for (const set of sets) {
    if (isoWeekKey(new Date(set.createdAt), options.timeZone) !== options.weekKey) {
      continue;
    }
    counts.set(set.muscleGroup, (counts.get(set.muscleGroup) ?? 0) + 1);
  }
  // Desempate por el orden anatómico de MUSCLE_GROUPS: sin él, dos grupos con la
  // misma cuenta saldrían en el orden de llegada de las filas y la pantalla
  // bailaría entre renders.
  const anatomical = (group: MuscleGroup): number => MUSCLE_GROUPS.indexOf(group);
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || anatomical(a.group) - anatomical(b.group));
}
