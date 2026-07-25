import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '@gym-tracker/core';
import {
  MIGRATIONS_DIR,
  addRoutineExercise,
  createRoutine,
  createRoutineDay,
  createUser,
  createWorkout,
  finishWorkout,
  getActiveWorkout,
  getExerciseById,
  getSession,
  getUserByTelegramId,
  getWorkoutById,
  insertSet,
  listExercisesByMuscleGroup,
  listRoutineExerciseDetails,
  listSetsForWorkout,
  openDatabase,
  runMigrations,
  setActiveRoutine,
} from '@gym-tracker/db';
import { BOT_INFO, callbackUpdate, commandUpdate, makeHarness, textUpdate } from './test-harness';

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };
const MSG = 500; // message_id estable del mensaje activo en los callbacks

function baseDb() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', createdAt: 0 });
  return d;
}

function texts(outgoing: Array<{ method: string; payload: Record<string, unknown> }>, method: string): string[] {
  return outgoing.filter((c) => c.method === method).map((c) => String(c.payload.text ?? ''));
}

// callback_data de los botones de la última llamada al método indicado.
function lastKeyboardDatas(
  outgoing: Array<{ method: string; payload: Record<string, unknown> }>,
  method: string,
): string[] {
  const call = outgoing.filter((c) => c.method === method).at(-1);
  const markup = call?.payload.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> } | undefined;
  return (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? '');
}

describe('capture regression flows', () => {
  it('records a full routine-based session end to end', async () => {
    const d = baseDb();
    const routine = createRoutine(d, { userId: 1, name: 'PPL', createdAt: 1 });
    setActiveRoutine(d, { userId: 1, routineId: routine.id });
    const day = createRoutineDay(d, { routineId: routine.id, name: 'Empuje', position: 1 });
    addRoutineExercise(d, { routineDayId: day.id, exerciseId: 1, position: 1, targetSets: null, targetRepsMin: null, targetRepsMax: null, targetRestSeconds: null });

    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, `day:${day.id}`, MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await bot.handleUpdate(textUpdate(4, '60x8'));
    await bot.handleUpdate(commandUpdate(5, 'finish'));

    const workout = getActiveWorkout(d, 1);
    expect(workout).toBeUndefined(); // cerrado
    expect(getSession(d, 1)).toBeUndefined();
    // exactamente una serie efectiva registrada
    const finished = getWorkoutById(d, 1)!;
    expect(finished.finishedAt).not.toBeNull();
    expect(listSetsForWorkout(d, finished.id)).toHaveLength(1);
    // el resumen final se envió/editó con el título del día
    expect(outgoing.some((c) => String(c.payload.text ?? '').includes('Empuje'))).toBe(true);
  });

  it('ignores a duplicate update_id (no double set)', async () => {
    const d = baseDb();
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    const setUpdate = textUpdate(4, '60x8');
    await bot.handleUpdate(setUpdate);
    await bot.handleUpdate(setUpdate); // mismo update_id → descartado
    const workout = getActiveWorkout(d, 1)!;
    expect(listSetsForWorkout(d, workout.id)).toHaveLength(1);
  });

  it('rejects invalid free text with an ephemeral error and records nothing', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await bot.handleUpdate(textUpdate(4, '60x')); // faltan reps
    const workout = getActiveWorkout(d, 1)!;
    expect(listSetsForWorkout(d, workout.id)).toHaveLength(0);
    expect(texts(outgoing, 'sendMessage').some((t) => t.includes('repeticiones'))).toBe(true);
  });

  it('ignores updates from unauthorized ids', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start', 999));
    expect(getUserByTelegramId(d, 999)).toBeUndefined();
    expect(getSession(d, 1)).toBeUndefined();
    expect(outgoing).toHaveLength(0); // no hubo respuesta
  });

  it('marks a warmup set and excludes it from the effective count', async () => {
    const d = baseDb();
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await bot.handleUpdate(callbackUpdate(4, 'wu', MSG)); // marca calentamiento
    await bot.handleUpdate(textUpdate(5, '40x10')); // se registra como calentamiento
    await bot.handleUpdate(textUpdate(6, '60x8')); // efectiva
    const workout = getActiveWorkout(d, 1)!;
    const sets = listSetsForWorkout(d, workout.id);
    expect(sets).toHaveLength(2);
    expect(sets.filter((s) => s.isWarmup)).toHaveLength(1);
    expect(sets.filter((s) => !s.isWarmup)).toHaveLength(1);
  });

  it('resumes an active session after a restart (new bot, same db)', async () => {
    const d = baseDb();
    const first = makeHarness(d, BOT_INFO, CONFIG);
    await first.bot.handleUpdate(commandUpdate(1, 'start'));
    await first.bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await first.bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await first.bot.handleUpdate(textUpdate(4, '60x8'));

    const activeBefore = getActiveWorkout(d, 1)!;
    const second = makeHarness(d, BOT_INFO, CONFIG); // "reinicio"
    await second.bot.handleUpdate(commandUpdate(10, 'start'));

    expect(getSession(d, 1)).toBeDefined(); // la sesión sobrevive
    expect(getActiveWorkout(d, 1)!.id).toBe(activeBefore.id); // no se creó otro workout
    expect(second.outgoing.length).toBeGreaterThan(0); // re-renderizó el mensaje activo
  });

  it('announces a personal record on finish', async () => {
    const d = baseDb();
    // histórico previo con 1RM bajo
    const past = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: 0 });
    insertSet(d, { workoutId: past.id, exerciseId: 1, position: 1, weightKg: 60, reps: 5, rpe: null, restSeconds: null, isWarmup: false, createdAt: 100 });
    finishWorkout(d, { workoutId: past.id, finishedAt: 200 });

    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'ex:1', MSG));
    await bot.handleUpdate(textUpdate(4, '100x5')); // 1RM claramente mayor
    await bot.handleUpdate(commandUpdate(5, 'finish'));

    const name = getExerciseById(d, 1)!.name;
    expect(outgoing.some((c) => String(c.payload.text ?? '').includes('🏆') && String(c.payload.text ?? '').includes(name))).toBe(true);
  });

  it('adds an out-of-routine exercise to the session only (§13.1)', async () => {
    const d = baseDb();
    const routine = createRoutine(d, { userId: 1, name: 'PPL', createdAt: 1 });
    setActiveRoutine(d, { userId: 1, routineId: routine.id });
    const day = createRoutineDay(d, { routineId: routine.id, name: 'Empuje', position: 1 });
    addRoutineExercise(d, { routineDayId: day.id, exerciseId: 1, position: 1, targetSets: null, targetRepsMin: null, targetRepsMax: null, targetRestSeconds: null });
    const outsider = getExerciseById(d, 2)!; // en el catálogo, NO en el día

    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, `day:${day.id}`, MSG));
    await bot.handleUpdate(callbackUpdate(3, 'add', MSG)); // "Otro ejercicio"
    await bot.handleUpdate(textUpdate(4, outsider.name)); // búsqueda por nombre en catálogo
    await bot.handleUpdate(textUpdate(5, '50x10'));

    // la rutina no cambió
    expect(listRoutineExerciseDetails(d, day.id).map((x) => x.exerciseId)).toEqual([1]);
    // pero hay una serie del ejercicio agregado
    const workout = getActiveWorkout(d, 1)!;
    expect(listSetsForWorkout(d, workout.id).some((s) => s.exerciseId === outsider.id)).toBe(true);
  });
});

