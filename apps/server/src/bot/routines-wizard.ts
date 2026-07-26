import { MUSCLE_GROUPS, type MuscleGroup } from '@gym-tracker/core';
import {
  addRoutineExercise,
  createCustomExercise,
  createRoutine,
  createRoutineDay,
  getExerciseById,
  listCatalogAndOwn,
  listExercisesByMuscleGroup,
  listRoutines,
  setActiveRoutine,
} from '@gym-tracker/db';
import { type Conversation, conversations, createConversation } from '@grammyjs/conversations';
import { type Bot, type Context, InlineKeyboard } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { groupLabel, localizeGroups } from '../i18n/exercise-name';
import { matchExercise } from '../services/exercise-match';
import { CB, parseCallback } from './callback-data';
import type { CustomContext } from './context';
import { type PickerState, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
import { T } from './texts';

// OC=CustomContext (contexto exterior, con `.user` ya autenticado por `auth`, accesible
// vía `conversation.external`); C=Context (segundo parámetro, por defecto): los contextos
// que el motor de replay rehidrata dentro de la conversación NUNCA llevan `.user` ni
// `.conversation` instalados (no pasan por los middlewares exteriores), así que se tipan
// como el `Context` base de grammY, no como `CustomContext`.
type WizardConversation = Conversation<CustomContext>;

// Objetivos "4 6-10 90" → { sets, repsMin, repsMax, rest }. Cualquier parte ausente → null.
function parseTargets(input: string): {
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  rest: number | null;
} {
  const parts = input.trim().split(/\s+/);
  const sets = parts[0] && /^\d+$/.test(parts[0]) ? Number(parts[0]) : null;
  let repsMin: number | null = null;
  let repsMax: number | null = null;
  const range = parts[1]?.match(/^(\d+)-(\d+)$/);
  if (range) {
    repsMin = Number(range[1]);
    repsMax = Number(range[2]);
  }
  const rest = parts[2] && /^\d+$/.test(parts[2]) ? Number(parts[2]) : null;
  return { sets, repsMin, repsMax, rest };
}

function makeWizard(db: DatabaseSync) {
  return async function routineWizard(conversation: WizardConversation, ctx: Context): Promise<void> {
    // El closure recibe el ctx EXTERIOR (ya autenticado por `auth`), distinto del `ctx`
    // interior de esta función (rehidratado por el motor de replay, sin `.user`).
    const userId = await conversation.external((outerCtx) => outerCtx.user.id);

    await ctx.reply(T.routineAskName);
    const nameCtx = await conversation.waitFor('message:text');
    const name = nameCtx.message.text.trim();
    const routine = await conversation.external(() =>
      createRoutine(db, { userId, name, createdAt: Date.now() }),
    );

    let position = 1;
    let dayCount = 0;
    for (;;) {
      await ctx.reply(T.routineAskDay, {
        reply_markup: new InlineKeyboard().text(T.doneButton, 'wizard:done'),
      });
      const dayResp = await conversation.wait();
      if (dayResp.callbackQuery?.data === 'wizard:done') {
        await dayResp.answerCallbackQuery();
        if (dayCount > 0) {
          break;
        }
        await ctx.reply(T.routineNeedOneDay);
        continue;
      }
      const dayName = dayResp.message?.text?.trim();
      if (!dayName) {
        continue;
      }
      const day = await conversation.external(() =>
        createRoutineDay(db, { routineId: routine.id, name: dayName, position }),
      );
      position += 1;
      dayCount += 1;
      await addExercisesToDay(conversation, ctx, db, userId, day.id);
    }

    await conversation.external(() => {
      if (listRoutines(db, userId).every((r) => !r.isActive)) {
        setActiveRoutine(db, { userId, routineId: routine.id });
      }
    });
    await ctx.reply(T.routineCreated(name));
  };
}

// Borra un mensaje de menú previo sin abortar el wizard si ya no existe (chat
// limpio: spec §4 "No quedan menús muertos en el chat"). Las llamadas a
// ctx.api dentro de la conversación pasan por el motor de replay de
// @grammyjs/conversations (ver hydrateContext en su plugin.js), que registra
// el resultado y lo repite en cada replay en vez de volver a borrar: es
// seguro llamarla desde una función que se reejecuta desde el principio.
async function deleteMenuMessage(ctx: Context, messageId: number | null): Promise<void> {
  const chatId = ctx.chat?.id;
  if (messageId === null || chatId === undefined) {
    return;
  }
  await ctx.api.deleteMessage(chatId, messageId).catch(() => {});
}

// Devuelve el id elegido, o undefined si el usuario pidió buscar por nombre.
// TODA lectura de base de datos va en conversation.external: el motor de replay
// reejecuta esta función desde el principio en cada update.
// priorMenuMessageId: mensaje de menú (no-match/candidatos) que precedió a esta
// pantalla, si lo hay, para borrarlo antes de pintar la primera pantalla de grupos.
async function pickExerciseByGroup(
  conversation: WizardConversation,
  ctx: Context,
  db: DatabaseSync,
  userId: number,
  priorMenuMessageId: number | null,
): Promise<number | undefined> {
  let state: PickerState = { view: 'groups' };
  let toDelete = priorMenuMessageId;
  for (;;) {
    const view = await conversation.external(() =>
      renderPicker(state, 'c', localizeGroups(listExercisesByMuscleGroup(db, userId))),
    );
    await deleteMenuMessage(ctx, toDelete);
    const sent = await ctx.reply(view.text, { reply_markup: view.keyboard });
    toDelete = sent.message_id;
    const resp = await conversation.waitForCallbackQuery(/^pick:c:/);
    await resp.answerCallbackQuery();
    const action = parseCallback(resp.callbackQuery.data ?? '');
    if (action.type === 'pick_exercise') {
      await deleteMenuMessage(ctx, sent.message_id);
      return action.exerciseId;
    }
    if (action.type === 'pick_search') {
      await deleteMenuMessage(ctx, sent.message_id);
      return undefined;
    }
    state =
      action.type === 'pick_group'
        ? { view: 'group', groupIndex: action.groupIndex, offset: action.offset }
        : { view: 'groups' };
  }
}

async function addExercisesToDay(
  conversation: WizardConversation,
  ctx: Context,
  db: DatabaseSync,
  userId: number,
  routineDayId: number,
): Promise<void> {
  let exPosition = 1;
  for (;;) {
    await ctx.reply(T.dayAskExercise, {
      reply_markup: new InlineKeyboard()
        .text(T.pickByGroupButton, CB.pickGroups('c'))
        .row()
        .text(T.createOwnButton, 'wizard:createown')
        .row()
        .text(T.doneButton, 'wizard:daydone'),
    });
    const resp = await conversation.wait();
    const data = resp.callbackQuery?.data;
    if (data === 'wizard:daydone') {
      await resp.answerCallbackQuery();
      return;
    }

    let exerciseId: number | undefined;
    if (data === 'wizard:createown') {
      await resp.answerCallbackQuery();
      exerciseId = await createOwnExercise(conversation, ctx, db, userId);
    } else if (data !== undefined && data.startsWith('pick:c:')) {
      await resp.answerCallbackQuery();
      exerciseId = await pickExerciseByGroup(conversation, ctx, db, userId, null);
      if (exerciseId === undefined) {
        continue; // el usuario pidió buscar por nombre: vuelve al prompt de texto
      }
    } else if (resp.message?.text) {
      const query = resp.message.text.trim();
      const pool = await conversation.external(() =>
        listCatalogAndOwn(db, userId).map((e) => ({ id: e.id, name: e.name, nameKey: e.nameKey })),
      );
      const match = matchExercise(query, pool);
      if (match.kind === 'none') {
        const view = renderNoMatch(query, 'c');
        const sentNoMatch = await ctx.reply(view.text, { reply_markup: view.keyboard });
        const back = await conversation.waitForCallbackQuery(/^pick:c:g$/);
        await back.answerCallbackQuery();
        exerciseId = await pickExerciseByGroup(conversation, ctx, db, userId, sentNoMatch.message_id);
        if (exerciseId === undefined) {
          continue;
        }
      } else if (match.kind === 'ambiguous') {
        const view = renderCandidates(match.candidates, 'c');
        const sentCandidates = await ctx.reply(view.text, { reply_markup: view.keyboard });
        const pickCtx = await conversation.waitForCallbackQuery(/^pick:c:/);
        await pickCtx.answerCallbackQuery();
        const action = parseCallback(pickCtx.callbackQuery.data ?? '');
        if (action.type === 'pick_exercise') {
          exerciseId = action.exerciseId;
          await deleteMenuMessage(ctx, sentCandidates.message_id);
        } else {
          exerciseId = await pickExerciseByGroup(conversation, ctx, db, userId, sentCandidates.message_id);
          if (exerciseId === undefined) {
            continue;
          }
        }
      } else {
        exerciseId = match.exercise.id;
      }
    } else {
      continue;
    }

    if (exerciseId === undefined || Number.isNaN(exerciseId)) {
      continue;
    }

    // El ejercicio pudo archivarse entre pintar el menú y pulsarlo (mismo riesgo
    // que capture.ts/last.ts): avisamos y dejamos elegir de nuevo en vez de
    // insertar un id huérfano en la rutina.
    const picked = await conversation.external(() => getExerciseById(db, exerciseId as number));
    if (!picked || picked.archived) {
      await ctx.reply(T.exerciseGoneToast);
      continue;
    }

    const targets = await askTargets(conversation, ctx);
    const capturedPosition = exPosition;
    await conversation.external(() =>
      addRoutineExercise(db, {
        routineDayId,
        exerciseId: exerciseId as number,
        position: capturedPosition,
        targetSets: targets.sets,
        targetRepsMin: targets.repsMin,
        targetRepsMax: targets.repsMax,
        targetRestSeconds: targets.rest,
      }),
    );
    exPosition += 1;
  }
}

async function askTargets(
  conversation: WizardConversation,
  ctx: Context,
): Promise<{ sets: number | null; repsMin: number | null; repsMax: number | null; rest: number | null }> {
  await ctx.reply(T.askTargets, {
    reply_markup: new InlineKeyboard().text(T.skipButton, 'wizard:skiptargets'),
  });
  const resp = await conversation.wait();
  if (resp.callbackQuery?.data === 'wizard:skiptargets') {
    await resp.answerCallbackQuery();
    return { sets: null, repsMin: null, repsMax: null, rest: null };
  }
  return parseTargets(resp.message?.text ?? '');
}

async function createOwnExercise(
  conversation: WizardConversation,
  ctx: Context,
  db: DatabaseSync,
  userId: number,
): Promise<number> {
  await ctx.reply(T.askOwnName);
  const nameCtx = await conversation.waitFor('message:text');
  const name = nameCtx.message.text.trim();

  const kb = new InlineKeyboard();
  MUSCLE_GROUPS.forEach((group, index) => {
    kb.text(groupLabel(group), `wizard:mg:${group}`);
    if (index % 2 === 1) {
      kb.row();
    }
  });
  await ctx.reply(T.askMuscleGroup, { reply_markup: kb });
  const groupCtx = await conversation.waitForCallbackQuery(/^wizard:mg:(.+)$/);
  await groupCtx.answerCallbackQuery();
  const muscleGroup = groupCtx.match?.[1] as MuscleGroup;

  const created = await conversation.external(() =>
    createCustomExercise(db, { userId, name, muscleGroup }),
  );
  return created.id;
}

/**
 * Lista de rutinas con la activa marcada. Extraída del handler de /routines para
 * que la bienvenida (welcome.ts, botón "📋 Mis rutinas") pinte exactamente lo
 * mismo sin entrar en la conversación del wizard: su botón "➕ Nueva rutina" ya
 * hace conversation.enter('routineWizard') por su cuenta.
 */
export function renderRoutinesList(
  db: DatabaseSync,
  userId: number,
): { text: string; keyboard: InlineKeyboard } {
  const routines = listRoutines(db, userId);
  const keyboard = new InlineKeyboard();
  for (const routine of routines) {
    keyboard.text(`${routine.isActive ? '✅ ' : ''}${routine.name}`, `setactive:${routine.id}`).row();
  }
  keyboard.text(T.newRoutineButton, 'newroutine');
  return { text: routines.length > 0 ? T.routinesList : T.noRoutines, keyboard };
}

export function registerRoutines(bot: Bot<CustomContext>, db: DatabaseSync, _config: unknown): void {
  bot.use(conversations());
  bot.use(
    createConversation(makeWizard(db), {
      id: 'routineWizard',
      // El plugin de conversaciones rehidrata su propia `Api` en cada replay (ver
      // `hydrateContext` en @grammyjs/conversations) y NO copia los transformers
      // instalados en `bot.api` (grammY sí lo hace para el `ctx.api` normal en
      // `Bot.handleUpdate`, ver su comentario "configure it with the same
      // transformers as bot.api"). Replicamos aquí el mismo criterio para que
      // cualquier transformer de `bot.api` (rate limiting, logging, y en pruebas:
      // el mock sin red) también aplique a las llamadas hechas desde el wizard.
      plugins: [
        async (ctx, next) => {
          for (const transformer of bot.api.config.installedTransformers()) {
            ctx.api.config.use(transformer);
          }
          await next();
        },
      ],
    }),
  );

  bot.command('routines', async (ctx) => {
    const { text, keyboard } = renderRoutinesList(db, ctx.user.id);
    await ctx.reply(text, { reply_markup: keyboard });
  });

  bot.callbackQuery('newroutine', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('routineWizard');
  });

  bot.callbackQuery(/^setactive:(\d+)$/, async (ctx) => {
    setActiveRoutine(db, { userId: ctx.user.id, routineId: Number(ctx.match[1]) });
    await ctx.answerCallbackQuery(T.routineActivated);
  });
}
