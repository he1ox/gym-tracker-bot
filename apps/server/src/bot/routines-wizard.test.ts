import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '@gym-tracker/core';
import {
  MIGRATIONS_DIR,
  createRoutine,
  createUser,
  getExerciseById,
  listCatalogAndOwn,
  listExercisesByMuscleGroup,
  listRoutineDays,
  listRoutineExerciseDetails,
  listRoutines,
  openDatabase,
  runMigrations,
  setActiveRoutine,
} from '@gym-tracker/db';
import { makeHarness, callbackUpdate, outgoingTexts, textUpdate, BOT_INFO } from './test-harness';
import { renderRoutinesList } from './routines-wizard';
import { T } from './texts';

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', createdAt: 0 });
  return d;
}

describe('/routines wizard (happy path)', () => {
  it('creates a routine with one day and one exercise and activates it', async () => {
    const d = db();
    const exercise = getExerciseById(d, 1)!; // nombre del catálogo
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Empuje'));
    await bot.handleUpdate(textUpdate(next(), exercise.name)); // match único
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:skiptargets', 700)); // Saltar objetivos
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:daydone', 700)); // cerrar día
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:done', 700)); // terminar días

    const routines = listRoutines(d, 1);
    expect(routines).toHaveLength(1);
    expect(routines[0]?.isActive).toBe(true); // primera rutina → activa
    const days = listRoutineDays(d, routines[0]!.id);
    expect(days.map((x) => x.name)).toEqual(['Empuje']);
    const exercises = listRoutineExerciseDetails(d, days[0]!.id);
    expect(exercises.map((x) => x.exerciseId)).toEqual([exercise.id]);
    expect(exercises[0]?.targetSets).toBeNull(); // objetivos saltados
  });
});