describe('exercise picker in the capture flow', () => {
  it('offers buttons instead of a dead end when the text matches several exercises', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(textUpdate(3, 'polea')); // varios candidatos en el catálogo

    const all = [...texts(outgoing, 'sendMessage'), ...texts(outgoing, 'editMessageText')].join('\n');
    expect(all).not.toContain('Sé más específico');
    const datas = [...lastKeyboardDatas(outgoing, 'editMessageText'), ...lastKeyboardDatas(outgoing, 'sendMessage')];
    expect(datas.some((x) => x.startsWith('pick:c:x:'))).toBe(true);
  });

  it('opens the group menu from the "Otro ejercicio" button', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, 'add', MSG));

    expect(texts(outgoing, 'editMessageText').join('\n')).toContain('grupo muscular');
    expect(lastKeyboardDatas(outgoing, 'editMessageText').some((x) => x.startsWith('pick:c:g:'))).toBe(true);
  });

  it('walks groups → exercise and lands in the exercise view, editing the same message', async () => {
    const d = baseDb();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const first = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'add', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(4, `pick:c:g:${chestIndex}:0`, MSG));
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toContain(`pick:c:x:${first.id}`);
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toContain('pick:c:g'); // ‹ Volver

    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(5, `pick:c:x:${first.id}`, MSG));

    expect(getSession(d, 1)?.currentExerciseId).toBe(first.id);
    // Edición in place: nada de mensajes nuevos para la vista principal.
    expect(outgoing.filter((c) => c.method === 'editMessageText').length).toBeGreaterThan(0);
    expect(texts(outgoing, 'editMessageText').join('\n')).toContain(first.name);
  });

  it('goes back from a group to the group list', async () => {
    const d = baseDb();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, `pick:c:g:${chestIndex}:0`, MSG));
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(4, 'pick:c:g', MSG));
    expect(texts(outgoing, 'editMessageText').join('\n')).toContain('grupo muscular');
  });

  it('warns and repaints the group menu when the chosen exercise is gone', async () => {
    const d = baseDb();
    const target = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    d.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(target.id);
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(3, `pick:c:x:${target.id}`, MSG));

    expect(getSession(d, 1)?.currentExerciseId).toBeNull(); // no se cambió de ejercicio
    const answers = outgoing.filter((c) => c.method === 'answerCallbackQuery');
    expect(answers.some((c) => String(c.payload.text ?? '').length > 0)).toBe(true);
  });

  it('offers the group menu when the typed name matches nothing', async () => {
    const d = baseDb();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    outgoing.length = 0;

    await bot.handleUpdate(textUpdate(3, 'zancada rusa inexistente'));

    expect(texts(outgoing, 'sendMessage').join('\n')).toContain('No encontré');
    expect(lastKeyboardDatas(outgoing, 'sendMessage')).toContain('pick:c:g');
  });

  it('ignores a pick from another origin', async () => {
    const d = baseDb();
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    await bot.handleUpdate(commandUpdate(1, 'start'));
    await bot.handleUpdate(callbackUpdate(2, 'free', MSG));
    await bot.handleUpdate(callbackUpdate(3, 'pick:l:x:1', MSG));
    expect(getSession(d, 1)?.currentExerciseId).toBeNull();
  });
});
