import { MUSCLE_GROUPS } from '@gym-tracker/core';
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const muscleGroupList = MUSCLE_GROUPS.map((group) => `'${group}'`).join(', ');

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramUserId: integer('telegram_user_id').notNull().unique(),
  timezone: text('timezone').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const exercises = sqliteTable(
  'exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id),
    name: text('name').notNull(),
    muscleGroup: text('muscle_group', { enum: MUSCLE_GROUPS }).notNull(),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [check('exercises_muscle_group_check', sql.raw(`muscle_group IN (${muscleGroupList})`))],
);

export const routines = sqliteTable('routines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const routineDays = sqliteTable('routine_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  routineId: integer('routine_id').notNull().references(() => routines.id),
  name: text('name').notNull(),
  position: integer('position').notNull(),
});

export const routineExercises = sqliteTable('routine_exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  routineDayId: integer('routine_day_id').notNull().references(() => routineDays.id),
  exerciseId: integer('exercise_id').notNull().references(() => exercises.id),
  position: integer('position').notNull(),
  targetSets: integer('target_sets'),
  targetRepsMin: integer('target_reps_min'),
  targetRepsMax: integer('target_reps_max'),
  targetRestSeconds: integer('target_rest_seconds'),
});

export const workouts = sqliteTable(
  'workouts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id),
    routineDayId: integer('routine_day_id').references(() => routineDays.id),
    dayNameSnapshot: text('day_name_snapshot'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
  },
  (table) => [index('workouts_user_started_idx').on(table.userId, table.startedAt)],
);

export const sets = sqliteTable(
  'sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutId: integer('workout_id').notNull().references(() => workouts.id),
    exerciseId: integer('exercise_id').notNull().references(() => exercises.id),
    position: integer('position').notNull(),
    weightKg: real('weight_kg').notNull(),
    reps: integer('reps').notNull(),
    rpe: real('rpe'),
    restSeconds: integer('rest_seconds'),
    isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('sets_workout_idx').on(table.workoutId),
    index('sets_exercise_created_idx').on(table.exerciseId, table.createdAt),
  ],
);

export const processedUpdates = sqliteTable('processed_updates', {
  updateId: integer('update_id').primaryKey(),
  processedAt: integer('processed_at', { mode: 'timestamp_ms' }).notNull(),
});

export const botSessions = sqliteTable('bot_sessions', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id),
  workoutId: integer('workout_id')
    .notNull()
    .references(() => workouts.id),
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id'),
  currentExerciseId: integer('current_exercise_id').references(() => exercises.id),
  pendingWeightKg: real('pending_weight_kg'),
  pendingReps: integer('pending_reps'),
  nextSetIsWarmup: integer('next_set_is_warmup', { mode: 'boolean' }).notNull().default(false),
  ephemeralMessageId: integer('ephemeral_message_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