describe('/routines wizard with the exercise picker', () => {
  it('adds an exercise picked from the group menu, without typing its name', async () => {
    const d = db();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const target = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Empuje'));
    await bot.handleUpdate(callbackUpdate(next(), 'pick:c:g', 700)); // "Ver por grupo"
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:g:${chestIndex}:0`, 700));
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:x:${target.id}`, 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:skiptargets', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:daydone', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:done', 700));

    const routines = listRoutines(d, 1);
    const days = listRoutineDays(d, routines[0]!.id);
    const exercises = listRoutineExerciseDetails(d, days[0]!.id);
    expect(exercises.map((x) => x.exerciseId)).toEqual([target.id]);
  });

  it('turns an ambiguous typed query into candidate buttons', async () => {
    const d = db();
    const candidates = listCatalogAndOwn(d, 1).filter((e) =>
      e.name.toLowerCase().includes('polea'),
    );
    expect(candidates.length).toBeGreaterThan(1); // premisa del test
    const chosen = candidates[0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Tirón'));
    outgoing.length = 0;
    await bot.handleUpdate(textUpdate(next(), 'polea'));

    const datas = outgoing
      .filter((c) => c.method === 'sendMessage')
      .flatMap((c) => {
        const markup = c.payload.reply_markup as
          | { inline_keyboard?: Array<Array<{ callback_data?: string }>> }
          | undefined;
        return (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? '');
      });
    expect(datas.some((x) => x.startsWith('pick:c:x:'))).toBe(true);

    await bot.handleUpdate(callbackUpdate(next(), `pick:c:x:${chosen.id}`, 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:skiptargets', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:daydone', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:done', 700));

    const days = listRoutineDays(d, listRoutines(d, 1)[0]!.id);
    expect(listRoutineExerciseDetails(d, days[0]!.id).map((x) => x.exerciseId)).toEqual([chosen.id]);
  });

  it('deletes previous picker screens while navigating, leaving no dead menus (F2)', async () => {
    // NOTA sobre el motor de replay de @grammyjs/conversations (confirmado leyendo
    // engine.js/plugin.js del paquete instalado): cada bot.handleUpdate() reejecuta
    // routineWizard desde el principio, y en producción los pasos ya completados
    // (incluidas las llamadas a ctx.api) se "reproducen" devolviendo el resultado
    // cacheado sin volver a tocar la red — el wrapper de deduplicación que instala
    // hydrateContext() (ver el `api.config.use` al principio de esa función) es lo
    // que lo garantiza. PERO en este test-harness el mock de red se reinstala (vía
    // el plugin de registerRoutines, que copia los transformers de bot.api sobre
    // ctx.api DESPUÉS de que hydrateContext ya haya instalado el suyo) como
    // transformer MÁS EXTERNO, y el mock no delega en `prev`: en los tests ese
    // wrapper de dedup nunca se alcanza y cada replay reenvía literalmente los
    // pasos previos con ids de mensaje nuevos. Por eso aquí no se puede comparar
    // el total de deleteMessage acumulado a través de varios handleUpdate (esos
    // ids "fantasma" de reenvíos nunca se borran, no por un fallo del código sino
    // porque en el test no representan mensajes reales). Lo que SÍ es estable —
    // dentro de una misma pasada de replay el código se ejecuta de forma
    // determinista — es que como mucho una pantalla del picker queda "viva" (sin
    // borrar) tras cada handleUpdate individual mientras el usuario sigue
    // navegando, y ninguna queda viva una vez que elige un ejercicio.
    const d = db();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const target = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    const liveScreens = () => {
      const sends = outgoing.filter(
        (c) => c.method === 'sendMessage' && String(c.payload.text ?? '').match(/grupo muscular|— elige un ejercicio/),
      ).length;
      const deletes = outgoing.filter((c) => c.method === 'deleteMessage').length;
      return sends - deletes;
    };

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Empuje'));

    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(next(), 'pick:c:g', 700)); // 1er picker: grupos
    expect(liveScreens()).toBe(1); // la pantalla recién mostrada, aún sin borrar

    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:g:${chestIndex}:0`, 700)); // 2o picker: ejercicios del grupo
    expect(liveScreens()).toBe(1); // sigue habiendo como mucho una viva
    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('Pecho');

    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:x:${target.id}`, 700)); // resuelve
    expect(liveScreens()).toBe(0); // resuelto: no queda ningún menú del picker vivo
  });

  it('deletes the ambiguous-candidates screen once an exercise is picked (F2)', async () => {
    const d = db();
    const candidates = listCatalogAndOwn(d, 1).filter((e) => e.name.toLowerCase().includes('polea'));
    expect(candidates.length).toBeGreaterThan(1);
    const chosen = candidates[0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Tirón'));
    await bot.handleUpdate(textUpdate(next(), 'polea')); // pantalla de candidatos
    outgoing.length = 0;

    await bot.handleUpdate(callbackUpdate(next(), `pick:c:x:${chosen.id}`, 700));

    expect(outgoing.filter((c) => c.method === 'deleteMessage')).toHaveLength(1);
  });

  it('does not add an exercise archived mid-picker to the routine, and lets the wizard continue (F4)', async () => {
    const d = db();
    const chestIndex = MUSCLE_GROUPS.indexOf('chest');
    const target = listExercisesByMuscleGroup(d, 1).get('chest')![0]!;
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);
    let id = 1;
    const next = () => id++;

    await bot.handleUpdate(textUpdate(next(), '/routines'));
    await bot.handleUpdate(callbackUpdate(next(), 'newroutine', 700));
    await bot.handleUpdate(textUpdate(next(), 'Mi rutina'));
    await bot.handleUpdate(textUpdate(next(), 'Empuje'));
    await bot.handleUpdate(callbackUpdate(next(), 'pick:c:g', 700));
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:g:${chestIndex}:0`, 700));

    // Se archiva entre pintar el menú y pulsar el botón.
    d.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(target.id);
    outgoing.length = 0;
    await bot.handleUpdate(callbackUpdate(next(), `pick:c:x:${target.id}`, 700));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('ya no está disponible');

    // El wizard sigue vivo: cerrar el día y la rutina sin haber añadido el ejercicio.
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:daydone', 700));
    await bot.handleUpdate(callbackUpdate(next(), 'wizard:done', 700));

    const days = listRoutineDays(d, listRoutines(d, 1)[0]!.id);
    expect(listRoutineExerciseDetails(d, days[0]!.id)).toHaveLength(0);
  });
});

describe('renderRoutinesList', () => {
  it('lists the routines with the active one marked and offers the new-routine button', () => {
    const d = db();
    const first = createRoutine(d, { userId: 1, name: 'PPL', createdAt: 1 });
    createRoutine(d, { userId: 1, name: 'Full body', createdAt: 2 });
    setActiveRoutine(d, { userId: 1, routineId: first.id });

    const { text, keyboard } = renderRoutinesList(d, 1);
    const datas = keyboard.inline_keyboard.flat().map((b) => ('callback_data' in b ? b.callback_data : ''));

    expect(text).toBe(T.routinesList);
    expect(datas).toEqual([`setactive:${first.id}`, 'setactive:2', 'newroutine']);
    expect(JSON.stringify(keyboard.inline_keyboard)).toContain('✅ PPL');
  });

  it('says there are none yet but still offers to create one', () => {
    const d = db();
    const { text, keyboard } = renderRoutinesList(d, 1);
    expect(text).toBe(T.noRoutines);
    expect(keyboard.inline_keyboard.flat()).toHaveLength(1);
  });
});
