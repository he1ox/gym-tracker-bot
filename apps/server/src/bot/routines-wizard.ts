import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '@gym-tracker/core';
import {
  addRoutineExercise,
  createCustomExercise,
  createRoutine,
  createRoutineDay,
  listCatalogAndOwn,
  listRoutines,
  setActiveRoutine,
} from '@gym-tracker/db';
import { type Conversation, conversations, createConversation } from '@grammyjs/conversations';
import { type Bot, type Context, InlineKeyboard } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { matchExercise } from '../services/exercise-match';
import type { CustomContext } from './context';
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
    } else if (resp.message?.text) {
      const query = resp.message.text.trim();
      const pool = await conversation.external(() =>
        listCatalogAndOwn(db, userId).map((e) => ({ id: e.id, name: e.name })),
      );
      const match = matchExercise(query, pool);
      if (match.kind === 'none') {
        await ctx.reply(T.noMatch(query));
        continue;
      }
      if (match.kind === 'ambiguous') {
        const kb = new InlineKeyboard();
        for (const candidate of match.candidates.slice(0, 8)) {
          kb.text(candidate.name, `wizard:pick:${candidate.id}`).row();
        }
        await ctx.reply(T.ambiguousMatch, { reply_markup: kb });
        const pickCtx = await conversation.waitForCallbackQuery(/^wizard:pick:(\d+)$/);
        await pickCtx.answerCallbackQuery();
        exerciseId = Number(pickCtx.match?.[1]);
      } else {
        exerciseId = match.exercise.id;
      }
    } else {
      continue;
    }

    if (exerciseId === undefined || Number.isNaN(exerciseId)) {
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
    kb.text(MUSCLE_GROUP_LABELS[group], `wizard:mg:${group}`);
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
    const routines = listRoutines(db, ctx.user.id);
    const kb = new InlineKeyboard();
    for (const routine of routines) {
      kb.text(`${routine.isActive ? '✅ ' : ''}${routine.name}`, `setactive:${routine.id}`).row();
    }
    kb.text(T.newRoutineButton, 'newroutine');
    await ctx.reply(routines.length > 0 ? T.routinesList : T.noRoutines, { reply_markup: kb });
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
