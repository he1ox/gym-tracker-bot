import { describe, expect, it } from 'vitest';
import { parseSetInput } from './set-parser';

describe('parseSetInput — valid inputs', () => {
  const cases: Array<[string, object]> = [
    ['60x8', { weightKg: 60, reps: 8 }],
    ['60 x 8', { weightKg: 60, reps: 8 }],
    ['60X8', { weightKg: 60, reps: 8 }],
    ['60×8', { weightKg: 60, reps: 8 }],
    ['  60x8  ', { weightKg: 60, reps: 8 }],
    ['32,5x10', { weightKg: 32.5, reps: 10 }],
    ['32.5x10', { weightKg: 32.5, reps: 10 }],
    ['100kg x 5', { weightKg: 100, reps: 5 }],
    // El sufijo de unidad se ignora: nunca convierte, solo evita el error de formato.
    ['100lb x 8', { weightKg: 100, reps: 8 }],
    ['100lbs x 8', { weightKg: 100, reps: 8 }],
    ['60x8 rpe8', { weightKg: 60, reps: 8, rpe: 8 }],
    ['60x8 rpe 8.5', { weightKg: 60, reps: 8, rpe: 8.5 }],
    ['60x8 RPE8,5', { weightKg: 60, reps: 8, rpe: 8.5 }],
    ['press inclinado 32.5x10', { exerciseName: 'press inclinado', weightKg: 32.5, reps: 10 }],
    ['Press Banca 60x8 rpe9', { exerciseName: 'Press Banca', weightKg: 60, reps: 8, rpe: 9 }],
    ['extension x cuerda 30x10', { exerciseName: 'extension x cuerda', weightKg: 30, reps: 10 }],
  ];

  it.each(cases)('parses %s', (input, expected) => {
    expect(parseSetInput(input)).toEqual({ ok: true, value: expected });
  });
});

describe('parseSetInput — invalid inputs', () => {
  const cases: Array<[string, string]> = [
    ['', 'empty_input'],
    ['   ', 'empty_input'],
    ['x8', 'no_set_found'],
    ['hola que tal', 'no_set_found'],
    ['60x8 extra', 'no_set_found'],
    ['60x', 'missing_reps'],
    ['0x8', 'invalid_weight'],
    ['-10x8', 'invalid_weight'],
    ['60x0', 'invalid_reps'],
    ['60x8 rpe15', 'invalid_rpe'],
    ['60x8 rpe0', 'invalid_rpe'],
  ];

  it.each(cases)('rejects %s with %s', (input, reason) => {
    expect(parseSetInput(input)).toEqual({ ok: false, reason });
  });
});
