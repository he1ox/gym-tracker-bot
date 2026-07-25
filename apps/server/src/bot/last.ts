import { session1RM } from '@gym-tracker/core';
import {
  type SetRow,
  getExerciseById,
  listCatalogAndOwn,
  listExercisesByMuscleGroup,
  listHistorySetsForExercise,
} from '@gym-tracker/db';
import { type Bot, InlineKeyboard } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { matchExercise } from '../services/exercise-match';
import { parseCallback } from './callback-data';
import type { CustomContext } from './context';
import { type PickerState, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
import { format1RM, formatSet } from './session-view';
import { T } from './texts';

function localDate(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(epochMs),
  );
}

export function renderLast(
  db: DatabaseSync,
  params: { userId: number; exerciseId: number; timezone: string },
): string {
  const exercise = getExerciseById(db, params.exerciseId);
  const name = exercise?.name ?? '';
  // excludeWorkoutId: 0 no excluye ninguno (ningún workout tiene id 0) → todo el histórico.
  const sets = listHistorySetsForExercise(db, {
    userId: params.userId,
    exerciseId: params.exerciseId,
    excludeWorkoutId: 0,
  });
  if (sets.length === 0) {
    return T.lastNoHistory(name);
  }

  const byWorkout = new Map<number, SetRow[]>();
  for (const set of sets) {
    const bucket = byWorkout.get(set.workoutId);
    if (bucket) {
      bucket.push(set);
    } else {
      byWorkout.set(set.workoutId, [set]);
    }
  }
  const maxCreated = (rows: SetRow[]): number => Math.max(...rows.map((r) => r.createdAt));
  const sessions = [...byWorkout.values()].sort((a, b) => maxCreated(b) - maxCreated(a)).slice(0, 3);

  const lines = [T.lastHeader(name)];
  for (const rows of sessions) {
    const effective = rows.filter((r) => !r.isWarmup);
    const label = effective
      .map((r) => `${formatSet({ weightKg: r.weightKg, reps: r.reps })}${r.rpe !== null ? ` RPE${r.rpe}` : ''}`)
      .join(' · ');
    lines.push(`${localDate(maxCreated(rows), params.timezone)}: ${label}`);
  }
  const best = session1RM(sets);
  if (best !== undefined) {
    lines.push(T.lastBest(format1RM(best)));
  }
  return lines.join('\n');
}

export function registerLast(bot: Bot<CustomContext>, db: DatabaseSync, config: { timezone: string }): void {
  const groupsView = (userId: number) =>
    renderPicker({ view: 'groups' }, 'l', listExercisesByMuscleGroup(db, userId));

  bot.command('last', async (ctx) => {
    const query = (ctx.match ?? '').toString().trim();
    if (!query) {
      // Sin argumentos: menú navegable en lugar del texto de ayuda.
      const { text, keyboard } = groupsView(ctx.user.id);
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
    const pool = listCatalogAndOwn(db, ctx.user.id).map((e) => ({ id: e.id, name: e.name }));
    const match = matchExercise(query, pool);
    if (match.kind === 'none') {
      const { text, keyboard } = renderNoMatch(query, 'l');
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
    if (match.kind === 'ambiguous') {
      const { text, keyboard } = renderCandidates(match.candidates, 'l');
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
    await ctx.reply(renderLast(db, { userId: ctx.user.id, exerciseId: match.exercise.id, timezone: config.timezone }));
  });

  // Solo el origen 'l': los pick:c: son de la captura y deben llegar al catch-all
  // de capture.ts, que se registra después de este handler en bot.ts.
  bot.callbackQuery(/^pick:l:/, async (ctx) => {
    const action = parseCallback(ctx.callbackQuery.data ?? '');
    const userId = ctx.user.id;

    if (action.type === 'pick_search') {
      // /last no registra un listener de texto libre: pedir que escriba aquí
      // dejaría el nombre cayendo en el handler de captura (y, con una sesión
      // activa, cambiando de ejercicio en un entrenamiento en curso). En vez de
      // eso avisamos de la sintaxis que sí funciona.
      await ctx.answerCallbackQuery(T.lastSearchToast);
      return;
    }
    if (action.type === 'pick_groups' || action.type === 'pick_group') {
      const state: PickerState =
        action.type === 'pick_groups'
          ? { view: 'groups' }
          : { view: 'group', groupIndex: action.groupIndex, offset: action.offset };
      const { text, keyboard } = renderPicker(state, 'l', listExercisesByMuscleGroup(db, userId));
      await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => {});
      await ctx.answerCallbackQuery();
      return;
    }
    if (action.type === 'pick_exercise') {
      const exercise = getExerciseById(db, action.exerciseId);
      if (!exercise || exercise.archived) {
        await ctx.answerCallbackQuery(T.exerciseGoneToast);
        const { text, keyboard } = groupsView(userId);
        await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => {});
        return;
      }
      const text = renderLast(db, { userId, exerciseId: action.exerciseId, timezone: config.timezone });
      await ctx.editMessageText(text, { reply_markup: new InlineKeyboard() }).catch(() => {});
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.answerCallbackQuery();
  });
}
