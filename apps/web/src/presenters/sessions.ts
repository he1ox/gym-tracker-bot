import {
  MUSCLE_GROUP_LABELS, deriveRestSeconds, effectiveSets, estimate1RM, sessionTonnage,
} from '@gym-tracker/core';
import { TIME_ZONE } from '../config';
import type { Dataset, MockExercise, MockSet } from '../data/types';
import { ACCENT_DOWN, ACCENT_UP, formatClockRange, formatDayMonth, formatDelta, formatKg, formatLoad } from './format';

export interface SetRow { label: string; load: string; rpe: string; rest: string; isWarmup: boolean }

export interface SessionExercise {
  exerciseId: number; name: string; muscleLabel: string;
  topSet: string; delta: string; deltaColor: string; sets: SetRow[];
}

export interface SessionSummary {
  id: number; dayName: string; dateLabel: string; timeRange: string;
  tonnage: string; durationMinutes: number; setCount: number;
}

export interface SessionDetail extends SessionSummary {
  avgRestSeconds: number;
  notes?: string;
  comparison?: {
    prevLabel: string; tonnageDelta: string; tonnageColor: string;
    durationDelta: string; liftsUp: number; liftsTotal: number;
  };
  exercises: SessionExercise[];
}

export interface SessionsModel {
  filters: Array<{ dayName: string; count: number }>;
  summaries: SessionSummary[];
  detailFor(id: number): SessionDetail | undefined;
}

/**
 * Ranking one set against another. Loaded lifts compare on estimated 1RM.
 * Bodyweight lifts have no meaningful 1RM — the schema records no athlete
 * weight, so any figure would be invented — and compare on added plates first,
 * then reps.
 */
function isBetterSet(exercise: MockExercise, candidate: MockSet, current: MockSet): boolean {
  if (exercise.isBodyweight) {
    if (candidate.weightKg !== current.weightKg) return candidate.weightKg > current.weightKg;
    return candidate.reps > current.reps;
  }
  return estimate1RM(candidate.weightKg, candidate.reps) > estimate1RM(current.weightKg, current.reps);
}

function topSetOf(exercise: MockExercise, sets: readonly MockSet[]): MockSet | undefined {
  let best: MockSet | undefined;
  for (const set of effectiveSets(sets)) {
    if (best === undefined || isBetterSet(exercise, set, best)) best = set;
  }
  return best;
}

