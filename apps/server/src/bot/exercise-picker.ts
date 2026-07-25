import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '@gym-tracker/core';
import type { ExerciseOption } from '@gym-tracker/db';
import { InlineKeyboard } from 'grammy';
import { CB, type PickOrigin } from './callback-data';
import { T } from './texts';

export const PICKER_PAGE_SIZE = 10;
const MAX_CANDIDATES = 8;

export type PickerState = { view: 'groups' } | { view: 'group'; groupIndex: number; offset: number };

interface Rendered {
  text: string;
  keyboard: InlineKeyboard;
}

// OJO con InlineKeyboard: el constructor de grammY arranca con [[]] (una fila
// vacía ya abierta) y row() EMPUJA una fila vacía nueva. Por eso aquí se llama a
// row() ANTES de abrir cada fila, nunca después de cerrarla: el idioma
// `.text(x).row()` de session-view.ts solo es seguro cuando siempre viene otro
// botón detrás, y aquí no siempre viene (ni flechas de paginación, ni grupos).
function renderGroups(
  origin: PickOrigin,
  byGroup: ReadonlyMap<MuscleGroup, readonly ExerciseOption[]>,
): Rendered {
  const keyboard = new InlineKeyboard();
  let column = 0;
  MUSCLE_GROUPS.forEach((group, index) => {
    const options = byGroup.get(group);
    if (options === undefined || options.length === 0) {
      return; // grupos sin ejercicios disponibles no se pintan
    }
    if (column > 0 && column % 2 === 0) {
      keyboard.row(); // dos columnas
    }
    keyboard.text(MUSCLE_GROUP_LABELS[group], CB.pickGroup(origin, index, 0));
    column += 1;
  });
  if (column > 0) {
    keyboard.row();
  }
  keyboard.text(T.pickSearchButton, CB.pickSearch(origin));
  return { text: column === 0 ? T.pickEmpty : T.pickChooseGroup, keyboard };
}

export function renderPicker(
  state: PickerState,
  origin: PickOrigin,
  byGroup: ReadonlyMap<MuscleGroup, readonly ExerciseOption[]>,
): Rendered {
  if (state.view === 'groups') {
    return renderGroups(origin, byGroup);
  }
  const group = MUSCLE_GROUPS[state.groupIndex];
  const options = group === undefined ? undefined : byGroup.get(group);
  // Índice inexistente, grupo vacío u offset más allá del final: no hay pantalla
  // que pintar, así que se vuelve al menú de grupos en lugar de fallar.
  if (group === undefined || options === undefined || state.offset >= options.length) {
    return renderGroups(origin, byGroup);
  }

  // Mismo cuidado con row(): se abre fila antes de cada botón, no después.
  const keyboard = new InlineKeyboard();
  keyboard.text(T.pickBackButton, CB.pickGroups(origin));
  for (const option of options.slice(state.offset, state.offset + PICKER_PAGE_SIZE)) {
    keyboard.row().text(option.name, CB.pickExercise(origin, option.id)); // uno por fila
  }
  const hasPrev = state.offset > 0;
  const hasNext = state.offset + PICKER_PAGE_SIZE < options.length;
  if (hasPrev || hasNext) {
    keyboard.row();
    if (hasPrev) {
      keyboard.text(
        T.pickPrevButton,
        CB.pickGroup(origin, state.groupIndex, Math.max(0, state.offset - PICKER_PAGE_SIZE)),
      );
    }
    if (hasNext) {
      keyboard.text(T.pickNextButton, CB.pickGroup(origin, state.groupIndex, state.offset + PICKER_PAGE_SIZE));
    }
  }
  return { text: T.pickGroupTitle(MUSCLE_GROUP_LABELS[group]), keyboard };
}

export function renderCandidates(candidates: readonly ExerciseOption[], origin: PickOrigin): Rendered {
  const keyboard = new InlineKeyboard();
  const shown = candidates.slice(0, MAX_CANDIDATES);
  shown.forEach((candidate, index) => {
    if (index > 0) {
      keyboard.row();
    }
    keyboard.text(candidate.name, CB.pickExercise(origin, candidate.id)); // uno por fila
  });
  if (shown.length > 0) {
    keyboard.row();
  }
  keyboard.text(T.pickByGroupButton, CB.pickGroups(origin));
  return { text: T.pickAmbiguous, keyboard };
}

export function renderNoMatch(query: string, origin: PickOrigin): Rendered {
  return {
    text: T.noMatch(query),
    keyboard: new InlineKeyboard().text(T.pickByGroupButton, CB.pickGroups(origin)),
  };
}
