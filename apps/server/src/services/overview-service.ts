import { type Overview, buildOverview, isoWeekKey, startOfLocalDay } from '@gym-tracker/core';
import { listEffectiveSetsBetween, listWorkoutStartsBetween } from '@gym-tracker/db';
import type { DatabaseSync } from 'node:sqlite';
import { type GroupVolume, weeklyGroupCounts } from './weekly-volume';

const MS_PER_DAY = 86_400_000;
const WINDOW_DAYS = 30;

export interface UserSummary {
  overview: Overview;
  /** Series efectivas por músculo de la semana ISO en curso, de más a menos. */
  weeklyVolume: GroupVolume[];
}

/**
 * Resumen de los 30 días que terminan hoy frente a los 30 anteriores (spec §3).
 *
 * La ventana se ancla al INICIO DEL DÍA LOCAL, no a la hora exacta: así el resumen
 * no cambia entre serie y serie. `currentTo` sí es `now`, porque nada puede haberse
 * registrado en el futuro.
 *
 * Restar días de 24 h a una medianoche local no cae exactamente en otra medianoche
 * si hay un cambio de horario por medio (será 23:00 o 01:00). Es lo que pide el
 * spec §8.2 y la desviación de una hora sobre una ventana de 30 días no cambia
 * ninguna cifra de forma perceptible.
 *
 * Una sola ida a la base de datos por consulta, sobre los 60 días completos:
 * `buildOverview` hace el reparto entre ventanas en memoria.
 *
 * Esa misma consulta de 60 días también sirve para el volumen semanal: la semana
 * ISO en curso cae siempre dentro de la ventana, así que `weeklyGroupCounts` se
 * calcula en memoria a partir de las mismas filas, sin una segunda ida a la base.
 */
export function buildUserSummary(
  db: DatabaseSync,
  params: { userId: number; timezone: string; now: number },
): UserSummary {
  const currentTo = params.now;
  const currentFrom =
    startOfLocalDay(new Date(params.now), params.timezone) - (WINDOW_DAYS - 1) * MS_PER_DAY;
  const previousFrom = currentFrom - WINDOW_DAYS * MS_PER_DAY;

  const range = { userId: params.userId, fromMs: previousFrom, toMs: currentTo };
  // UNA sola consulta para las dos cosas: la semana ISO en curso cae dentro de la
  // ventana de 60 días, así que el volumen semanal no necesita ir a la base otra vez.
  const sets = listEffectiveSetsBetween(db, range);

  return {
    overview: buildOverview({
      sets,
      workoutStarts: listWorkoutStartsBetween(db, range),
      currentFrom,
      currentTo,
      previousFrom,
    }),
    weeklyVolume: weeklyGroupCounts(sets, {
      weekKey: isoWeekKey(new Date(params.now), params.timezone),
      timeZone: params.timezone,
    }),
  };
}
