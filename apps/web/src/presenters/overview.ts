import {
  MUSCLE_GROUP_LABELS, detectStagnation, effectiveSets, estimate1RM, isoWeekKey,
  session1RM, sessionTonnage, weeklyVolumeByMuscleGroup,
} from '@gym-tracker/core';
import type { MuscleGroup } from '@gym-tracker/core';
import { TIME_ZONE, VOLUME_TARGET_MAX } from '../config';
import { muscleGroupMap } from '../data/mock';
import type { Dataset, MockSet } from '../data/types';
import type { HeatmapDay } from '../components/Heatmap';
import { deltaColor, formatDelta, formatKg, formatLoad } from './format';

const DAY_MS = 86_400_000;

export interface OverviewModel {
  weekLabel: string;
  kpis: Array<{ label: string; value: string; unit?: string; delta: string; deltaColor: string; caption: string }>;
  stalled: Array<{ exerciseId: number; name: string; muscleLabel: string; weeks: number; history: number[]; workingSet: string }>;
  volume: Array<{ group: MuscleGroup; label: string; count: number }>;
  volumeMax: number;
  records: Array<{ name: string; estimated1RM: string; detail: string; when: string }>;
  tonnageTrend: number[];
  heatmap: HeatmapDay[][];
}

function weekOf(date: Date): string {
  return isoWeekKey(date, TIME_ZONE);
}

