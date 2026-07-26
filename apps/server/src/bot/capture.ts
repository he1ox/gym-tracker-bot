import { parseSetInput } from '@gym-tracker/core';
import {
  type BotSessionRow,
  getExerciseById,
  getRoutineDayById,
  getSession,
  getWorkoutById,
  listCatalogAndOwn,
  listExercisesByMuscleGroup,
  listRoutineExerciseDetails,
  updateSession,
} from '@gym-tracker/db';
import { type Api, type Bot, GrammyError, InlineKeyboard } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { weightStep } from '../i18n/current';
import { displayName, localizeGroups } from '../i18n/exercise-name';
import { matchExercise } from '../services/exercise-match';
import {
  adjustPending,
  buildSessionView as buildView,
  finishWorkout,
  recordSet,
  restTargetForCurrentExercise,
  startWorkout,
  switchExercise,
  toggleWarmup,
} from '../services/session-service';
import { parseCallback } from './callback-data';
import type { CustomContext } from './context';
import { type PickerState, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
import type { RestTimers } from './rest-timer';
import { renderFinishSummary, renderSession } from './session-view';
import { T, parseErrorText } from './texts';
import { sendWelcome } from './welcome';

function isNotModified(error: unknown): boolean {
  return error instanceof GrammyError && error.description.includes('message is not modified');
}

async function editOrSend(
  api: Api,
  db: DatabaseSync,
  session: BotSessionRow,
  text: string,
  keyboard: InlineKeyboard,
): Promise<void> {
  if (session.messageId !== null) {
    try {
      await api.editMessageText(session.chatId, session.messageId, text, { reply_markup: keyboard });
      return;
    } catch (error) {
      if (isNotModified(error)) {
        return;
      }
      // El mensaje activo ya no es editable (borrado/antiguo): enviamos uno nuevo.
    }
  }
  const sent = await api.sendMessage(session.chatId, text, { reply_markup: keyboard });
  updateSession(db, session.userId, { messageId: sent.message_id }, Date.now());
}

export async function renderActive(
  api: Api,
  db: DatabaseSync,
  session: BotSessionRow,
  restTimers: RestTimers,
): Promise<void> {
  const model = buildView(db, session);
  if (model.kind === 'in_exercise') {
    const seconds = restTimers.activeSeconds(session.userId);
    if (seconds !== undefined) {
      model.restTimer = { seconds };
    }
  }
  const { text, keyboard } = renderSession(model);
  await editOrSend(api, db, session, text, keyboard);
}

async function sendEphemeral(
  api: Api,
  db: DatabaseSync,
  session: BotSessionRow,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  if (session.ephemeralMessageId !== null) {
    await api.deleteMessage(session.chatId, session.ephemeralMessageId).catch(() => {});
  }
  const sent = await api.sendMessage(session.chatId, text, keyboard ? { reply_markup: keyboard } : {});
  updateSession(db, session.userId, { ephemeralMessageId: sent.message_id }, Date.now());
}

async function showPicker(
  api: Api,
  db: DatabaseSync,
  session: BotSessionRow,
  state: PickerState,
): Promise<void> {
  const { text, keyboard } = renderPicker(state, 'c', localizeGroups(listExercisesByMuscleGroup(db, session.userId)));
  await editOrSend(api, db, session, text, keyboard);
}

async function deletePreviousEphemeral(api: Api, session: BotSessionRow, messageId: number | null): Promise<void> {
  if (messageId !== null) {
    await api.deleteMessage(session.chatId, messageId).catch(() => {});
  }
}

function poolForMatching(
  db: DatabaseSync,
  session: BotSessionRow,
): Array<{ id: number; name: string; nameKey: string | null }> {
  if (session.currentExerciseId === null) {
    return listCatalogAndOwn(db, session.userId).map((e) => ({ id: e.id, name: e.name, nameKey: e.nameKey }));
  }
  const workout = getWorkoutById(db, session.workoutId);
  if (workout && workout.routineDayId !== null) {
    const day = listRoutineExerciseDetails(db, workout.routineDayId).map((d) => ({
      id: d.exerciseId,
      name: d.name,
      nameKey: d.nameKey,
    }));
    if (day.length > 0) {
      return day;
    }
  }
  return listCatalogAndOwn(db, session.userId).map((e) => ({ id: e.id, name: e.name, nameKey: e.nameKey }));
}

type Resolved =
  | { kind: 'unique'; id: number; name: string }
  | { kind: 'ambiguous'; candidates: Array<{ id: number; name: string; nameKey: string | null }> }
  | { kind: 'none' };

function resolveExerciseByName(db: DatabaseSync, session: BotSessionRow, query: string): Resolved {
  const result = matchExercise(query, poolForMatching(db, session));
  if (result.kind === 'unique') {
    // El nombre ya mostrado: el resto del flujo lo pinta tal cual.
    return { kind: 'unique', id: result.exercise.id, name: displayName(result.exercise) };
  }
  if (result.kind === 'ambiguous') {
    return { kind: 'ambiguous', candidates: result.candidates };
  }
  return { kind: 'none' };
}

async function doRecord(
  api: Api,
  db: DatabaseSync,
  restTimers: RestTimers,
  session: BotSessionRow,
  input: { weightKg: number; reps: number; rpe: number | null },
): Promise<void> {
  const wasWarmup = session.nextSetIsWarmup;
  const { previousEphemeralMessageId } = recordSet(db, {
    session,
    weightKg: input.weightKg,
    reps: input.reps,
    rpe: input.rpe,
    isWarmup: wasWarmup,
    now: Date.now(),
  });
  await deletePreviousEphemeral(api, session, previousEphemeralMessageId);
  if (!wasWarmup && session.currentExerciseId !== null) {
    const target = restTargetForCurrentExercise(db, session);
    if (target) {
      const exercise = getExerciseById(db, session.currentExerciseId);
      restTimers.schedule({
        userId: session.userId,
        chatId: session.chatId,
        seconds: target,
        exerciseName: exercise?.name ?? '',
      });
    }
  }
  const fresh = getSession(db, session.userId);
  if (fresh) {
    await renderActive(api, db, fresh, restTimers);
  }
}

async function handleStart(
  ctx: CustomContext,
  db: DatabaseSync,
  restTimers: RestTimers,
  timezone: string,
): Promise<void> {
  const existing = getSession(db, ctx.user.id);
  if (existing) {
    await renderActive(ctx.api, db, existing, restTimers); // reanudación (spec §4)
    return;
  }
  await sendWelcome(ctx, db, timezone);
}

async function handleFinish(ctx: CustomContext, db: DatabaseSync, restTimers: RestTimers): Promise<void> {
  const userId = ctx.user.id;
  const session = getSession(db, userId);
  if (!session) {
    await ctx.reply(T.noActiveSessionToast);
    return;
  }
  restTimers.cancel(userId);
  if (session.ephemeralMessageId !== null) {
    await ctx.api.deleteMessage(session.chatId, session.ephemeralMessageId).catch(() => {});
  }
  const summary = finishWorkout(db, { session, now: Date.now() });
  const text = renderFinishSummary(summary);
  if (session.messageId !== null) {
    try {
      await ctx.api.editMessageText(session.chatId, session.messageId, text, { reply_markup: new InlineKeyboard() });
      return;
    } catch (error) {
      if (isNotModified(error)) {
        return;
      }
    }
  }
  await ctx.api.sendMessage(session.chatId, text);
}

async function handleCallback(ctx: CustomContext, db: DatabaseSync, restTimers: RestTimers): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (data === undefined) {
    return;
  }
  const action = parseCallback(data);
  const userId = ctx.user.id;
  const now = Date.now();

  // Inicio de sesión: todavía no existe la fila bot_sessions.
  if (action.type === 'day' || action.type === 'free') {
    const active = getSession(db, userId);
    if (active) {
      // Se llega aquí desde una bienvenida antigua: /help → ‹ Volver → ▶️ Empezar
      // con un entreno a medias. Antes esto no hacía nada y dejaba un menú muerto.
      // Ahora el mensaje pulsado pasa a ser EL mensaje activo de la sesión y el
      // anterior se borra: un solo mensaje activo por sesión (SPEC §6).
      const pressed = ctx.callbackQuery?.message?.message_id ?? null;
      if (pressed !== null && pressed !== active.messageId) {
        if (active.messageId !== null) {
          await ctx.api.deleteMessage(active.chatId, active.messageId).catch(() => {});
        }
        updateSession(db, userId, { messageId: pressed }, now);
      }
      const resumed = getSession(db, userId);
      if (resumed) {
        await renderActive(ctx.api, db, resumed, restTimers);
      }
      await ctx.answerCallbackQuery();
      return;
    }
    let routineDayId: number | null = null;
    let dayNameSnapshot: string | null = null;
    if (action.type === 'day') {
      const day = getRoutineDayById(db, action.routineDayId);
      if (!day) {
        await ctx.answerCallbackQuery(T.genericError);
        return;
      }
      routineDayId = day.id;
      dayNameSnapshot = day.name;
    }
    const chatId = ctx.chat?.id ?? userId;
    startWorkout(db, { userId, chatId, routineDayId, dayNameSnapshot, now });
    updateSession(db, userId, { messageId: ctx.callbackQuery?.message?.message_id ?? null }, now);
    const session = getSession(db, userId);
    if (session) {
      await renderActive(ctx.api, db, session, restTimers);
    }
    await ctx.answerCallbackQuery();
    return;
  }

  const session = getSession(db, userId);
  if (!session) {
    await ctx.answerCallbackQuery(T.sessionEndedToast);
    return;
  }

  switch (action.type) {
    case 'ex': {
      // foreign_keys = ON: un id inexistente en switchExercise lanzaría un error FK.
      // Guardia simétrica a la de 'day' más arriba.
      if (!getExerciseById(db, action.exerciseId)) {
        await ctx.answerCallbackQuery(T.genericError);
        return;
      }
      switchExercise(db, { session, exerciseId: action.exerciseId, now });
      break;
    }
    case 'list':
      updateSession(db, userId, { currentExerciseId: null }, now);
      break;
    case 'add': {
      // "📂 Otro ejercicio" abre el menú de grupos en lugar de pedir que se escriba.
      updateSession(db, userId, { currentExerciseId: null }, now);
      const fresh = getSession(db, userId);
      if (fresh) {
        await showPicker(ctx.api, db, fresh, { view: 'groups' });
      }
      await ctx.answerCallbackQuery();
      return;
    }
    case 'pick_groups': {
      if (action.origin !== 'c') {
        await ctx.answerCallbackQuery();
        return;
      }
      // Entrar al menú de grupos es, igual que 'add', empezar a elegir ejercicio:
      // sin esto el texto sin serie válida que llegue después (p. ej. desde
      // 'pick_search') se interpretaría como peso×reps del ejercicio anterior.
      updateSession(db, userId, { currentExerciseId: null }, now);
      await showPicker(ctx.api, db, session, { view: 'groups' });
      await ctx.answerCallbackQuery();
      return;
    }
    case 'pick_group': {
      if (action.origin !== 'c') {
        await ctx.answerCallbackQuery();
        return;
      }
      await showPicker(ctx.api, db, session, {
        view: 'group',
        groupIndex: action.groupIndex,
        offset: action.offset,
      });
      await ctx.answerCallbackQuery();
      return;
    }
    case 'pick_exercise': {
      if (action.origin !== 'c') {
        await ctx.answerCallbackQuery();
        return;
      }
      // El ejercicio pudo archivarse entre pintar el menú y pulsarlo: avisamos y
      // repintamos en vez de fallar con un error de clave foránea.
      const exercise = getExerciseById(db, action.exerciseId);
      if (!exercise || exercise.archived) {
        await ctx.answerCallbackQuery(T.exerciseGoneToast);
        await showPicker(ctx.api, db, session, { view: 'groups' });
        return;
      }
      switchExercise(db, { session, exerciseId: action.exerciseId, now });
      break; // sigue al renderActive común del final
    }
    case 'pick_search': {
      if (action.origin !== 'c') {
        await ctx.answerCallbackQuery();
        return;
      }
      // Igual que 'pick_groups': entrar al modo búsqueda es elegir ejercicio, así
      // que el texto que escriba a continuación no debe parsearse como serie.
      updateSession(db, userId, { currentExerciseId: null }, now);
      await sendEphemeral(ctx.api, db, session, T.pickTypeName);
      await ctx.answerCallbackQuery();
      return;
    }
    case 'weight':
      adjustPending(db, { session, weightDelta: action.direction * weightStep(), now });
      break;
    case 'reps':
      adjustPending(db, { session, repsDelta: action.delta, now });
      break;
    case 'warmup':
      toggleWarmup(db, { session, now });
      break;
    case 'rec': {
      // recordSet lanza ValidationError si weightKg<=0 o reps<1, y el renderer solo
      // muestra el botón ↻ con weight>0 && reps>=1: un ↻ obsoleto pulsado tras ajustar
      // el pending a 0 no debe llegar a doRecord.
      const { currentExerciseId, pendingWeightKg: w, pendingReps: r } = session;
      if (currentExerciseId === null || w === null || r === null || w <= 0 || r < 1) {
        await ctx.answerCallbackQuery(T.needWeightAndReps);
        return;
      }
      await doRecord(ctx.api, db, restTimers, session, { weightKg: w, reps: r, rpe: null });
      await ctx.answerCallbackQuery();
      return;
    }
    case 'rest_cancel':
      restTimers.cancel(userId);
      break;
    default:
      await ctx.answerCallbackQuery();
      return;
  }

  const fresh = getSession(db, userId);
  if (fresh) {
    await renderActive(ctx.api, db, fresh, restTimers);
  }
  await ctx.answerCallbackQuery();
}

