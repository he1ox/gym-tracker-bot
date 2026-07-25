import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '@gym-tracker/core';
import type { ExerciseOption } from '@gym-tracker/db';
import type { InlineKeyboard } from 'grammy';
import { describe, expect, it } from 'vitest';
import { CB } from './callback-data';
import { PICKER_PAGE_SIZE, renderCandidates, renderNoMatch, renderPicker } from './exercise-picker';
import { T } from './texts';

// Aplana el teclado a sus callback_data, en orden de lectura.
function datas(kb: InlineKeyboard): string[] {
  return kb.inline_keyboard.flat().map((b) => (b && 'callback_data' in b ? b.callback_data ?? '' : ''));
}
// Etiquetas visibles, fila a fila.
function rows(kb: InlineKeyboard): string[][] {
  return kb.inline_keyboard.map((row) => row.map((b) => b.text));
}

const options = (n: number, from = 1): ExerciseOption[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, name: `Ejercicio ${from + i}` }));

const CHEST = MUSCLE_GROUPS.indexOf('chest');
const BICEPS = MUSCLE_GROUPS.indexOf('biceps');

const twoGroups = new Map<MuscleGroup, ExerciseOption[]>([
  ['chest', options(3)],
  ['biceps', options(2, 100)],
]);

describe('renderPicker — groups view', () => {
  it('lists only the groups that have exercises, two per row, in anatomical order', () => {
    const { text, keyboard } = renderPicker({ view: 'groups' }, 'c', twoGroups);
    expect(text).toBe(T.pickChooseGroup);
    expect(rows(keyboard)).toEqual([
      [MUSCLE_GROUP_LABELS.chest, MUSCLE_GROUP_LABELS.biceps],
      [T.pickSearchButton],
    ]);
    expect(datas(keyboard)).toEqual([
      CB.pickGroup('c', CHEST, 0),
      CB.pickGroup('c', BICEPS, 0),
      CB.pickSearch('c'),
    ]);
  });

  it('leaves the odd group alone on its last row', () => {
    const three = new Map<MuscleGroup, ExerciseOption[]>([
      ['chest', options(1)],
      ['biceps', options(1, 50)],
      ['abs', options(1, 60)],
    ]);
    expect(rows(renderPicker({ view: 'groups' }, 'c', three).keyboard)).toEqual([
      [MUSCLE_GROUP_LABELS.chest, MUSCLE_GROUP_LABELS.biceps],
      [MUSCLE_GROUP_LABELS.abs],
      [T.pickSearchButton],
    ]);
  });

  it('has no back button on the groups screen', () => {
    const { keyboard } = renderPicker({ view: 'groups' }, 'c', twoGroups);
    expect(datas(keyboard)).not.toContain(CB.pickGroups('c'));
  });

  it('carries the origin into every callback', () => {
    const { keyboard } = renderPicker({ view: 'groups' }, 'l', twoGroups);
    expect(datas(keyboard).every((d) => d.startsWith('pick:l:'))).toBe(true);
  });

  it('says there is nothing to pick when the catalog is empty', () => {
    const { text, keyboard } = renderPicker({ view: 'groups' }, 'c', new Map());
    expect(text).toBe(T.pickEmpty);
    expect(datas(keyboard)).toEqual([CB.pickSearch('c')]);
  });
});

describe('renderPicker — group view', () => {
  it('lists the exercises one per row, under a back button', () => {
    const { text, keyboard } = renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', twoGroups);
    expect(text).toBe(T.pickGroupTitle(MUSCLE_GROUP_LABELS.chest));
    expect(rows(keyboard)).toEqual([
      [T.pickBackButton],
      ['Ejercicio 1'],
      ['Ejercicio 2'],
      ['Ejercicio 3'],
    ]);
    expect(datas(keyboard)).toEqual([
      CB.pickGroups('c'),
      CB.pickExercise('c', 1),
      CB.pickExercise('c', 2),
      CB.pickExercise('c', 3),
    ]);
  });

  it('falls back to the groups view when the group index is not in the map', () => {
    const state = { view: 'group', groupIndex: MUSCLE_GROUPS.indexOf('calves'), offset: 0 } as const;
    expect(renderPicker(state, 'c', twoGroups)).toEqual(renderPicker({ view: 'groups' }, 'c', twoGroups));
  });

  it('falls back to the groups view when the offset is past the end', () => {
    const state = { view: 'group', groupIndex: CHEST, offset: 3 } as const; // solo hay 3 (0..2)
    expect(renderPicker(state, 'c', twoGroups)).toEqual(renderPicker({ view: 'groups' }, 'c', twoGroups));
  });
});

