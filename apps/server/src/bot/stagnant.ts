import { detectStagnation, isoWeekKey } from '@gym-tracker/core';
import { getExerciseById, listEffectiveSetsForUser } from '@gym-tracker/db';
import type { Bot } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { displayName } from '../i18n/exercise-name';
import type { CustomContext } from './context';
import { format1RM } from './session-view';
import { T } from './texts';

/** El default de `detectStagnation`; aquí se usa además para el estado vacío. */
const STAGNATION_WEEKS = 3;

interface StalledRow {
  name: string;
  weeks: number;
  record1RM: number;
  recordWeekKey: string;
  best1RMSinceRecord: number;
}

/**
 * Ejercicios cuyo mejor 1RM estimado no supera su máximo previo en tres o más
 * semanas entrenadas (SPEC §5).
 *
 * Los ejercicios de peso corporal ENTRAN en la lista, y es una inconsistencia
 * consciente con el dashboard, que los excluye mediante un `isBodyweight` que solo
 * existe en sus tipos mock: la tabla `exercises` no tiene esa columna. Añadirla es
 * una migración y queda fuera de este alcance; para las dominadas con lastre el
 * dato incluso es útil. Se revisa cuando el peso corporal sea un campo almacenado.
 */
export function renderStagnant(
  db: DatabaseSync,
  params: { userId: number; timezone: string },
): string {
  const byExercise = new Map<number, Array<{ weightKg: number; reps: number; isWarmup: boolean; createdAt: Date }>>();
  for (const row of listEffectiveSetsForUser(db, params.userId)) {
    const entry = { weightKg: row.weightKg, reps: row.reps, isWarmup: false, createdAt: new Date(row.createdAt) };
    const bucket = byExercise.get(row.exerciseId);
    if (bucket) {
      bucket.push(entry);
    } else {
      byExercise.set(row.exerciseId, [entry]);
    }
  }

  const stalled: StalledRow[] = [];
  let mostWeeksTrained = 0;
  for (const [exerciseId, sets] of byExercise) {
    // A diferencia de /last, que toca un ejercicio, esto los recorre todos: una
    // excepción en el histórico de cualquiera se llevaría el comando entero.
    try {
      const weeks = new Set(sets.map((set) => isoWeekKey(set.createdAt, params.timezone)));
      mostWeeksTrained = Math.max(mostWeeksTrained, weeks.size);

      const result = detectStagnation(sets, { timeZone: params.timezone });
      if (!result.stagnant) {
        continue;
      }
      const exercise = getExerciseById(db, exerciseId);
      if (!exercise) {
        continue;
      }
      stalled.push({
        // getExerciseById no filtra por `archived`: un ejercicio archivado con
        // histórico sigue teniendo nombre y sigue contando.
        name: displayName(exercise),
        weeks: result.weeksWithoutImprovement,
        record1RM: result.record1RM,
        recordWeekKey: result.recordWeekKey,
        best1RMSinceRecord: result.best1RMSinceRecord,
      });
    } catch (error) {
      console.error(`[stagnant] skipping exercise ${exerciseId}:`, error);
    }
  }

  if (stalled.length === 0) {
    // Dos estados vacíos con textos distintos, porque significan cosas distintas:
    // «no hay nada estancado» y «aún no hay semanas entrenadas suficientes».
    return mostWeeksTrained > STAGNATION_WEEKS ? T.stagnantNone : T.stagnantNotEnough;
  }

  stalled.sort((a, b) => b.weeks - a.weeks || a.name.localeCompare(b.name));
  return [
    T.stagnantHeader,
    ...stalled.map((row) =>
      T.stagnantLine({
        name: row.name,
        weeks: row.weeks,
        record: format1RM(row.record1RM),
        week: row.recordWeekKey,
        since: format1RM(row.best1RMSinceRecord),
      }),
    ),
  ].join('\n');
}

export function registerStagnant(
  bot: Bot<CustomContext>,
  db: DatabaseSync,
  config: { timezone: string },
): void {
  // Mensaje NUEVO, como /help: funciona con un entrenamiento en curso y no debe
  // tocar el mensaje activo de la sesión (SPEC §6).
  bot.command('stagnant', async (ctx) => {
    await ctx.reply(renderStagnant(db, { userId: ctx.user.id, timezone: config.timezone }));
  });
}
