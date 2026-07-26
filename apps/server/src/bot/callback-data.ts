import { MUSCLE_GROUPS } from '@gym-tracker/core';

export const REP_STEP = 1;

// Origen del selector de ejercicios. Un solo carácter para no gastar los 64 bytes
// de callback_data. 'c' = captura (y wizard de rutinas, que consume sus propios
// updates dentro de la conversación); 'l' = /last. Sin este segmento, el handler
// de /last —registrado antes que el catch-all de capture.ts en bot.ts— se quedaría
// con los pulsados durante una sesión de captura.
export type PickOrigin = 'c' | 'l';

const isPickOrigin = (value: string): value is PickOrigin => value === 'c' || value === 'l';

export const CB = {
  day: (id: number): string => `day:${id}`,
  ex: (id: number): string => `ex:${id}`,
  free: 'free',
  rec: 'rec',
  wPlus: 'w+',
  wMinus: 'w-',
  rPlus: 'r+',
  rMinus: 'r-',
  warmup: 'wu',
  list: 'list',
  add: 'add',
  restCancel: 'rest:cancel',
  pickGroups: (origin: PickOrigin): string => `pick:${origin}:g`,
  pickGroup: (origin: PickOrigin, groupIndex: number, offset: number): string =>
    `pick:${origin}:g:${groupIndex}:${offset}`,
  pickExercise: (origin: PickOrigin, exerciseId: number): string => `pick:${origin}:x:${exerciseId}`,
  pickSearch: (origin: PickOrigin): string => `pick:${origin}:s`,
  // Espacio de la bienvenida (spec §10). Estos NO pasan por parseCallback: sus
  // handlers usan los filtros por cadena exacta de grammY y se registran ANTES
  // del catch-all de capture.ts, igual que 'newroutine' en routines-wizard.ts.
  wcStart: 'wc:s',
  wcRoutines: 'wc:r',
  wcHistory: 'wc:l',
  wcHelp: 'wc:h',
  wcBack: 'wc:b',
  // Espacio de /settings. Como wc:*, estos NO pasan por parseCallback: sus handlers
  // usan filtros por cadena exacta y se registran ANTES del catch-all de capture.ts.
  setLocale: (locale: string): string => `set:l:${locale}`,
  setUnit: (unit: string): string => `set:u:${unit}`,
  setStep: (step: number): string => `set:s:${step}`,
} as const;

export type CallbackAction =
  | { type: 'day'; routineDayId: number }
  | { type: 'ex'; exerciseId: number }
  | { type: 'free' }
  | { type: 'rec' }
  | { type: 'weight'; direction: 1 | -1 }
  | { type: 'reps'; delta: number }
  | { type: 'warmup' }
  | { type: 'list' }
  | { type: 'add' }
  | { type: 'rest_cancel' }
  | { type: 'pick_groups'; origin: PickOrigin }
  | { type: 'pick_group'; origin: PickOrigin; groupIndex: number; offset: number }
  | { type: 'pick_exercise'; origin: PickOrigin; exerciseId: number }
  | { type: 'pick_search'; origin: PickOrigin }
  | { type: 'unknown' };

function parseIdSuffix(data: string, prefix: string): number | undefined {
  const raw = data.slice(prefix.length);
  // Solo acepta dígitos decimales canónicos con valor > 0
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return n > 0 ? n : undefined;
}

// Dígitos decimales canónicos, sin signo ni notación alternativa, igual que parseIdSuffix.
function parseDecimal(raw: string): number | undefined {
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
}

function parsePick(data: string): CallbackAction {
  const parts = data.split(':'); // ['pick', origin, screen, ...]
  const origin = parts[1];
  const screen = parts[2];
  if (origin === undefined || !isPickOrigin(origin) || screen === undefined) {
    return { type: 'unknown' };
  }
  if (screen === 'g' && parts.length === 3) {
    return { type: 'pick_groups', origin };
  }
  if (screen === 'g' && parts.length === 5) {
    const groupIndex = parseDecimal(parts[3] ?? '');
    const offset = parseDecimal(parts[4] ?? '');
    if (groupIndex === undefined || offset === undefined || groupIndex >= MUSCLE_GROUPS.length) {
      return { type: 'unknown' };
    }
    return { type: 'pick_group', origin, groupIndex, offset };
  }
  if (screen === 'x' && parts.length === 4) {
    const exerciseId = parseDecimal(parts[3] ?? '');
    if (exerciseId === undefined || exerciseId <= 0) {
      return { type: 'unknown' };
    }
    return { type: 'pick_exercise', origin, exerciseId };
  }
  if (screen === 's' && parts.length === 3) {
    return { type: 'pick_search', origin };
  }
  return { type: 'unknown' };
}

export function parseCallback(data: string): CallbackAction {
  if (data.startsWith('pick:')) {
    return parsePick(data);
  }
  if (data.startsWith('day:')) {
    const routineDayId = parseIdSuffix(data, 'day:');
    return routineDayId === undefined ? { type: 'unknown' } : { type: 'day', routineDayId };
  }
  if (data.startsWith('ex:')) {
    const exerciseId = parseIdSuffix(data, 'ex:');
    return exerciseId === undefined ? { type: 'unknown' } : { type: 'ex', exerciseId };
  }
  switch (data) {
    case CB.free:
      return { type: 'free' };
    case CB.rec:
      return { type: 'rec' };
    case CB.wPlus:
      // Solo la dirección: el incremento es una preferencia del usuario y este
      // parser debe seguir siendo puro (sin leer el estado global de i18n).
      return { type: 'weight', direction: 1 };
    case CB.wMinus:
      return { type: 'weight', direction: -1 };
    case CB.rPlus:
      return { type: 'reps', delta: REP_STEP };
    case CB.rMinus:
      return { type: 'reps', delta: -REP_STEP };
    case CB.warmup:
      return { type: 'warmup' };
    case CB.list:
      return { type: 'list' };
    case CB.add:
      return { type: 'add' };
    case CB.restCancel:
      return { type: 'rest_cancel' };
    default:
      return { type: 'unknown' };
  }
}
