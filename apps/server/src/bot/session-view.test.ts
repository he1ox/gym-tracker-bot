import { describe, expect, it } from 'vitest';
import type { InlineKeyboard } from 'grammy';
import { CB } from './callback-data';
import {
  formatTonnage,
  renderDayPicker,
  renderFinishSummary,
  renderSession,
  type SessionViewModel,
} from './session-view';

function datas(kb: InlineKeyboard): string[] {
  return kb.inline_keyboard.flat().map((b) => (b && 'callback_data' in b ? b.callback_data ?? '' : ''));
}

describe('formatTonnage', () => {
  it('rounds and groups thousands with commas', () => {
    expect(formatTonnage(1240)).toBe('1,240');
    expect(formatTonnage(999.6)).toBe('1,000');
  });
});

describe('renderDayPicker', () => {
  it('lists day buttons plus a free-workout button', () => {
    const { keyboard } = renderDayPicker([
      { routineDayId: 5, name: 'Empuje' },
      { routineDayId: 6, name: 'Pierna' },
    ]);
    expect(datas(keyboard)).toEqual([CB.day(5), CB.day(6), CB.free]);
  });

  it('offers free workout even with no days', () => {
    const { keyboard } = renderDayPicker([]);
    expect(datas(keyboard)).toEqual([CB.free]);
  });
});

describe('renderSession — in_exercise', () => {
  const model: SessionViewModel = {
    kind: 'in_exercise',
    header: { dayName: 'Empuje', effectiveSets: 2, tonnageKg: 960 },
    exerciseName: 'Press banca inclinado',
    lastTime: [
      { weightKg: 60, reps: 8 },
      { weightKg: 57.5, reps: 9 },
    ],
    today: [{ weightKg: 60, reps: 8 }],
    pending: { weightKg: 60, reps: 8 },
    nextIsWarmup: false,
    restTimer: null,
  };

  it('renders header, last-time reference and today sets in the text', () => {
    const { text } = renderSession(model);
    expect(text).toContain('Empuje');
    expect(text).toContain('2 series');
    expect(text).toContain('Press banca inclinado');
    expect(text).toContain('60×8');
    expect(text).toContain('57.5×9');
  });

  it('puts the record button first and the four adjust buttons next', () => {
    const { keyboard } = renderSession(model);
    expect(datas(keyboard)[0]).toBe(CB.rec);
    expect(datas(keyboard)).toEqual(
      expect.arrayContaining([CB.rec, CB.wMinus, CB.wPlus, CB.rMinus, CB.rPlus, CB.warmup, CB.list]),
    );
  });

  it('hides the record button when there is no pending set', () => {
    const { keyboard } = renderSession({ ...model, pending: null });
    expect(datas(keyboard)).not.toContain(CB.rec);
  });

  it('shows a cancelable rest button when a timer is active', () => {
    const { keyboard } = renderSession({ ...model, restTimer: { seconds: 90 } });
    expect(datas(keyboard)).toContain(CB.restCancel);
  });
});

describe('renderSession — choosing_exercise', () => {
  it('marks completed exercises and offers "otro ejercicio"', () => {
    const { keyboard } = renderSession({
      kind: 'choosing_exercise',
      header: { dayName: null, effectiveSets: 0, tonnageKg: 0 },
      items: [
        { exerciseId: 1, name: 'Press banca', done: true },
        { exerciseId: 2, name: 'Aperturas', done: false },
      ],
    });
    expect(datas(keyboard)).toEqual([CB.ex(1), CB.ex(2), CB.add]);
    expect(keyboard.inline_keyboard[0]?.[0]?.text).toContain('✓');
  });
});

describe('renderFinishSummary', () => {
  it('summarizes effective sets, tonnage and records', () => {
    const text = renderFinishSummary({
      dayName: 'Empuje',
      effectiveSets: 5,
      tonnageKg: 1240,
      durationMinutes: 47,
      records: [{ exerciseName: 'Press banca', estimated1RM: 82.5, previous1RM: 80 }],
    });
    expect(text).toContain('Empuje');
    expect(text).toContain('1,240');
    expect(text).toContain('47');
    expect(text).toContain('Press banca');
  });
});
