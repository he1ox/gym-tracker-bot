import { detectStagnation, session1RM } from '@gym-tracker/core';
import {
  type SetRow,
  getExerciseById,
  listCatalogAndOwn,
  listExercisesByMuscleGroup,
  listHistorySetsForExercise,
} from '@gym-tracker/db';
import { type Bot, InlineKeyboard, InputFile } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { exercise1RMChart } from '../charts/exercise-1rm';
import { renderChart } from '../charts/render';
import { currentLocale, unitLabel } from '../i18n/current';
import { displayName, localizeGroups } from '../i18n/exercise-name';
import { matchExercise } from '../services/exercise-match';
import { sessionSeries } from '../services/exercise-sessions';
import { CB, parseCallback } from './callback-data';
import type { CustomContext } from './context';
import { type PickerState, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
import { format1RM, formatSet } from './session-view';
import { T } from './texts';

// El idioma activo, no un 'es-ES' fijo: el eje de fechas de la gráfica y estas
// líneas tienen que hablar el idioma del usuario.
function localDate(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(epochMs));
}

export interface LastDetail {
  text: string;
  /** Sesiones con al menos una serie efectiva: con menos de dos no hay gráfica. */
  sessions: number;
}

export function renderLast(
  db: DatabaseSync,
  params: { userId: number; exerciseId: number; timezone: string },
): LastDetail {
  const exercise = getExerciseById(db, params.exerciseId);
  const name = exercise ? displayName(exercise) : '';
  // excludeWorkoutId: 0 no excluye ninguno (ningún workout tiene id 0) → todo el histórico.
  const sets = listHistorySetsForExercise(db, {
    userId: params.userId,
    exerciseId: params.exerciseId,
    excludeWorkoutId: 0,
  });
  if (sets.length === 0) {
    return { text: T.lastNoHistory(name), sessions: 0 };
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

  // El histórico completo ya está cargado: es exactamente lo que detectStagnation
  // necesita, así que el insight más valioso del producto (SPEC §5) no cuesta ni
  // una consulta más y aparece cuando el usuario decide el peso de hoy.
  //
  // detectStagnation espera createdAt: Date, pero SetRow.createdAt es epoch ms:
  // se mapea aquí, respetando el isWarmup real de cada serie (detectStagnation
  // aplica su propio effectiveSets() sobre lo que le pasemos).
  const stagnation = detectStagnation(
    sets.map((row) => ({ weightKg: row.weightKg, reps: row.reps, isWarmup: row.isWarmup, createdAt: new Date(row.createdAt) })),
    { timeZone: params.timezone },
  );
  if (stagnation.stagnant) {
    lines.push(T.lastStagnant(stagnation.weeksWithoutImprovement, format1RM(stagnation.record1RM)));
  }

  return { text: lines.join('\n'), sessions: sessionSeries(sets).length };
}

/** Una línea de un solo punto no informa de nada: sin dos sesiones, sin botón. */
function detailKeyboard(exerciseId: number, detail: LastDetail): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (detail.sessions >= 2) {
    keyboard.text(T.lastChartButton, CB.chart(exerciseId));
  }
  return keyboard;
}

export function registerLast(bot: Bot<CustomContext>, db: DatabaseSync, config: { timezone: string }): void {
  const groupsView = (userId: number) =>
    renderPicker({ view: 'groups' }, 'l', localizeGroups(listExercisesByMuscleGroup(db, userId)));

  bot.command('last', async (ctx) => {
    const query = (ctx.match ?? '').toString().trim();
    if (!query) {
      // Sin argumentos: menú navegable en lugar del texto de ayuda.
      const { text, keyboard } = groupsView(ctx.user.id);
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
    const pool = listCatalogAndOwn(db, ctx.user.id).map((e) => ({ id: e.id, name: e.name, nameKey: e.nameKey }));
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
    const detail = renderLast(db, { userId: ctx.user.id, exerciseId: match.exercise.id, timezone: config.timezone });
    await ctx.reply(detail.text, { reply_markup: detailKeyboard(match.exercise.id, detail) });
  });

  // Handler de la gráfica de /last. Se registra ANTES que
  // bot.callbackQuery(/^pick:l:/, ...) porque, dentro de registerLast, el orden
  // relativo entre estos dos no importa (ninguno hace de catch-all del otro),
  // pero sí importa que ambos vayan antes del catch-all de capture.ts.
  bot.callbackQuery(/^ch:\d+$/, async (ctx) => {
    // Antes de renderizar: entre la pulsación y la foto hay render y subida, y sin
    // esto la ruedita del botón gira hasta que acabe todo.
    await ctx.answerCallbackQuery();
    const exerciseId = Number((ctx.callbackQuery.data ?? '').slice('ch:'.length));
    const exercise = getExerciseById(db, exerciseId);
    if (!exercise) {
      return;
    }
    await ctx.replyWithChatAction('upload_photo').catch(() => {});

    const sets = listHistorySetsForExercise(db, { userId: ctx.user.id, exerciseId, excludeWorkoutId: 0 });
    const points = sessionSeries(sets);
    const buffer = await renderChart(
      exercise1RMChart(points, {
        locale: currentLocale(),
        timeZone: config.timezone,
        unit: unitLabel(),
      }),
    );
    if (buffer === null) {
      return; // el detalle se queda como está; ninguna foto, ningún error visible
    }
    const best = session1RM(sets);
    try {
      await ctx.replyWithPhoto(new InputFile(buffer, 'exercise-1rm.png'), {
        caption: T.chartExerciseCaption(displayName(exercise), format1RM(best ?? 0)),
      });
    } catch (error) {
      // El envío a Telegram puede fallar (red, chat bloqueado, payload rechazado)
      // aunque el render haya ido bien. La ruedita ya se apagó y el detalle sigue
      // intacto: este fallo no debe llegar al usuario como error genérico.
      console.error('[last-chart] sendPhoto failed:', error);
    }
    // Acción de un solo uso sobre una pantalla transitoria: el estado "detalle sin
    // botones" es el mismo con el que se pintaba antes de esta tarea.
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
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
      const { text, keyboard } = renderPicker(state, 'l', localizeGroups(listExercisesByMuscleGroup(db, userId)));
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
      const detail = renderLast(db, { userId, exerciseId: action.exerciseId, timezone: config.timezone });
      await ctx
        .editMessageText(detail.text, { reply_markup: detailKeyboard(action.exerciseId, detail) })
        .catch(() => {});
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.answerCallbackQuery();
  });
}
