import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  finishWorkout,
  getExerciseById,
  insertSet,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import type { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setCurrent } from '../i18n/current';
import { initI18n } from '../i18n/index';
import { renderStagnant } from './stagnant';
import { BOT_INFO, commandUpdate, makeHarness, outgoingTexts } from './test-harness';

beforeAll(() => {
  initI18n();
  setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
});

const CONFIG = { allowedTelegramIds: [111], timezone: 'UTC' };
const WEEK = 7 * 86_400_000;
const BASE = Date.UTC(2026, 0, 5, 12, 0, 0); // lunes

function db() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: 'UTC', locale: 'es', createdAt: 0 });
  return d;
}

function session(d: DatabaseSync, exerciseId: number, at: number, weightKg: number, reps: number) {
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: at });
  insertSet(d, { workoutId: w.id, exerciseId, position: 1, weightKg, reps, rpe: null, restSeconds: null, isWarmup: false, createdAt: at });
  finishWorkout(d, { workoutId: w.id, finishedAt: at + 1 });
}

/** Récord en la semana 0 y tres semanas entrenadas por debajo. */
function stalled(d: DatabaseSync, exerciseId: number, peak: number, weeksAfter: number) {
  session(d, exerciseId, BASE, peak, 5);
  for (let i = 1; i <= weeksAfter; i++) {
    session(d, exerciseId, BASE + i * WEEK, peak - 10, 5);
  }
}

describe('renderStagnant', () => {
  it('avisa de que no hay datos suficientes cuando apenas se ha entrenado', () => {
    const d = db();
    session(d, 1, BASE, 100, 5);
    expect(renderStagnant(d, { userId: 1, timezone: 'UTC' })).toContain('suficientes');
  });

  it('dice que no hay nada estancado cuando el ejercicio progresa', () => {
    const d = db();
    for (let i = 0; i <= 4; i++) {
      session(d, 1, BASE + i * WEEK, 100 + i * 5, 5);
    }
    expect(renderStagnant(d, { userId: 1, timezone: 'UTC' })).toContain('Ningún ejercicio');
  });

  it('lista los estancados de más semanas a menos', () => {
    const d = db();
    stalled(d, 1, 100, 3);
    stalled(d, 2, 80, 5);

    const text = renderStagnant(d, { userId: 1, timezone: 'UTC' });
    const first = getExerciseById(d, 2)!.name;
    const second = getExerciseById(d, 1)!.name;
    expect(text).toContain('Ejercicios estancados');
    expect(text.indexOf(first)).toBeLessThan(text.indexOf(second));
    expect(text).toContain('2026-W'); // la semana del récord
  });

  it('incluye un ejercicio archivado que sigue teniendo histórico', () => {
    const d = db();
    stalled(d, 1, 100, 4);
    const name = getExerciseById(d, 1)!.name;
    d.prepare('UPDATE exercises SET archived = 1 WHERE id = 1').run();

    // getExerciseById no filtra por `archived`: el nombre se resuelve igual y las
    // series ya registradas siguen contando, como en listEffectiveSetsBetween.
    expect(renderStagnant(d, { userId: 1, timezone: 'UTC' })).toContain(name);
  });

  it('no se cae por un ejercicio cuyo histórico revienta el cálculo', () => {
    const d = db();
    stalled(d, 1, 100, 4);
    // Un peso 0 hace que estimate1RM lance: hoy ningún camino de escritura lo mete,
    // pero el radio de daño de este comando es demasiado grande para depender de eso.
    const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: BASE });
    d.prepare(
      'INSERT INTO sets (workout_id, exercise_id, position, weight_kg, reps, rpe, rest_seconds, is_warmup, created_at) VALUES (?, ?, 1, 0, 5, NULL, NULL, 0, ?)',
    ).run(w.id, 2, BASE);

    // El catch de renderStagnant loguea con console.error: se silencia aquí para
    // no ensuciar la salida de la suite, y de paso sirve para comprobar que el
    // camino realmente pasó por ahí y no que el ejercicio se saltó por otra razón.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const text = renderStagnant(d, { userId: 1, timezone: 'UTC' });
    expect(text).toContain(getExerciseById(d, 1)!.name); // el sano sigue saliendo
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe('/stagnant', () => {
  it('responde con un mensaje nuevo', async () => {
    const d = db();
    stalled(d, 1, 100, 4);
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);

    await bot.handleUpdate(commandUpdate(1, 'stagnant'));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('Ejercicios estancados');
  });

  it('responde también cuando el usuario no tiene histórico', async () => {
    const d = db();
    const { bot, outgoing } = makeHarness(d, BOT_INFO, CONFIG);

    await bot.handleUpdate(commandUpdate(1, 'stagnant'));

    expect(outgoingTexts(outgoing, 'sendMessage').join('\n')).toContain('suficientes');
  });
});
