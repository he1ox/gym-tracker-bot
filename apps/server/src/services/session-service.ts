import { detectPersonalRecord, effectiveSets, sessionTonnage } from '@gym-tracker/core';
import {
  type BotSessionRow,
  type SetRow,
  createSession,
  createWorkout,
  deleteSession,
  finishWorkout as closeWorkout,
  getActiveRoutine,
  getExerciseById,
  getSession,
  getWorkoutById,
  insertSet,
  lastEffectiveSetForExercise,
  listHistorySetsForExercise,
  listRoutineDays,
  listRoutineExerciseDetails,
  listSetsForWorkout,
  listSetsForWorkoutExercise,
  nextSetPosition,
  updateSession,
} from '@gym-tracker/db';
import { displayName } from '../i18n/exercise-name';
import type { DatabaseSync } from 'node:sqlite';
import type {
  DayOption,
  DisplaySet,
  ExercisePickItem,
  FinishSummary,
  RecordLine,
  SessionViewModel,
} from '../bot/session-view';

export class ValidationError extends Error {}

function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const toDisplay = (s: SetRow): DisplaySet => ({ weightKg: s.weightKg, reps: s.reps });

export function startWorkout(
  db: DatabaseSync,
  params: { userId: number; chatId: number; routineDayId: number | null; dayNameSnapshot: string | null; now: number },
): BotSessionRow {
  return tx(db, () => {
    const workout = createWorkout(db, {
      userId: params.userId,
      routineDayId: params.routineDayId,
      dayNameSnapshot: params.dayNameSnapshot,
      startedAt: params.now,
    });
    return createSession(db, {
      userId: params.userId,
      workoutId: workout.id,
      chatId: params.chatId,
      updatedAt: params.now,
    });
  });
}

export function recordSet(
  db: DatabaseSync,
  params: { session: BotSessionRow; weightKg: number; reps: number; rpe: number | null; isWarmup: boolean; now: number },
): { set: SetRow; previousEphemeralMessageId: number | null } {
  const { session } = params;
  if (!(params.weightKg > 0)) {
    throw new ValidationError(`weightKg must be positive, got ${params.weightKg}`);
  }
  if (!Number.isInteger(params.reps) || params.reps < 1) {
    throw new ValidationError(`reps must be a positive integer, got ${params.reps}`);
  }
  if (session.currentExerciseId === null) {
    throw new ValidationError('cannot record a set without a current exercise');
  }
  const exerciseId = session.currentExerciseId;
  return tx(db, () => {
    const set = insertSet(db, {
      workoutId: session.workoutId,
      exerciseId,
      position: nextSetPosition(db, session.workoutId),
      weightKg: params.weightKg,
      reps: params.reps,
      rpe: params.rpe,
      restSeconds: null,
      isWarmup: params.isWarmup,
      createdAt: params.now,
    });
    updateSession(
      db,
      session.userId,
      { pendingWeightKg: params.weightKg, pendingReps: params.reps, nextSetIsWarmup: false, ephemeralMessageId: null },
      params.now,
    );
    return { set, previousEphemeralMessageId: session.ephemeralMessageId };
  });
}

export function switchExercise(
  db: DatabaseSync,
  params: { session: BotSessionRow; exerciseId: number; now: number },
): void {
  const { session, exerciseId } = params;
  const historical = lastEffectiveSetForExercise(db, {
    userId: session.userId,
    exerciseId,
    excludeWorkoutId: session.workoutId,
  });
  let pendingWeightKg: number | null = null;
  let pendingReps: number | null = null;
  if (historical) {
    pendingWeightKg = historical.weightKg;
    pendingReps = historical.reps;
  } else {
    const today = listSetsForWorkoutExercise(db, session.workoutId, exerciseId).at(-1);
    if (today) {
      pendingWeightKg = today.weightKg;
      pendingReps = today.reps;
    }
  }
  updateSession(db, session.userId, { currentExerciseId: exerciseId, pendingWeightKg, pendingReps, nextSetIsWarmup: false }, params.now);
}

export function adjustPending(
  db: DatabaseSync,
  params: { session: BotSessionRow; weightDelta?: number; repsDelta?: number; now: number },
): void {
  const { session } = params;
  const currentWeight = session.pendingWeightKg ?? 0;
  const currentReps = session.pendingReps ?? 0;
  const nextWeight = Math.max(0, Math.round((currentWeight + (params.weightDelta ?? 0)) * 10) / 10);
  const nextReps = Math.max(0, currentReps + (params.repsDelta ?? 0));
  updateSession(db, session.userId, { pendingWeightKg: nextWeight, pendingReps: nextReps }, params.now);
}

export function toggleWarmup(db: DatabaseSync, params: { session: BotSessionRow; now: number }): void {
  updateSession(db, params.session.userId, { nextSetIsWarmup: !params.session.nextSetIsWarmup }, params.now);
}

