import type { DatabaseSync } from 'node:sqlite';

export interface BotSessionRow {
  userId: number;
  workoutId: number;
  chatId: number;
  messageId: number | null;
  currentExerciseId: number | null;
  pendingWeightKg: number | null;
  pendingReps: number | null;
  nextSetIsWarmup: boolean;
  ephemeralMessageId: number | null;
  updatedAt: number;
}

interface BotSessionRowDb {
  user_id: number;
  workout_id: number;
  chat_id: number;
  message_id: number | null;
  current_exercise_id: number | null;
  pending_weight_kg: number | null;
  pending_reps: number | null;
  next_set_is_warmup: number;
  ephemeral_message_id: number | null;
  updated_at: number;
}

const mapSession = (r: BotSessionRowDb): BotSessionRow => ({
  userId: r.user_id,
  workoutId: r.workout_id,
  chatId: r.chat_id,
  messageId: r.message_id,
  currentExerciseId: r.current_exercise_id,
  pendingWeightKg: r.pending_weight_kg,
  pendingReps: r.pending_reps,
  nextSetIsWarmup: Boolean(r.next_set_is_warmup),
  ephemeralMessageId: r.ephemeral_message_id,
  updatedAt: r.updated_at,
});

// Mapa clave-de-dominio → columna, para construir el UPDATE parcial.
const COLUMN_OF: Record<keyof Omit<BotSessionRow, 'userId'>, string> = {
  workoutId: 'workout_id',
  chatId: 'chat_id',
  messageId: 'message_id',
  currentExerciseId: 'current_exercise_id',
  pendingWeightKg: 'pending_weight_kg',
  pendingReps: 'pending_reps',
  nextSetIsWarmup: 'next_set_is_warmup',
  ephemeralMessageId: 'ephemeral_message_id',
  updatedAt: 'updated_at',
};

const SELECT =
  'SELECT user_id, workout_id, chat_id, message_id, current_exercise_id, pending_weight_kg, pending_reps, next_set_is_warmup, ephemeral_message_id, updated_at FROM bot_sessions';

export function getSession(db: DatabaseSync, userId: number): BotSessionRow | undefined {
  const row = db.prepare(`${SELECT} WHERE user_id = ?`).get(userId) as unknown as BotSessionRowDb | undefined;
  return row ? mapSession(row) : undefined;
}

export function createSession(
  db: DatabaseSync,
  params: { userId: number; workoutId: number; chatId: number; updatedAt: number },
): BotSessionRow {
  db.prepare(
    'INSERT INTO bot_sessions (user_id, workout_id, chat_id, next_set_is_warmup, updated_at) VALUES (?, ?, ?, 0, ?)',
  ).run(params.userId, params.workoutId, params.chatId, params.updatedAt);
  return {
    userId: params.userId,
    workoutId: params.workoutId,
    chatId: params.chatId,
    messageId: null,
    currentExerciseId: null,
    pendingWeightKg: null,
    pendingReps: null,
    nextSetIsWarmup: false,
    ephemeralMessageId: null,
    updatedAt: params.updatedAt,
  };
}

export function updateSession(
  db: DatabaseSync,
  userId: number,
  patch: Partial<Omit<BotSessionRow, 'userId'>>,
  updatedAt: number,
): void {
  const assignments: string[] = [];
  const values: Array<number | null> = [];
  for (const key of Object.keys(patch) as Array<keyof Omit<BotSessionRow, 'userId'>>) {
    const value = patch[key];
    if (value === undefined) {
      continue; // exactOptionalPropertyTypes: undefined significa "no tocar"
    }
    assignments.push(`${COLUMN_OF[key]} = ?`);
    values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  assignments.push('updated_at = ?');
  values.push(updatedAt);
  db.prepare(`UPDATE bot_sessions SET ${assignments.join(', ')} WHERE user_id = ?`).run(...values, userId);
}

export function deleteSession(db: DatabaseSync, userId: number): void {
  db.prepare('DELETE FROM bot_sessions WHERE user_id = ?').run(userId);
}
