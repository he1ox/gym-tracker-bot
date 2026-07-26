import { MUSCLE_GROUPS, type MuscleGroup, isoWeekKey, startOfLocalDay } from '@gym-tracker/core';

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

const MS_PER_DAY = 86_400_000;

// Día de la semana EN LA ZONA del usuario, 0 = lunes. Se lee la fecha local y se
// reconstruye como UTC para preguntar por el día: `new Date(ms).getUTCDay()` sobre
// el instante crudo respondería por la fecha UTC, que puede ser otra.
function localWeekday(instant: number, timeZone: string): number {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(instant))
    .split('-')
    .map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Could not extract local date for timezone ${timeZone}`);
  }
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * Lunes y domingo (00:00 locales) de la semana ISO que contiene `now`. Solo se usa
 * para escribir el rango en el pie de la foto; el agrupamiento de series lo hace
 * `isoWeekKey`, no este rango.
 *
 * Cada extremo pasa por `startOfLocalDay` otra vez porque restar días de 24 h a una
 * medianoche local no cae en otra medianoche si hay cambio de horario por medio.
 */
export function isoWeekRange(now: number, timeZone: string): { fromMs: number; toMs: number } {
  const today = startOfLocalDay(new Date(now), timeZone);
  const monday = startOfLocalDay(new Date(today - localWeekday(now, timeZone) * MS_PER_DAY), timeZone);
  return { fromMs: monday, toMs: startOfLocalDay(new Date(monday + 6 * MS_PER_DAY), timeZone) };
}
