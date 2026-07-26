import type { ParseErrorReason } from '@gym-tracker/core';
import { t, unitLabel, weightStep } from '../i18n/current';

// Formatea el salto sin decimales colgando: 5 → "5", 2.5 → "2.5".
const stepLabel = (): string => String(weightStep());

/**
 * Fachada de textos. Cada propiedad es un getter: se resuelve en el momento de
 * leerla, con el idioma del update en curso (i18n/current.ts). Por eso los
 * consumidores siguen escribiendo `T.clave` igual que antes de la i18n.
 */
export const T = {
  // Selección de día (estado 1)
  get chooseDayPrompt(): string {
    return t('chooseDayPrompt');
  },
  get freeWorkoutButton(): string {
    return t('freeWorkoutButton');
  },
  get freeWorkoutTitle(): string {
    return t('freeWorkoutTitle');
  },

  // Selección de ejercicio (estado 2)
  get chooseExercisePrompt(): string {
    return t('chooseExercisePrompt');
  },
  get otherExerciseButton(): string {
    return t('otherExerciseButton');
  },

  // En ejercicio (estado 3)
  get headerIcon(): string {
    return t('headerIcon');
  },
  get lastTimeLabel(): string {
    return t('lastTimeLabel');
  },
  get todayLabel(): string {
    return t('todayLabel');
  },
  get exercisesButton(): string {
    return t('exercisesButton');
  },
  get weightMinusButton(): string {
    return t('weightMinusButton', { step: stepLabel() });
  },
  get weightPlusButton(): string {
    return t('weightPlusButton', { step: stepLabel() });
  },
  get repMinusButton(): string {
    return t('repMinusButton');
  },
  get repPlusButton(): string {
    return t('repPlusButton');
  },

  // Fin
  get finishTitle(): string {
    return t('finishTitle');
  },
  get recordIcon(): string {
    return t('recordIcon');
  },
  chartWeeklyCaption(from: string, to: string, sets: number): string {
    return t('chartWeeklyCaption', { from, to, sets: t('setsCount', { count: sets }) });
  },

  // Toasts / errores
  get sessionEndedToast(): string {
    return t('sessionEndedToast');
  },
  get noActiveSessionToast(): string {
    return t('noActiveSessionToast');
  },
  get genericError(): string {
    return t('genericError');
  },
  get notAuthorized(): string {
    return t('notAuthorized');
  },
  get needWeightAndReps(): string {
    return t('needWeightAndReps');
  },
  get estimatedRecordLabel(): string {
    return t('estimatedRecordLabel');
  },

  header(dayName: string | null, effectiveSets: number, tonnage: string): string {
    return t('header', {
      icon: t('headerIcon'),
      title: dayName ?? t('freeWorkoutTitle'),
      sets: t('setsCount', { count: effectiveSets }),
      tonnage,
      unit: unitLabel(),
    });
  },
  setsSummary(count: number): string {
    return t('setsCount', { count });
  },
  recordButton(label: string): string {
    return t('recordButton', { set: label });
  },
  warmupButton(on: boolean): string {
    return on ? t('warmupOn') : t('warmupOff');
  },
  restCancelButton(seconds: number): string {
    return t('restCancelButton', { seconds });
  },
  restDoneMessage(exerciseName: string): string {
    return t('restDoneMessage', { exercise: exerciseName });
  },
  noMatch(query: string): string {
    return t('noMatch', { query });
  },
  previousRecord(weight: string): string {
    return t('previousRecord', { weight, unit: unitLabel() });
  },

  // Wizard de /routines
  get noRoutines(): string {
    return t('noRoutines');
  },
  get routinesList(): string {
    return t('routinesList');
  },
  get newRoutineButton(): string {
    return t('newRoutineButton');
  },
  get routineActivated(): string {
    return t('routineActivated');
  },
  get doneButton(): string {
    return t('doneButton');
  },
  get skipButton(): string {
    return t('skipButton');
  },
  get createOwnButton(): string {
    return t('createOwnButton');
  },
  get routineAskName(): string {
    return t('routineAskName');
  },
  get routineAskDay(): string {
    return t('routineAskDay');
  },
  get routineNeedOneDay(): string {
    return t('routineNeedOneDay');
  },
  get dayAskExercise(): string {
    return t('dayAskExercise');
  },
  get askOwnName(): string {
    return t('askOwnName');
  },
  get askMuscleGroup(): string {
    return t('askMuscleGroup');
  },
  get askTargets(): string {
    return t('askTargets');
  },
  routineCreated(name: string): string {
    return t('routineCreated', { name });
  },

  // /last
  lastNoHistory(name: string): string {
    return t('lastNoHistory', { name });
  },
  lastHeader(name: string): string {
    return t('lastHeader', { name });
  },
  lastBest(weight: string): string {
    return t('lastBest', { weight, unit: unitLabel() });
  },
  get lastChartButton(): string {
    return t('lastChartButton');
  },
  lastStagnant(weeks: number, weight: string): string {
    return t('lastStagnant', { count: weeks, weight, unit: unitLabel() });
  },
  chartExerciseCaption(name: string, weight: string): string {
    return t('chartExerciseCaption', { name, weight, unit: unitLabel() });
  },

  // Selector de ejercicios por grupo muscular
  get pickChooseGroup(): string {
    return t('pickChooseGroup');
  },
  get pickSearchButton(): string {
    return t('pickSearchButton');
  },
  get pickBackButton(): string {
    return t('pickBackButton');
  },
  get pickPrevButton(): string {
    return t('pickPrevButton');
  },
  get pickNextButton(): string {
    return t('pickNextButton');
  },
  get pickByGroupButton(): string {
    return t('pickByGroupButton');
  },
  get pickAmbiguous(): string {
    return t('pickAmbiguous');
  },
  get pickEmpty(): string {
    return t('pickEmpty');
  },
  get pickTypeName(): string {
    return t('pickTypeName');
  },
  get lastSearchToast(): string {
    return t('lastSearchToast');
  },
  get exerciseGoneToast(): string {
    return t('exerciseGoneToast');
  },
  pickGroupTitle(label: string): string {
    return t('pickGroupTitle', { label });
  },

  // Bienvenida y ayuda
  get welcomeIntro(): string {
    return t('welcomeIntro');
  },
  get overviewTitle(): string {
    return t('overviewTitle');
  },
  get overviewCompare(): string {
    return t('overviewCompare');
  },
  get overviewWorkouts(): string {
    return t('overviewWorkouts');
  },
  get overviewSets(): string {
    return t('overviewSets');
  },
  get overviewReps(): string {
    return t('overviewReps');
  },
  get overviewTonnage(): string {
    return t('overviewTonnage');
  },
  get overviewHeaviest(): string {
    return t('overviewHeaviest');
  },
  get overviewNoChange(): string {
    return t('overviewNoChange');
  },
  get welcomeStartButton(): string {
    return t('welcomeStartButton');
  },
  get welcomeRoutinesButton(): string {
    return t('welcomeRoutinesButton');
  },
  get welcomeHistoryButton(): string {
    return t('welcomeHistoryButton');
  },
  get welcomeHelpButton(): string {
    return t('welcomeHelpButton');
  },
  get welcomeChartButton(): string {
    return t('welcomeChartButton');
  },
  get welcomeBackButton(): string {
    return t('welcomeBackButton');
  },
  get welcomeSettingsHint(): string {
    return t('welcomeSettingsHint');
  },
  get welcomeVolumeTitle(): string {
    return t('welcomeVolumeTitle');
  },
  welcomeGreeting(firstName: string | null): string {
    return firstName === null ? t('welcomeGreeting') : t('welcomeGreetingNamed', { name: firstName });
  },
  // Valor con unidad para las filas de la tabla de la bienvenida.
  withUnit(value: string): string {
    return t('tonnageValue', { value, unit: unitLabel() });
  },
  get helpText(): string {
    return t('helpText');
  },

  // /settings
  get settingsTitle(): string {
    return t('settingsTitle');
  },
  get settingsLanguageLabel(): string {
    return t('settingsLanguageLabel');
  },
  get settingsUnitLabel(): string {
    return t('settingsUnitLabel');
  },
  get settingsStepLabel(): string {
    return t('settingsStepLabel');
  },
  get settingsIntro(): string {
    return t('settingsIntro');
  },
  get settingsSaved(): string {
    return t('settingsSaved');
  },

  // Descripciones del menú ☰ (una clave por comando).
  commandDescription(command: 'start' | 'finish' | 'routines' | 'last' | 'help' | 'settings'): string {
    const keys = {
      start: 'commandStart',
      finish: 'commandFinish',
      routines: 'commandRoutines',
      last: 'commandLast',
      help: 'commandHelp',
      settings: 'commandSettings',
    } as const;
    return t(keys[command]);
  },
} as const;

export function parseErrorText(reason: ParseErrorReason): string {
  switch (reason) {
    case 'empty_input':
      return t('needWeightAndReps');
    case 'no_set_found':
      return t('parseNoSetFound');
    case 'missing_reps':
      return t('parseMissingReps');
    case 'invalid_weight':
      return t('parseInvalidWeight');
    case 'invalid_reps':
      return t('parseInvalidReps');
    case 'invalid_rpe':
      return t('parseInvalidRpe');
  }
}
