import { MUSCLE_GROUP_LABELS } from '@gym-tracker/core';
import type { Dataset } from '../data/types';

export interface RoutineCard { id: number; name: string; meta: string; isActive: boolean; archived: boolean }
export interface RoutineDayChip { id: number; name: string; count: number }
export interface RoutineExerciseRow {
  id: number; exerciseId: number; name: string; muscleLabel: string;
  targetSets: number; targetRepsMin: number; targetRepsMax: number; targetRestSeconds: number;
}
export interface RoutinesModel {
  cards: RoutineCard[];
  daysFor(routineId: number): RoutineDayChip[];
  exercisesFor(routineId: number, dayId: number): RoutineExerciseRow[];
  catalog: Array<{ id: number; name: string; muscleLabel: string }>;
}

export function clampInt(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

export function buildRoutines(data: Dataset): RoutinesModel {
  const exerciseById = new Map(data.exercises.map((e) => [e.id, e]));

  const cards = data.routines.map((routine) => {
    const exerciseCount = routine.days.reduce((sum, day) => sum + day.exercises.length, 0);
    return {
      id: routine.id,
      name: routine.name,
      meta: `${routine.days.length} días · ${exerciseCount} ejercicios`,
      isActive: routine.isActive,
      archived: routine.archived,
    };
  });

  const daysFor = (routineId: number): RoutineDayChip[] => {
    const routine = data.routines.find((r) => r.id === routineId);
    if (routine === undefined) return [];
    return [...routine.days]
      .sort((a, b) => a.position - b.position)
      .map((day) => ({ id: day.id, name: day.name, count: day.exercises.length }));
  };

  const exercisesFor = (routineId: number, dayId: number): RoutineExerciseRow[] => {
    const routine = data.routines.find((r) => r.id === routineId);
    const day = routine?.days.find((d) => d.id === dayId);
    if (day === undefined) return [];
    return [...day.exercises]
      .sort((a, b) => a.position - b.position)
      .flatMap((entry) => {
        const exercise = exerciseById.get(entry.exerciseId);
        if (exercise === undefined) return [];
        return [{
          id: entry.id, exerciseId: entry.exerciseId, name: exercise.name,
          muscleLabel: MUSCLE_GROUP_LABELS[exercise.muscleGroup],
          targetSets: entry.targetSets, targetRepsMin: entry.targetRepsMin,
          targetRepsMax: entry.targetRepsMax, targetRestSeconds: entry.targetRestSeconds,
        }];
      });
  };

  const catalog = data.exercises.map((e) => ({
    id: e.id, name: e.name, muscleLabel: MUSCLE_GROUP_LABELS[e.muscleGroup],
  }));

  return { cards, daysFor, exercisesFor, catalog };
}