describe('renderPicker — pagination', () => {
  const big = new Map<MuscleGroup, ExerciseOption[]>([['chest', options(25)]]);
  const navRow = (offset: number): string[] =>
    rows(renderPicker({ view: 'group', groupIndex: CHEST, offset }, 'c', big).keyboard).at(-1) ?? [];

  it('shows no arrows when everything fits on one page', () => {
    const exact = new Map<MuscleGroup, ExerciseOption[]>([['chest', options(PICKER_PAGE_SIZE)]]);
    const kb = renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', exact).keyboard;
    expect(rows(kb).at(-1)).toEqual(['Ejercicio 10']); // última fila = último ejercicio
    expect(datas(kb)).not.toContain(CB.pickGroup('c', CHEST, PICKER_PAGE_SIZE));
  });

  it('shows only Next on the first page of 25', () => {
    expect(navRow(0)).toEqual([T.pickNextButton]);
  });

  it('shows both arrows on the middle page', () => {
    expect(navRow(10)).toEqual([T.pickPrevButton, T.pickNextButton]);
  });

  it('shows only Previous on the last page', () => {
    expect(navRow(20)).toEqual([T.pickPrevButton]);
  });

  it('moves the offset in steps of PICKER_PAGE_SIZE', () => {
    const kb = renderPicker({ view: 'group', groupIndex: CHEST, offset: 10 }, 'c', big).keyboard;
    const nav = datas(kb).slice(-2);
    expect(nav).toEqual([CB.pickGroup('c', CHEST, 0), CB.pickGroup('c', CHEST, 20)]);
  });

  it('shows at most one page of exercises', () => {
    const kb = renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', big).keyboard;
    const exerciseButtons = datas(kb).filter((d) => d.startsWith('pick:c:x:'));
    expect(exerciseButtons).toHaveLength(PICKER_PAGE_SIZE);
  });

  it('never builds a negative offset', () => {
    const odd = new Map<MuscleGroup, ExerciseOption[]>([['chest', options(25)]]);
    const kb = renderPicker({ view: 'group', groupIndex: CHEST, offset: 4 }, 'c', odd).keyboard;
    expect(datas(kb)).toContain(CB.pickGroup('c', CHEST, 0));
  });
});

describe('renderCandidates', () => {
  it('offers one button per candidate plus a way back to the groups', () => {
    const { text, keyboard } = renderCandidates(options(3), 'c');
    expect(text).toBe(T.pickAmbiguous);
    expect(datas(keyboard)).toEqual([
      CB.pickExercise('c', 1),
      CB.pickExercise('c', 2),
      CB.pickExercise('c', 3),
      CB.pickGroups('c'),
    ]);
  });

  it('caps the candidate list at 8', () => {
    const { keyboard } = renderCandidates(options(20), 'l');
    expect(datas(keyboard).filter((d) => d.startsWith('pick:l:x:'))).toHaveLength(8);
  });
});

describe('every rendered keyboard is well formed', () => {
  // InlineKeyboard de grammY arranca con [[]] y row() empuja una fila vacía:
  // un row() de más deja una fila sin botones, que Telegram rechaza.
  const big = new Map<MuscleGroup, ExerciseOption[]>([['chest', options(25)]]);
  const all = [
    renderPicker({ view: 'groups' }, 'c', twoGroups),
    renderPicker({ view: 'groups' }, 'c', new Map()),
    renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', twoGroups),
    renderPicker({ view: 'group', groupIndex: CHEST, offset: 0 }, 'c', big),
    renderPicker({ view: 'group', groupIndex: CHEST, offset: 10 }, 'c', big),
    renderPicker({ view: 'group', groupIndex: CHEST, offset: 20 }, 'c', big),
    renderCandidates(options(3), 'c'),
    renderNoMatch('x', 'c'),
  ];

  it('has no empty rows', () => {
    for (const { keyboard } of all) {
      expect(keyboard.inline_keyboard.every((row) => row.length > 0)).toBe(true);
    }
  });

  it('has no empty callback_data', () => {
    for (const { keyboard } of all) {
      expect(datas(keyboard).every((d) => d.length > 0)).toBe(true);
    }
  });
});

describe('renderNoMatch', () => {
  it('names the failed query and offers the group menu', () => {
    const { text, keyboard } = renderNoMatch('zancada rusa', 'c');
    expect(text).toBe(T.noMatch('zancada rusa'));
    expect(text).toContain('zancada rusa');
    expect(datas(keyboard)).toEqual([CB.pickGroups('c')]);
  });
});
