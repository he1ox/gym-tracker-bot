import type { MuscleGroup } from '@gym-tracker/core';

export interface MockExercise {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  /** Pull-ups and dips: the load is bodyweight plus any added plates. */
  isBodyweight: boolean;
}

export interface MockSet {
  id: number;
  workoutId: number;
  exerciseId: number;
  position: number;
  weightKg: number;
  reps: number;
  rpe?: number;
  isWarmup: boolean;
  createdAt: Date;
}

export interface MockWorkout {
  id: number;
  dayName: string;
  startedAt: Date;
  finishedAt: Date;
  notes?: string;
}

export interface MockRoutineExercise {
  id: number;
  exerciseId: number;
  position: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetRestSeconds: number;
}

export interface MockRoutineDay {
  id: number;
  name: string;
  position: number;
  exercises: MockRoutineExercise[];
}

export interface MockRoutine {
  id: number;
  name: string;
  isActive: boolean;
  archived: boolean;
  days: MockRoutineDay[];
}

export interface Dataset {
  exercises: MockExercise[];
  workouts: MockWorkout[];
  sets: MockSet[];
  routines: MockRoutine[];
}
