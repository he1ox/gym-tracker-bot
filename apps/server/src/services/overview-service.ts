import { type Overview, buildOverview, startOfLocalDay } from '@gym-tracker/core';
import { listEffectiveSetsBetween, listWorkoutStartsBetween } from '@gym-tracker/db';
import type { DatabaseSync } from 'node:sqlite';

const MS_PER_DAY = 86_400_000;
const WINDOW_DAYS = 30;

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
 */
export function buildUserOverview(
  db: DatabaseSync,
  params: { userId: number; timezone: string; now: number },
): Overview {
  const currentTo = params.now;
  const currentFrom =
    startOfLocalDay(new Date(params.now), params.timezone) - (WINDOW_DAYS - 1) * MS_PER_DAY;
  const previousFrom = currentFrom - WINDOW_DAYS * MS_PER_DAY;

  const range = { userId: params.userId, fromMs: previousFrom, toMs: currentTo };
  return buildOverview({
    sets: listEffectiveSetsBetween(db, range),
    workoutStarts: listWorkoutStartsBetween(db, range),
    currentFrom,
    currentTo,
    previousFrom,
  });
}
