export interface ParsedSet {
  exerciseName?: string;
  weightKg: number;
  reps: number;
  rpe?: number;
}

export type ParseErrorReason =
  | 'empty_input'
  | 'no_set_found'
  | 'missing_reps'
  | 'invalid_weight'
  | 'invalid_reps'
  | 'invalid_rpe';

export type ParseResult = { ok: true; value: ParsedSet } | { ok: false; reason: ParseErrorReason };

// [nombre] peso [kg|lb|lbs] x reps [rpe N] — siempre peso primero, tolerante a
// espacios, mayúsculas y coma decimal. El sufijo de unidad se IGNORA: nunca
// convierte (decisión del autor), solo evita que "100kg x 8" o "100lb x 8" se lean
// como error de formato. El nombre queda como texto crudo (matching en Fase 1).
const SET_PATTERN =
  /^(?<name>.*?)\s*(?<weight>\d+(?:[.,]\d+)?)\s*(?:kg|lbs?)?\s*[x×]\s*(?<reps>\d+)(?:\s*rpe\s*(?<rpe>\d+(?:[.,]\d+)?))?$/i;

const toNumber = (raw: string): number => Number(raw.replace(',', '.'));

export function parseSetInput(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'empty_input' };
  }
  // Un "-" inicial es un peso negativo, no un nombre de ejercicio.
  if (trimmed.startsWith('-')) {
    return { ok: false, reason: 'invalid_weight' };
  }
  const match = SET_PATTERN.exec(trimmed);
  if (!match?.groups) {
    return { ok: false, reason: /[x×]\s*$/i.test(trimmed) ? 'missing_reps' : 'no_set_found' };
  }
  const { name, weight, reps: rawReps, rpe: rawRpe } = match.groups;
  if (weight === undefined || rawReps === undefined) {
    return { ok: false, reason: 'no_set_found' };
  }

  const weightKg = toNumber(weight);
  if (!(weightKg > 0)) {
    return { ok: false, reason: 'invalid_weight' };
  }
  const reps = Number(rawReps);
  if (reps < 1) {
    return { ok: false, reason: 'invalid_reps' };
  }

  const value: ParsedSet = { weightKg, reps };
  const exerciseName = name?.trim();
  if (exerciseName) {
    value.exerciseName = exerciseName;
  }
  if (rawRpe !== undefined) {
    const rpe = toNumber(rawRpe);
    if (rpe < 1 || rpe > 10) {
      return { ok: false, reason: 'invalid_rpe' };
    }
    value.rpe = rpe;
  }
  return { ok: true, value };
}
