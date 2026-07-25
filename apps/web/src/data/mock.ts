import type { MuscleGroup } from '@gym-tracker/core';
import type { Dataset, MockExercise, MockRoutine, MockSet, MockWorkout } from './types';

const DAY_MS = 86_400_000;

interface Template {
  name: string;
  muscleGroup: MuscleGroup;
  weightKg: number;
  isBodyweight?: boolean;
  reps: readonly number[];
  rpe: readonly number[];
  restSeconds: number;
  warmups?: ReadonlyArray<readonly [number, number]>;
}

const DAY_TEMPLATES: Record<string, readonly Template[]> = {
  Empuje: [
    { name: 'Press banca', muscleGroup: 'chest', weightKg: 95, reps: [8, 8, 6], rpe: [7, 8, 9], restSeconds: 165, warmups: [[40, 8], [70, 5]] },
    { name: 'Press militar', muscleGroup: 'front_delt', weightKg: 57.5, reps: [8, 7, 6], rpe: [8, 8, 9], restSeconds: 150, warmups: [[20, 8]] },
    { name: 'Press inclinado con mancuernas', muscleGroup: 'chest', weightKg: 32, reps: [10, 10, 9], rpe: [8, 8, 9], restSeconds: 95 },
    { name: 'Elevaciones laterales', muscleGroup: 'side_delt', weightKg: 12, reps: [15, 15, 14], rpe: [8, 9, 9], restSeconds: 60 },
    { name: 'Extensión de tríceps en polea', muscleGroup: 'triceps', weightKg: 30, reps: [13, 12, 11], rpe: [8, 9, 9], restSeconds: 60 },
  ],
  Tirón: [
    { name: 'Peso muerto', muscleGroup: 'lower_back', weightKg: 170, reps: [4, 4, 3], rpe: [8, 8, 9], restSeconds: 210, warmups: [[60, 5], [110, 3]] },
    { name: 'Remo con barra', muscleGroup: 'upper_back', weightKg: 82.5, reps: [9, 8, 8], rpe: [8, 8, 9], restSeconds: 120 },
    { name: 'Jalón al pecho', muscleGroup: 'lats', weightKg: 68, reps: [11, 10, 10], rpe: [8, 9, 9], restSeconds: 90 },
    { name: 'Face pull', muscleGroup: 'rear_delt', weightKg: 25, reps: [15, 15, 15], rpe: [8, 8, 9], restSeconds: 60 },
    { name: 'Curl con barra', muscleGroup: 'biceps', weightKg: 35, reps: [10, 9, 8], rpe: [8, 9, 9], restSeconds: 60 },
  ],
  Pierna: [
    { name: 'Sentadilla trasera', muscleGroup: 'quads', weightKg: 135, reps: [6, 5, 5], rpe: [8, 8, 9], restSeconds: 180, warmups: [[60, 5], [100, 3]] },
    { name: 'Peso muerto rumano', muscleGroup: 'hamstrings', weightKg: 110, reps: [9, 8, 8], rpe: [8, 8, 9], restSeconds: 150 },
    { name: 'Prensa', muscleGroup: 'quads', weightKg: 220, reps: [12, 11, 10], rpe: [8, 9, 9], restSeconds: 120 },
    { name: 'Curl femoral', muscleGroup: 'hamstrings', weightKg: 55, reps: [13, 12, 11], rpe: [8, 9, 9], restSeconds: 75 },
    { name: 'Elevación de gemelos', muscleGroup: 'calves', weightKg: 90, reps: [15, 14, 13], rpe: [8, 9, 9], restSeconds: 60 },
  ],
  Libre: [
    { name: 'Dominadas', muscleGroup: 'lats', weightKg: 0, isBodyweight: true, reps: [10, 9, 8], rpe: [8, 9, 9], restSeconds: 100 },
    { name: 'Fondos', muscleGroup: 'chest', weightKg: 0, isBodyweight: true, reps: [12, 11, 10], rpe: [8, 9, 9], restSeconds: 90 },
    { name: 'Curl martillo', muscleGroup: 'biceps', weightKg: 16, reps: [12, 11, 10], rpe: [8, 9, 9], restSeconds: 60 },
  ],
};

