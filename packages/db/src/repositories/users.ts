import type { DatabaseSync } from 'node:sqlite';

export type Locale = 'es' | 'en';
export type WeightUnit = 'kg' | 'lb';

export interface UserRow {
  id: number;
  telegramUserId: number;
  timezone: string;
  locale: Locale;
  weightUnit: WeightUnit;
  weightStep: number;
  createdAt: number;
}

interface UserRowDb {
  id: number;
  telegram_user_id: number;
  timezone: string;
  locale: Locale;
  weight_unit: WeightUnit;
  weight_step: number;
  created_at: number;
}

const mapUser = (r: UserRowDb): UserRow => ({
  id: r.id,
  telegramUserId: r.telegram_user_id,
  timezone: r.timezone,
  locale: r.locale,
  weightUnit: r.weight_unit,
  weightStep: r.weight_step,
  createdAt: r.created_at,
});

const SELECT =
  'SELECT id, telegram_user_id, timezone, locale, weight_unit, weight_step, created_at FROM users';

export function getUserByTelegramId(db: DatabaseSync, telegramUserId: number): UserRow | undefined {
  const row = db.prepare(`${SELECT} WHERE telegram_user_id = ?`).get(telegramUserId) as
    | UserRowDb
    | undefined;
  return row ? mapUser(row) : undefined;
}

export function createUser(
  db: DatabaseSync,
  params: { telegramUserId: number; timezone: string; locale: Locale; createdAt: number },
): UserRow {
  const info = db
    .prepare('INSERT INTO users (telegram_user_id, timezone, locale, created_at) VALUES (?, ?, ?, ?)')
    .run(params.telegramUserId, params.timezone, params.locale, params.createdAt);
  return {
    id: Number(info.lastInsertRowid),
    telegramUserId: params.telegramUserId,
    timezone: params.timezone,
    locale: params.locale,
    weightUnit: 'kg',
    weightStep: 2.5,
    createdAt: params.createdAt,
  };
}

export interface UserPreferencesPatch {
  locale?: Locale;
  weightUnit?: WeightUnit;
  weightStep?: number;
}

/** Solo escribe los campos presentes en el patch; un patch vacío no hace nada. */
export function updateUserPreferences(
  db: DatabaseSync,
  userId: number,
  patch: UserPreferencesPatch,
): void {
  const assignments: string[] = [];
  const values: Array<string | number> = [];
  if (patch.locale !== undefined) {
    assignments.push('locale = ?');
    values.push(patch.locale);
  }
  if (patch.weightUnit !== undefined) {
    assignments.push('weight_unit = ?');
    values.push(patch.weightUnit);
  }
  if (patch.weightStep !== undefined) {
    assignments.push('weight_step = ?');
    values.push(patch.weightStep);
  }
  if (assignments.length === 0) {
    return;
  }
  db.prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`).run(...values, userId);
}
