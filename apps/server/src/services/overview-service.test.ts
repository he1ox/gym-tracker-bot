import {
  MIGRATIONS_DIR,
  createUser,
  createWorkout,
  insertSet,
  openDatabase,
  runMigrations,
} from '@gym-tracker/db';
import { describe, expect, it } from 'vitest';
import { buildUserOverview } from './overview-service';

const DAY = 86_400_000;
const TZ = 'America/Mexico_City'; // UTC-6 fijo: la aritmética del test es legible
// 2026-07-25 12:00 local = 18:00 UTC
const NOW = Date.UTC(2026, 6, 25, 18, 0);
// 00:00 local del 25 = 06:00 UTC
const TODAY_START = Date.UTC(2026, 6, 25, 6, 0);

function baseDb() {
  const d = openDatabase(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  createUser(d, { telegramUserId: 111, timezone: TZ, locale: 'es', createdAt: 0 });
  return d;
}

function addSet(
  d: ReturnType<typeof baseDb>,
  createdAt: number,
  over: { weightKg?: number; reps?: number; isWarmup?: boolean } = {},
) {
  const w = createWorkout(d, { userId: 1, routineDayId: null, dayNameSnapshot: null, startedAt: createdAt });
  insertSet(d, {
    workoutId: w.id,
    exerciseId: 1,
    position: 1,
    weightKg: over.weightKg ?? 100,
    reps: over.reps ?? 5,
    rpe: null,
    restSeconds: null,
    isWarmup: over.isWarmup ?? false,
    createdAt,
  });
}

describe('buildUserOverview', () => {
  it('anchors the window to the start of the local day, not to the current time', () => {
    const d = baseDb();
    addSet(d, TODAY_START); // 00:00 local de hoy: dentro
    addSet(d, TODAY_START - 1); // un ms antes: ayer, también dentro (día 2 de 30)
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.effectiveSets.current).toBe(2);
  });

  it('includes a set 29 local days ago and excludes one 30 days ago', () => {
    const d = baseDb();
    addSet(d, TODAY_START - 29 * DAY); // primer instante de la ventana
    addSet(d, TODAY_START - 29 * DAY - 1); // un ms fuera: cae en la anterior
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.effectiveSets.current).toBe(1);
    expect(overview.effectiveSets.previous).toBe(1);
  });

  it('excludes what falls before the previous window entirely', () => {
    const d = baseDb();
    addSet(d, TODAY_START - 59 * DAY); // primer instante de la ventana anterior
    addSet(d, TODAY_START - 59 * DAY - 1); // fuera de las dos
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.effectiveSets.current).toBe(0);
    expect(overview.effectiveSets.previous).toBe(1);
  });

  it('ignores warmup sets in every figure', () => {
    const d = baseDb();
    addSet(d, TODAY_START, { isWarmup: true, weightKg: 200 });
    addSet(d, TODAY_START, { weightKg: 60, reps: 10 });
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.effectiveSets.current).toBe(1);
    expect(overview.reps.current).toBe(10);
    expect(overview.tonnageKg.current).toBe(600);
    expect(overview.heaviest.current).toBe(60); // no el calentamiento de 200
  });

  it('returns an all-zero overview for a user with no data at all', () => {
    const d = baseDb();
    const overview = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    expect(overview.workouts.current).toBe(0);
    expect(overview.heaviest.exerciseName).toBeNull();
    expect(overview.tonnageKg.changePercent).toBeNull();
  });

  it('does not move between two sets recorded minutes apart', () => {
    const d = baseDb();
    addSet(d, TODAY_START + 3_600_000);
    const first = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW });
    const later = buildUserOverview(d, { userId: 1, timezone: TZ, now: NOW + 5 * 60_000 });
    expect(later.effectiveSets).toEqual(first.effectiveSets);
    expect(later.workouts).toEqual(first.workouts);
  });
});
