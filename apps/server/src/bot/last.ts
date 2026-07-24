import { session1RM } from '@gym-tracker/core';
import {
  type SetRow,
  getExerciseById,
  listCatalogAndOwn,
  listHistorySetsForExercise,
} from '@gym-tracker/db';
import { type Bot, InlineKeyboard } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { matchExercise } from '../services/exercise-match';
import type { CustomContext } from './context';
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
  bot.command('last', async (ctx) => {
    const query = (ctx.match ?? '').toString().trim();
    if (!query) {
      await ctx.reply(T.lastUsage);
      return;
    }
    const pool = listCatalogAndOwn(db, ctx.user.id).map((e) => ({ id: e.id, name: e.name }));
    const match = matchExercise(query, pool);
    if (match.kind === 'none') {
      await ctx.reply(T.noMatch(query));
      return;
    }
    if (match.kind === 'ambiguous') {
      const kb = new InlineKeyboard();
      for (const candidate of match.candidates.slice(0, 8)) {
        kb.text(candidate.name, `last:${candidate.id}`).row();
      }
      await ctx.reply(T.lastAmbiguous, { reply_markup: kb });
      return;
    }
    await ctx.reply(renderLast(db, { userId: ctx.user.id, exerciseId: match.exercise.id, timezone: config.timezone }));
  });

  bot.callbackQuery(/^last:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      renderLast(db, { userId: ctx.user.id, exerciseId: Number(ctx.match[1]), timezone: config.timezone }),
    );
  });
}
