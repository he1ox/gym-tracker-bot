export const WEIGHT_STEP = 2.5;
export const REP_STEP = 1;

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
} as const;

export type CallbackAction =
  | { type: 'day'; routineDayId: number }
  | { type: 'ex'; exerciseId: number }
  | { type: 'free' }
  | { type: 'rec' }
  | { type: 'weight'; delta: number }
  | { type: 'reps'; delta: number }
  | { type: 'warmup' }
  | { type: 'list' }
  | { type: 'add' }
  | { type: 'rest_cancel' }
  | { type: 'unknown' };

function parseIdSuffix(data: string, prefix: string): number | undefined {
  const raw = data.slice(prefix.length);
  // Solo acepta dígitos decimales canónicos con valor > 0
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return n > 0 ? n : undefined;
}

export function parseCallback(data: string): CallbackAction {
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
      return { type: 'weight', delta: WEIGHT_STEP };
    case CB.wMinus:
      return { type: 'weight', delta: -WEIGHT_STEP };
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