async function handleText(
  ctx: CustomContext,
  db: DatabaseSync,
  restTimers: RestTimers,
  next: () => Promise<void>,
): Promise<void> {
  const text = ctx.message?.text ?? '';
  if (text.startsWith('/')) {
    await next(); // deja pasar comandos (/routines, /last…)
    return;
  }
  const userId = ctx.user.id;
  const session = getSession(db, userId);
  if (!session) {
    await ctx.reply(T.noActiveSessionToast);
    return;
  }

  const parsed = parseSetInput(text);
  if (parsed.ok) {
    let current = session;
    if (parsed.value.exerciseName) {
      const matched = resolveExerciseByName(db, session, parsed.value.exerciseName);
      if (matched.kind === 'ambiguous') {
        const { text: candText, keyboard } = renderCandidates(matched.candidates, 'c');
        await editOrSend(ctx.api, db, session, candText, keyboard);
        return;
      }
      if (matched.kind === 'none') {
        const { text: noneText, keyboard } = renderNoMatch(parsed.value.exerciseName, 'c');
        await sendEphemeral(ctx.api, db, session, noneText, keyboard);
        return;
      }
      switchExercise(db, { session, exerciseId: matched.id, now: Date.now() });
      current = getSession(db, userId) ?? session;
    }
    if (current.currentExerciseId === null) {
      await sendEphemeral(ctx.api, db, current, T.chooseExercisePrompt);
      return;
    }
    await ctx.deleteMessage().catch(() => {}); // chat limpio
    await doRecord(ctx.api, db, restTimers, current, {
      weightKg: parsed.value.weightKg,
      reps: parsed.value.reps,
      rpe: parsed.value.rpe ?? null,
    });
    return;
  }

  // Texto sin serie válida: en estado "eligiendo ejercicio" se interpreta como búsqueda por nombre.
  if (session.currentExerciseId === null) {
    const matched = resolveExerciseByName(db, session, text);
    if (matched.kind === 'ambiguous') {
      const { text: candText, keyboard } = renderCandidates(matched.candidates, 'c');
      await ctx.deleteMessage().catch(() => {}); // chat limpio
      await editOrSend(ctx.api, db, session, candText, keyboard);
      return;
    }
    if (matched.kind === 'none') {
      const { text: noneText, keyboard } = renderNoMatch(text, 'c');
      await sendEphemeral(ctx.api, db, session, noneText, keyboard);
      return;
    }
    switchExercise(db, { session, exerciseId: matched.id, now: Date.now() });
    await ctx.deleteMessage().catch(() => {});
    const fresh = getSession(db, userId);
    if (fresh) {
      await renderActive(ctx.api, db, fresh, restTimers);
    }
    return;
  }

  await sendEphemeral(ctx.api, db, session, parseErrorText(parsed.reason));
}

export function registerCapture(
  bot: Bot<CustomContext>,
  db: DatabaseSync,
  config: { timezone: string },
  restTimers: RestTimers,
): void {
  bot.command('start', (ctx) => handleStart(ctx, db, restTimers, config.timezone));
  bot.command('finish', (ctx) => handleFinish(ctx, db, restTimers));
  bot.on('callback_query:data', (ctx) => handleCallback(ctx, db, restTimers));
  bot.on('message:text', (ctx, next) => handleText(ctx, db, restTimers, next));
}
