import type { ParseErrorReason } from '@gym-tracker/core';

const setsWord = (n: number): string => (n === 1 ? 'serie' : 'series');

export const T = {
  // Selección de día (estado 1)
  chooseDayPrompt: '¿Qué toca hoy? Elige un día o entrena libre.',
  freeWorkoutButton: '🏃 Entrenar libre',
  freeWorkoutTitle: 'Entrenamiento libre',

  // Selección de ejercicio (estado 2)
  chooseExercisePrompt: 'Elige un ejercicio:',
  otherExerciseButton: '📂 Otro ejercicio',
  typeExerciseName: 'Escribe el nombre del ejercicio a añadir.',

  // En ejercicio (estado 3)
  headerIcon: '🏋️',
  lastTimeLabel: 'Última vez',
  todayLabel: 'Hoy',
  exercisesButton: '☰ Ejercicios',
  weightMinusButton: '−2.5',
  weightPlusButton: '+2.5',
  repMinusButton: '−1 rep',
  repPlusButton: '+1 rep',

  // Fin
  finishTitle: '✅ Entrenamiento terminado',
  recordIcon: '🏆',

  // Toasts / errores
  sessionEndedToast: 'Sesión terminada. Usa /start.',
  noActiveSessionToast: 'No tienes una sesión activa. Usa /start.',
  genericError: 'Algo salió mal. Inténtalo de nuevo.',
  notAuthorized: 'No tienes acceso a este bot.',
  needWeightAndReps: 'Escribe el peso y las reps, p. ej. 60x8.',
  ambiguousMatch: 'Varios ejercicios coinciden. Sé más específico.',

  header(dayName: string | null, effectiveSets: number, tonnageKg: string): string {
    const title = dayName ?? T.freeWorkoutTitle;
    return `${T.headerIcon} ${title} · ${effectiveSets} ${setsWord(effectiveSets)} · ${tonnageKg} kg`;
  },
  recordButton(label: string): string {
    return `↻ Registrar ${label}`;
  },
  warmupButton(on: boolean): string {
    return on ? '🔥 Calent. ✓' : '🔥 Calent.';
  },
  restCancelButton(seconds: number): string {
    return `⏱ ${seconds}s ✕`;
  },
  restDoneMessage(exerciseName: string): string {
    return `⏱ Descanso terminado — ${exerciseName}`;
  },
  noMatch(query: string): string {
    return `No encontré "${query}".`;
  },
  estimatedRecordLabel: '1RM est.',
  setsSummary(count: number): string {
    return `${count} ${count === 1 ? 'serie' : 'series'}`;
  },
  previousRecord(kg: string): string {
    return ` (antes ${kg} kg)`;
  },

  // Wizard de /routines (Task 15)
  noRoutines: 'No tienes rutinas todavía.',
  routinesList: 'Tus rutinas (pulsa una para activarla):',
  newRoutineButton: '➕ Nueva rutina',
  routineActivated: 'Rutina activada.',
  doneButton: '✅ Listo',
  skipButton: '⏭ Saltar',
  createOwnButton: '➕ Crear ejercicio propio',
  routineAskName: 'Nombre de la nueva rutina:',
  routineAskDay: 'Escribe el nombre de un día (o pulsa Listo para terminar):',
  routineNeedOneDay: 'Añade al menos un día antes de terminar.',
  dayAskExercise: 'Busca un ejercicio por nombre (o pulsa Listo para cerrar el día):',
  askOwnName: 'Nombre del ejercicio propio:',
  askMuscleGroup: 'Elige el grupo muscular:',
  askTargets: 'Objetivos como "4 6-10 90" (series reps-min descanso) o pulsa Saltar:',

  routineCreated(name: string): string {
    return `Rutina "${name}" creada.`;
  },
  exerciseAdded(name: string): string {
    return `Añadido: ${name}.`;
  },

  // /last command (Task 16)
  lastUsage: 'Uso: /last <ejercicio>. Ej.: /last press banca.',
  lastAmbiguous: '¿Cuál de estos?',
  lastNoHistory(name: string): string {
    return `Todavía no tienes series de ${name}.`;
  },
  lastHeader(name: string): string {
    return `📊 ${name} — últimas sesiones`;
  },
  lastBest(kg: string): string {
    return `Mejor 1RM estimado: ${kg} kg`;
  },

  // Selector de ejercicios por grupo muscular (Fase 2)
  pickChooseGroup: 'Elige un grupo muscular:',
  pickSearchButton: '🔍 Buscar por nombre',
  pickBackButton: '‹ Volver',
  pickPrevButton: '‹ Anterior',
  pickNextButton: 'Siguiente ›',
  pickByGroupButton: '📂 Ver por grupo',
  pickAmbiguous: '¿Cuál de estos?',
  pickEmpty: 'No hay ejercicios disponibles.',
  pickTypeName: 'Escribe el nombre del ejercicio.',
  exerciseGoneToast: 'Ese ejercicio ya no está disponible.',
  pickGroupTitle(label: string): string {
    return `${label} — elige un ejercicio:`;
  },
};

export function parseErrorText(reason: ParseErrorReason): string {
  switch (reason) {
    case 'empty_input':
      return T.needWeightAndReps;
    case 'no_set_found':
      return 'No entendí. Usa el formato peso x reps, p. ej. 60x8.';
    case 'missing_reps':
      return 'Falta el número de repeticiones, p. ej. 60x8.';
    case 'invalid_weight':
      return 'El peso no es válido.';
    case 'invalid_reps':
      return 'Las repeticiones no son válidas.';
    case 'invalid_rpe':
      return 'El RPE debe estar entre 1 y 10.';
  }
}