export function buildSessions(data: Dataset): SessionsModel {
  const exerciseById = new Map(data.exercises.map((e) => [e.id, e]));
  const setsByWorkout = new Map<number, MockSet[]>();
  for (const set of data.sets) {
    const bucket = setsByWorkout.get(set.workoutId) ?? [];
    bucket.push(set);
    setsByWorkout.set(set.workoutId, bucket);
  }
  for (const bucket of setsByWorkout.values()) {
    bucket.sort((a, b) => a.position - b.position);
  }

  const summaryOf = (workoutId: number): SessionSummary | undefined => {
    const workout = data.workouts.find((w) => w.id === workoutId);
    if (workout === undefined) return undefined;
    const sets = setsByWorkout.get(workoutId) ?? [];
    return {
      id: workout.id,
      dayName: workout.dayName,
      dateLabel: formatDayMonth(workout.startedAt, TIME_ZONE),
      timeRange: formatClockRange(workout.startedAt, workout.finishedAt, TIME_ZONE),
      tonnage: `${formatKg(Math.round(sessionTonnage(sets)))} kg`,
      durationMinutes: Math.round((workout.finishedAt.getTime() - workout.startedAt.getTime()) / 60_000),
      setCount: effectiveSets(sets).length,
    };
  };

  const summaries = data.workouts
    .map((w) => summaryOf(w.id))
    .filter((s): s is SessionSummary => s !== undefined);

  const counts = new Map<string, number>();
  for (const summary of summaries) {
    counts.set(summary.dayName, (counts.get(summary.dayName) ?? 0) + 1);
  }
  const filters = [
    { dayName: 'Todas', count: summaries.length },
    ...[...counts.entries()].map(([dayName, count]) => ({ dayName, count })),
  ];

  const detailFor = (id: number): SessionDetail | undefined => {
    const summary = summaryOf(id);
    const workout = data.workouts.find((w) => w.id === id);
    if (summary === undefined || workout === undefined) return undefined;

    const sets = setsByWorkout.get(id) ?? [];
    const rests = deriveRestSeconds(sets);
    const restValues = rests.filter((r): r is number => r !== undefined);
    const avgRestSeconds = restValues.length === 0
      ? 0
      : Math.round(restValues.reduce((a, b) => a + b, 0) / restValues.length);

    const previous = data.workouts
      .filter((w) => w.dayName === workout.dayName && w.startedAt.getTime() < workout.startedAt.getTime())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];

    const byExercise = new Map<number, MockSet[]>();
    for (const set of sets) {
      const bucket = byExercise.get(set.exerciseId) ?? [];
      bucket.push(set);
      byExercise.set(set.exerciseId, bucket);
    }

    const previousSets = previous === undefined ? [] : setsByWorkout.get(previous.id) ?? [];
    let liftsUp = 0;
    let liftsTotal = 0;

    const exercises: SessionExercise[] = [];
    for (const [exerciseId, exerciseSets] of byExercise) {
      const exercise = exerciseById.get(exerciseId);
      if (exercise === undefined) continue;

      const top = topSetOf(exercise, exerciseSets);
      const priorSets = previousSets.filter((s) => s.exerciseId === exerciseId);
      const priorTop = priorSets.length === 0 ? undefined : topSetOf(exercise, priorSets);

      let delta = 'primera vez';
      let color = 'color-mix(in srgb, var(--color-text) 55%, transparent)';
      if (top !== undefined && priorTop !== undefined) {
        liftsTotal++;
        // Same exercise on both sides, so raw weight compares correctly whether
        // or not the lift is bodyweight.
        const now = top.weightKg;
        const before = priorTop.weightKg;
        if (now > before) {
          delta = formatDelta(top.weightKg - priorTop.weightKg, 'kg'); color = ACCENT_UP; liftsUp++;
        } else if (now === before && top.reps > priorTop.reps) {
          delta = formatDelta(top.reps - priorTop.reps, 'rep'); color = ACCENT_UP; liftsUp++;
        } else if (now < before) {
          delta = formatDelta(top.weightKg - priorTop.weightKg, 'kg'); color = ACCENT_DOWN;
        } else if (now === before && top.reps < priorTop.reps) {
          delta = formatDelta(top.reps - priorTop.reps, 'rep'); color = ACCENT_DOWN;
        } else {
          delta = 'se mantiene'; color = 'color-mix(in srgb, var(--color-text) 60%, transparent)';
        }
      }

      let workingIndex = 0;
      const rows: SetRow[] = exerciseSets.map((set) => {
        const restIndex = sets.indexOf(set);
        const rest = rests[restIndex];
        if (!set.isWarmup) workingIndex++;
        return {
          label: set.isWarmup ? 'W' : String(workingIndex),
          load: formatLoad(set.weightKg, set.reps, exercise.isBodyweight),
          rpe: set.rpe === undefined ? '—' : String(set.rpe),
          rest: rest === undefined ? '—' : `${rest}s`,
          isWarmup: set.isWarmup,
        };
      });

      exercises.push({
        exerciseId, name: exercise.name,
        muscleLabel: MUSCLE_GROUP_LABELS[exercise.muscleGroup],
        topSet: top === undefined ? '—' : formatLoad(top.weightKg, top.reps, exercise.isBodyweight),
        delta, deltaColor: color, sets: rows,
      });
    }

    const detail: SessionDetail = { ...summary, avgRestSeconds, exercises };
    if (workout.notes !== undefined) detail.notes = workout.notes;

    if (previous !== undefined) {
      const priorSummary = summaryOf(previous.id);
      const tonnageDelta = sessionTonnage(sets) - sessionTonnage(previousSets);
      const durationDelta = summary.durationMinutes - (priorSummary?.durationMinutes ?? 0);
      detail.comparison = {
        prevLabel: formatDayMonth(previous.startedAt, TIME_ZONE),
        tonnageDelta: formatDelta(Math.round(tonnageDelta), 'kg'),
        tonnageColor: tonnageDelta >= 0 ? ACCENT_UP : ACCENT_DOWN,
        durationDelta: formatDelta(durationDelta, 'min'),
        liftsUp, liftsTotal,
      };
    }
    return detail;
  };

  return { filters, summaries, detailFor };
}