const RECENT_SCHEDULE: ReadonlyArray<{ daysAgo: number; dayName: string; notes?: string }> = [
  { daysAgo: 1, dayName: 'Tirón', notes: 'El agarre falló en la última serie de peso muerto. La próxima, con correas.' },
  { daysAgo: 2, dayName: 'Pierna' },
  { daysAgo: 3, dayName: 'Empuje' },
  { daysAgo: 5, dayName: 'Libre', notes: 'Sesión corta entre reuniones, solo trabajo de bombeo.' },
  { daysAgo: 6, dayName: 'Tirón' },
  { daysAgo: 7, dayName: 'Pierna', notes: 'La rodilla izquierda tirante en sentadilla; me quedé en RPE 8.' },
  { daysAgo: 8, dayName: 'Empuje' },
  { daysAgo: 10, dayName: 'Tirón' },
  { daysAgo: 11, dayName: 'Pierna' },
  { daysAgo: 12, dayName: 'Empuje' },
  { daysAgo: 14, dayName: 'Tirón' },
  { daysAgo: 15, dayName: 'Pierna' },
  { daysAgo: 16, dayName: 'Empuje' },
  { daysAgo: 19, dayName: 'Tirón' },
  { daysAgo: 20, dayName: 'Pierna' },
  { daysAgo: 21, dayName: 'Empuje' },
  { daysAgo: 23, dayName: 'Tirón' },
  { daysAgo: 24, dayName: 'Pierna' },
  { daysAgo: 25, dayName: 'Empuje' },
  { daysAgo: 28, dayName: 'Tirón' },
  { daysAgo: 29, dayName: 'Pierna' },
  { daysAgo: 30, dayName: 'Empuje' },
];

/**
 * Older sessions, generated: the same three-day cycle stretching back about
 * thirteen weeks. SPEC §8.1 asks for a tonnage trend over the last 8-12 weeks
 * and a three-month consistency heatmap, which the recent block alone cannot
 * fill — it only spans five ISO weeks.
 */
function olderSchedule(): Array<{ daysAgo: number; dayName: string }> {
  const cycle = ['Empuje', 'Tirón', 'Pierna'] as const;
  const out: Array<{ daysAgo: number; dayName: string }> = [];
  let index = 0;
  let daysAgo = 33;
  while (daysAgo <= 90) {
    const dayName = cycle[index % cycle.length];
    if (dayName !== undefined) out.push({ daysAgo, dayName });
    index++;
    // A rest day after each completed cycle.
    daysAgo += index % cycle.length === 0 ? 3 : 2;
  }
  return out;
}

const SCHEDULE: ReadonlyArray<{ daysAgo: number; dayName: string; notes?: string }> = [
  ...RECENT_SCHEDULE,
  ...olderSchedule(),
];

const COMPOUND = /banca|militar|peso muerto|remo con barra|sentadilla|dominadas/i;

/**
 * Lifts that stopped progressing. Their weight is flat across the most recent
 * PLATEAU_SESSIONS + 1 occurrences, so detectStagnation has something real to
 * find — the stagnation block is the headline of the overview screen.
 */
const PLATEAUED = new Set(['Press banca', 'Press militar', 'Remo con barra']);
const PLATEAU_SESSIONS = 5;

function increment(template: Template): number {
  if (COMPOUND.test(template.name)) return 2.5;
  return template.weightKg > 60 ? 5 : 1;
}

/** Newest session is 0. Plateaued lifts collapse their recent steps to zero. */
function progressionSteps(template: Template, stepsBack: number): number {
  if (!PLATEAUED.has(template.name)) return stepsBack;
  return Math.max(0, stepsBack - PLATEAU_SESSIONS);
}

/**
 * The oldest sessions must not walk a light lift down to zero: core's
 * estimate1RM rejects a non-positive weight. Floor every loaded lift at 40% of
 * its current working weight, rounded to the nearest half kilo.
 */
function floorWeight(baseKg: number): number {
  return Math.max(1, Math.round(baseKg * 0.4 * 2) / 2);
}

function buildExercises(): MockExercise[] {
  const seen = new Map<string, MockExercise>();
  let nextId = 1;
  for (const templates of Object.values(DAY_TEMPLATES)) {
    for (const template of templates) {
      if (seen.has(template.name)) continue;
      seen.set(template.name, {
        id: nextId++,
        name: template.name,
        muscleGroup: template.muscleGroup,
        isBodyweight: template.isBodyweight === true,
      });
    }
  }
  return [...seen.values()];
}

