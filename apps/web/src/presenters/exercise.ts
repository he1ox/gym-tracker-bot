import {
  MUSCLE_GROUP_LABELS, deriveRestSeconds, effectiveSets, estimate1RM, isoWeekKey, sessionTonnage,
} from '@gym-tracker/core';
import { TIME_ZONE } from '../config';
import type { Dataset, MockSet } from '../data/types';
import { formatDayMonth, formatKg, formatLoad } from './format';
import type { SetRow } from './sessions';

export interface ExercisePoint { weekKey: string; estimated1RM: number; isRecord: boolean }

export interface ExerciseModel {
  exerciseId: number; name: string; muscleLabel: string;
  current1RM: string; best1RM: string; totalSets: number; avgRestSeconds: number;
  isBodyweight: boolean;
  trend: ExercisePoint[];
  recordCount: number;
  sessionVolume: Array<{ workoutId: number; dateLabel: string; tonnage: number; tonnageLabel: string; percent: number }>;
  volumeMax: number;
  history: Array<{ workoutId: number; dateLabel: string; dayName: string; sets: SetRow[] }>;
  bestEver: string; mostRecent: string;
}

export function firstExerciseId(data: Dataset): number | undefined {
  return data.exercises[0]?.id;
}

export function buildExercise(data: Dataset, exerciseId: number): ExerciseModel | undefined {
  const exercise = data.exercises.find((e) => e.id === exerciseId);
  if (exercise === undefined) return undefined;

  const own = data.sets.filter((s) => s.exerciseId === exerciseId);
  if (own.length === 0) return undefined;

  const working = effectiveSets(own);

  // Bodyweight lifts get no 1RM trend: the schema records no athlete weight, so
  // any estimate would be invented. Their volume and set history still render.
  const oneRM = (set: MockSet) => estimate1RM(set.weightKg, set.reps);
  const byWeek = new Map<string, number>();
  if (!exercise.isBodyweight) {
    for (const set of working) {
      const key = isoWeekKey(set.createdAt, TIME_ZONE);
      byWeek.set(key, Math.max(byWeek.get(key) ?? 0, oneRM(set)));
    }
  }
  let running = 0;
  const trend: ExercisePoint[] = [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([weekKey, value]) => {
      const isRecord = value > running;
      if (isRecord) running = value;
      return { weekKey, estimated1RM: value, isRecord };
    });

  // Per-session volume and history, newest first.
  const workoutIds = [...new Set(own.map((s) => s.workoutId))];
  const sessions = workoutIds
    .flatMap((id) => {
      const workout = data.workouts.find((w) => w.id === id);
      return workout === undefined ? [] : [workout];
    })
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const rawSessionVolume = sessions.map((workout) => ({
    workoutId: workout.id,
    dateLabel: formatDayMonth(workout.startedAt, TIME_ZONE),
    tonnage: sessionTonnage(own.filter((s) => s.workoutId === workout.id)),
  }));
  const volumeMax = Math.max(1, ...rawSessionVolume.map((v) => v.tonnage));
  const sessionVolume = rawSessionVolume.map((entry) => ({
    ...entry,
    tonnageLabel: `${formatKg(Math.round(entry.tonnage))} kg`,
    percent: (entry.tonnage / volumeMax) * 100,
  }));

  // Rest is measured within a workout only: `position` restarts every
  // workout, so gaps computed across the whole exercise history would span
  // days. Collect the per-workout gaps (like `history` below does) and
  // average those, never the raw cross-workout deltas.
  const allRestValues: number[] = [];
  const history = sessions.map((workout) => {
    const sets = own.filter((s) => s.workoutId === workout.id).sort((a, b) => a.position - b.position);
    const rests = deriveRestSeconds(sets);
    allRestValues.push(...rests.filter((r): r is number => r !== undefined));
    let index = 0;
    return {
      workoutId: workout.id,
      dateLabel: formatDayMonth(workout.startedAt, TIME_ZONE),
      dayName: workout.dayName,
      sets: sets.map((set, i): SetRow => {
        if (!set.isWarmup) index++;
        const rest = rests[i];
        return {
          label: set.isWarmup ? 'W' : String(index),
          load: formatLoad(set.weightKg, set.reps, exercise.isBodyweight),
          rpe: set.rpe === undefined ? '—' : String(set.rpe),
          rest: rest === undefined ? '—' : `${rest}s`,
          isWarmup: set.isWarmup,
        };
      }),
    };
  });

  const bestSet = exercise.isBodyweight
    ? [...working].sort((a, b) => b.weightKg - a.weightKg || b.reps - a.reps)[0]
    : [...working].sort((a, b) => oneRM(b) - oneRM(a))[0];
  const latestSet = [...working].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const latestWeek = trend[trend.length - 1];

  return {
    exerciseId,
    name: exercise.name,
    muscleLabel: MUSCLE_GROUP_LABELS[exercise.muscleGroup],
    current1RM: exercise.isBodyweight ? '—' : `${formatKg(Math.round(latestWeek?.estimated1RM ?? 0))} kg`,
    best1RM: exercise.isBodyweight ? '—' : `${formatKg(Math.round(running))} kg`,
    totalSets: working.length,
    avgRestSeconds: allRestValues.length === 0
      ? 0
      : Math.round(allRestValues.reduce((a, b) => a + b, 0) / allRestValues.length),
    isBodyweight: exercise.isBodyweight,
    trend,
    recordCount: trend.filter((p) => p.isRecord).length,
    sessionVolume,
    volumeMax,
    history,
    bestEver: bestSet === undefined ? '—' : formatLoad(bestSet.weightKg, bestSet.reps, exercise.isBodyweight),
    mostRecent: latestSet === undefined ? '—' : formatLoad(latestSet.weightKg, latestSet.reps, exercise.isBodyweight),
  };
}