export function buildOverview(data: Dataset, now: Date): OverviewModel {
  const setsByWorkout = new Map<number, MockSet[]>();
  for (const set of data.sets) {
    const bucket = setsByWorkout.get(set.workoutId) ?? [];
    bucket.push(set);
    setsByWorkout.set(set.workoutId, bucket);
  }

  const thisWeek = weekOf(now);
  const lastWeek = weekOf(new Date(now.getTime() - 7 * DAY_MS));

  const inWeek = (key: string) =>
    data.workouts.filter((w) => weekOf(w.startedAt) === key);

  const summarise = (key: string) => {
    const workouts = inWeek(key);
    const sets = workouts.flatMap((w) => setsByWorkout.get(w.id) ?? []);
    const minutes = workouts.map((w) => (w.finishedAt.getTime() - w.startedAt.getTime()) / 60_000);
    const avg = minutes.length === 0 ? 0 : minutes.reduce((a, b) => a + b, 0) / minutes.length;
    return {
      sets: effectiveSets(sets).length,
      tonnage: sessionTonnage(sets),
      sessions: workouts.length,
      avgMinutes: Math.round(avg),
    };
  };

  const current = summarise(thisWeek);
  const previous = summarise(lastWeek);

  const kpi = (label: string, value: string, delta: number, unit: string, caption: string) => ({
    label, value, delta: formatDelta(delta, unit), deltaColor: deltaColor(delta), caption,
  });

  const kpis = [
    kpi('Series totales', String(current.sets), current.sets - previous.sets, 'series', `frente a ${previous.sets} la semana pasada`),
    { ...kpi('Tonelaje', formatKg(Math.round(current.tonnage / 100) / 10), current.tonnage - previous.tonnage, 'kg', 'kg × repeticiones'), unit: 't' },
    kpi('Sesiones', String(current.sessions), current.sessions - previous.sessions, 'sesiones', `frente a ${previous.sessions} la semana pasada`),
    { ...kpi('Duración media', String(current.avgMinutes), current.avgMinutes - previous.avgMinutes, 'min', `frente a ${previous.avgMinutes} la semana pasada`), unit: 'min' },
  ];

  // Volume for the current week, from core.
  const volumeMap = weeklyVolumeByMuscleGroup(data.sets, muscleGroupMap(data.exercises), {
    weekKey: thisWeek, timeZone: TIME_ZONE,
  });
  const volume = [...volumeMap.entries()]
    .map(([group, count]) => ({ group, label: MUSCLE_GROUP_LABELS[group], count }))
    .sort((a, b) => b.count - a.count);
  const volumeMax = Math.max(VOLUME_TARGET_MAX + 4, ...volume.map((v) => v.count));

  // Stagnation, per exercise, from core.
  // Bodyweight lifts are excluded from every 1RM-derived figure. Their sets
  // carry weightKg 0 (or just the added plates), and the schema has nowhere to
  // record the athlete's own weight, so an estimated 1RM for a pull-up would be
  // a number we invented. They still count for volume, tonnage and history.
  // Revisit when the user's bodyweight becomes a stored field.
  const stalled: OverviewModel['stalled'] = [];
  for (const exercise of data.exercises) {
    if (exercise.isBodyweight) continue;
    const sets = data.sets.filter((s) => s.exerciseId === exercise.id);
    if (sets.length === 0) continue;
    const result = detectStagnation(sets, { timeZone: TIME_ZONE });
    if (!result.stagnant) continue;

    const working = effectiveSets(sets);
    const latest = working[working.length - 1];
    if (latest === undefined) continue;

    const byWeek = new Map<string, number>();
    for (const set of working) {
      const key = weekOf(set.createdAt);
      const value = estimate1RM(set.weightKg, set.reps);
      byWeek.set(key, Math.max(byWeek.get(key) ?? 0, value));
    }
    stalled.push({
      exerciseId: exercise.id,
      name: exercise.name,
      muscleLabel: MUSCLE_GROUP_LABELS[exercise.muscleGroup],
      weeks: result.weeksWithoutImprovement,
      history: [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v),
      workingSet: formatLoad(latest.weightKg, latest.reps, exercise.isBodyweight),
    });
  }
  stalled.sort((a, b) => b.weeks - a.weeks);

  // Recent records: the newest session that beat the prior best, per exercise.
  const records: OverviewModel['records'] = [];
  for (const exercise of data.exercises) {
    if (exercise.isBodyweight) continue;
    const sets = data.sets.filter((s) => s.exerciseId === exercise.id);
    const best = session1RM(sets);
    if (best === undefined) continue;
    const bestSet = effectiveSets(sets)
      .sort((a, b) => estimate1RM(b.weightKg, b.reps) - estimate1RM(a.weightKg, a.reps))[0];
    if (bestSet === undefined) continue;
    const days = Math.round((now.getTime() - bestSet.createdAt.getTime()) / DAY_MS);
    if (days > 10) continue;
    records.push({
      name: exercise.name,
      estimated1RM: `${formatKg(Math.round(best))} kg`,
      detail: formatLoad(bestSet.weightKg, bestSet.reps, exercise.isBodyweight),
      when: days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`,
    });
  }
  records.sort((a, b) => a.when.localeCompare(b.when));

  // Tonnage per week, oldest to newest.
  const tonnageByWeek = new Map<string, number>();
  for (const workout of data.workouts) {
    const key = weekOf(workout.startedAt);
    const sets = setsByWorkout.get(workout.id) ?? [];
    tonnageByWeek.set(key, (tonnageByWeek.get(key) ?? 0) + sessionTonnage(sets));
  }
  const tonnageTrend = [...tonnageByWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, value]) => value);

  // 13-week heatmap ending today; Monday-first columns.
  const trainedDays = new Map<string, number>();
  for (const workout of data.workouts) {
    const sets = setsByWorkout.get(workout.id) ?? [];
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(workout.startedAt);
    trainedDays.set(key, effectiveSets(sets).length);
  }
  const daysBack = 12 * 7 + ((now.getDay() + 6) % 7);
  const start = new Date(now.getTime() - daysBack * DAY_MS);
  const heatmap: HeatmapDay[][] = [];
  for (let i = 0; i < 91; i++) {
    const date = new Date(start.getTime() + i * DAY_MS);
    if (i % 7 === 0) heatmap.push([]);
    const column = heatmap[heatmap.length - 1];
    if (column === undefined) continue;
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
    const count = trainedDays.get(key);
    const label = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' }).format(date);
    if (count === undefined) {
      column.push({ level: 0, title: `${label} · descanso` });
    } else {
      const level = count >= 20 ? 4 : count >= 15 ? 3 : count >= 10 ? 2 : 1;
      column.push({ level, title: `${label} · ${count} series` });
    }
  }
  const lastColumn = heatmap[heatmap.length - 1];
  while (lastColumn !== undefined && lastColumn.length < 7) {
    lastColumn.push({ level: 0, title: '' });
  }

  const weekFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
  const monday = new Date(now.getTime() - ((now.getDay() + 6) % 7) * DAY_MS);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);

  return {
    weekLabel: `${weekFormat.format(monday)} – ${weekFormat.format(sunday)}`,
    kpis, stalled, volume, volumeMax, records, tonnageTrend, heatmap,
  };
}