export function restTargetForCurrentExercise(db: DatabaseSync, session: BotSessionRow): number | null {
  if (session.currentExerciseId === null) {
    return null;
  }
  const workout = getWorkoutById(db, session.workoutId);
  if (!workout || workout.routineDayId === null) {
    return null;
  }
  const detail = listRoutineExerciseDetails(db, workout.routineDayId).find(
    (d) => d.exerciseId === session.currentExerciseId,
  );
  return detail?.targetRestSeconds ?? null;
}

function buildPickItems(db: DatabaseSync, session: BotSessionRow): ExercisePickItem[] {
  const workout = getWorkoutById(db, session.workoutId);
  const effectiveToday = new Set(
    effectiveSets(listSetsForWorkout(db, session.workoutId)).map((s) => s.exerciseId),
  );
  const items: ExercisePickItem[] = [];
  const seen = new Set<number>();
  if (workout && workout.routineDayId !== null) {
    for (const detail of listRoutineExerciseDetails(db, workout.routineDayId)) {
      items.push({
        exerciseId: detail.exerciseId,
        name: displayName(detail),
        done: effectiveToday.has(detail.exerciseId),
      });
      seen.add(detail.exerciseId);
    }
  }
  for (const exerciseId of effectiveToday) {
    if (!seen.has(exerciseId)) {
      const exercise = getExerciseById(db, exerciseId);
      if (exercise) {
        items.push({ exerciseId, name: displayName(exercise), done: true });
      }
    }
  }
  return items;
}

/**
 * Días de la rutina activa del usuario, o lista vacía si no tiene ninguna activa.
 * Vive aquí y no en capture.ts para que welcome.ts pueda usarla sin crear un ciclo
 * de importación (capture.ts importa welcome.ts).
 */
export function buildDayOptions(db: DatabaseSync, userId: number): DayOption[] {
  const active = getActiveRoutine(db, userId);
  return active ? listRoutineDays(db, active.id).map((d) => ({ routineDayId: d.id, name: d.name })) : [];
}

export function buildSessionView(db: DatabaseSync, session: BotSessionRow): SessionViewModel {
  const workout = getWorkoutById(db, session.workoutId);
  const allSets = listSetsForWorkout(db, session.workoutId);
  const header = {
    dayName: workout?.dayNameSnapshot ?? null,
    effectiveSets: effectiveSets(allSets).length,
    tonnageKg: sessionTonnage(allSets),
  };

  if (session.currentExerciseId === null) {
    return { kind: 'choosing_exercise', header, items: buildPickItems(db, session) };
  }

  const exercise = getExerciseById(db, session.currentExerciseId);
  const last = lastEffectiveSetForExercise(db, {
    userId: session.userId,
    exerciseId: session.currentExerciseId,
    excludeWorkoutId: session.workoutId,
  });
  const lastTime = last
    ? effectiveSets(listSetsForWorkoutExercise(db, last.workoutId, session.currentExerciseId)).map(toDisplay)
    : null;
  const today = effectiveSets(listSetsForWorkoutExercise(db, session.workoutId, session.currentExerciseId)).map(toDisplay);
  const pending =
    session.pendingWeightKg !== null &&
    session.pendingReps !== null &&
    session.pendingWeightKg > 0 &&
    session.pendingReps >= 1
      ? { weightKg: session.pendingWeightKg, reps: session.pendingReps }
      : null;

  return {
    kind: 'in_exercise',
    header,
    exerciseName: exercise ? displayName(exercise) : '',
    lastTime,
    today,
    pending,
    nextIsWarmup: session.nextSetIsWarmup,
    restTimer: null,
  };
}

export function finishWorkout(db: DatabaseSync, params: { session: BotSessionRow; now: number }): FinishSummary {
  const { session } = params;
  const workout = getWorkoutById(db, session.workoutId);
  const allSets = listSetsForWorkout(db, session.workoutId);
  const effective = effectiveSets(allSets);

  const records: RecordLine[] = [];
  for (const exerciseId of new Set(effective.map((s) => s.exerciseId))) {
    const history = listHistorySetsForExercise(db, { userId: session.userId, exerciseId, excludeWorkoutId: session.workoutId });
    const sessionSets = listSetsForWorkoutExercise(db, session.workoutId, exerciseId);
    const pr = detectPersonalRecord(history, sessionSets);
    if (pr) {
      const exercise = getExerciseById(db, exerciseId);
      records.push({
        exerciseName: exercise ? displayName(exercise) : '',
        estimated1RM: pr.estimated1RM,
        previous1RM: pr.previous1RM ?? null,
      });
    }
  }

  tx(db, () => {
    closeWorkout(db, { workoutId: session.workoutId, finishedAt: params.now });
    deleteSession(db, session.userId);
  });

  return {
    dayName: workout?.dayNameSnapshot ?? null,
    effectiveSets: effective.length,
    tonnageKg: sessionTonnage(allSets),
    durationMinutes: Math.max(0, Math.round((params.now - (workout?.startedAt ?? params.now)) / 60000)),
    records,
  };
}