function buildRoutines(exercises: readonly MockExercise[]): MockRoutine[] {
  const byName = new Map(exercises.map((e) => [e.name, e]));
  let nextId = 1;
  const day = (name: string, position: number, names: readonly string[]) => ({
    id: nextId++,
    name,
    position,
    exercises: names.flatMap((exerciseName, index) => {
      const exercise = byName.get(exerciseName);
      if (exercise === undefined) return [];
      const compound = COMPOUND.test(exerciseName);
      return [{
        id: nextId++,
        exerciseId: exercise.id,
        position: index,
        targetSets: compound ? 4 : 3,
        targetRepsMin: compound ? 5 : 8,
        targetRepsMax: compound ? 8 : 12,
        targetRestSeconds: compound ? 150 : 90,
      }];
    }),
  });

  return [
    {
      id: 1,
      name: 'Empuje / Tirón / Pierna',
      isActive: true,
      archived: false,
      days: [
        day('Empuje', 0, DAY_TEMPLATES['Empuje']?.map((t) => t.name) ?? []),
        day('Tirón', 1, DAY_TEMPLATES['Tirón']?.map((t) => t.name) ?? []),
        day('Pierna', 2, DAY_TEMPLATES['Pierna']?.map((t) => t.name) ?? []),
      ],
    },
    {
      id: 2,
      name: 'Cuerpo completo 3×',
      isActive: false,
      archived: true,
      days: [
        day('A', 0, ['Sentadilla trasera', 'Press banca', 'Remo con barra', 'Curl con barra']),
        day('B', 1, ['Peso muerto', 'Press militar', 'Jalón al pecho', 'Prensa']),
      ],
    },
  ];
}

export function muscleGroupMap(exercises: readonly MockExercise[]): Map<number, MuscleGroup> {
  return new Map(exercises.map((e) => [e.id, e.muscleGroup]));
}

export function buildDataset(now: Date = new Date()): Dataset {
  const exercises = buildExercises();
  const byName = new Map(exercises.map((e) => [e.name, e]));

  // Chronological order so each day's occurrence index drives the progression.
  const chronological = [...SCHEDULE].sort((a, b) => b.daysAgo - a.daysAgo);
  const occurrences = new Map<string, number>();
  const indexed = chronological.map((entry) => {
    const occurrence = occurrences.get(entry.dayName) ?? 0;
    occurrences.set(entry.dayName, occurrence + 1);
    return { ...entry, occurrence };
  });

  const workouts: MockWorkout[] = [];
  const sets: MockSet[] = [];
  let workoutId = 1;
  let setId = 1;

  for (const entry of indexed) {
    const templates = DAY_TEMPLATES[entry.dayName];
    if (templates === undefined) continue;

    const latest = (occurrences.get(entry.dayName) ?? 1) - 1;
    const stepsBack = latest - entry.occurrence;
    const startedAt = new Date(now.getTime() - entry.daysAgo * DAY_MS);
    startedAt.setHours(18, 30, 0, 0);

    let cursor = startedAt.getTime();
    let position = 0;

    for (const template of templates) {
      const weight = template.isBodyweight === true
        ? template.weightKg
        : Math.max(
            floorWeight(template.weightKg),
            template.weightKg - increment(template) * progressionSteps(template, stepsBack),
          );

      for (const [warmWeight, warmReps] of template.warmups ?? []) {
        cursor += 60_000;
        sets.push({
          id: setId++, workoutId, exerciseId: byName.get(template.name)?.id ?? 0,
          position: position++, weightKg: warmWeight, reps: warmReps,
          isWarmup: true, createdAt: new Date(cursor),
        });
      }

      template.reps.forEach((reps, index) => {
        cursor += template.restSeconds * 1000 + 48_000;
        const rpe = template.rpe[index];
        sets.push({
          id: setId++, workoutId, exerciseId: byName.get(template.name)?.id ?? 0,
          position: position++, weightKg: weight, reps,
          // exactOptionalPropertyTypes: spread the key only when present.
          ...(rpe === undefined ? {} : { rpe }),
          isWarmup: false, createdAt: new Date(cursor),
        });
      });
    }

    workouts.push({
      id: workoutId, dayName: entry.dayName,
      startedAt, finishedAt: new Date(cursor),
      ...(entry.notes === undefined ? {} : { notes: entry.notes }),
    });
    workoutId++;
  }

  // Newest first, the order every screen displays.
  workouts.reverse();
  return { exercises, workouts, sets, routines: buildRoutines(exercises) };
}
