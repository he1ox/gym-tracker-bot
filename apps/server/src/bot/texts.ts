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

  // /last command (Task 16)
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
  lastSearchToast: 'Para buscar por nombre usa /last <nombre>.',
  exerciseGoneToast: 'Ese ejercicio ya no está disponible.',
  pickGroupTitle(label: string): string {
    return `${label} — elige un ejercicio:`;
  },

  // Bienvenida y ayuda (Fase 2 — onboarding).
  // OJO: estos textos se envían con parse_mode: 'HTML'. Las etiquetas de abajo
  // (<b>, <code>) son deliberadas; cualquier '<', '>' o '&' LITERAL que añadas
  // aquí romperá el mensaje. Lo interpolado en tiempo de ejecución se escapa en
  // welcome.ts con escapeHtml, no aquí.
  welcomeIntro: 'Registra tus series desde aquí: elige un día, elige ejercicio y escribe 60x8.',
  overviewTitle: 'Últimos 30 días',
  overviewCompare: 'vs. 30 anteriores',
  overviewWorkouts: 'Entrenamientos',
  overviewSets: 'Series',
  overviewReps: 'Repeticiones',
  overviewTonnage: 'Levantado',
  overviewHeaviest: 'Más pesado',
  overviewNoChange: '—',

  welcomeStartButton: '▶️ Empezar entrenamiento',
  welcomeRoutinesButton: '📋 Mis rutinas',
  welcomeHistoryButton: '📊 Historial',
  welcomeHelpButton: '❓ Cómo funciona',
  welcomeBackButton: '‹ Volver',

  welcomeGreeting(firstName: string | null): string {
    return firstName === null ? '👋 Hola' : `👋 Hola, ${firstName}`;
  },

  helpText: [
    '❓ <b>Cómo funciona</b>',
    '',
    'Este bot registra tus series mientras entrenas. Los datos se guardan en tu propio equipo.',
    '',
    '<b>El flujo</b>',
    '1. <code>/start</code> y elige un día de tu rutina, o entrena libre.',
    '2. Elige el ejercicio: verás lo que hiciste la última vez, para decidir el peso de hoy.',
    '3. Registra cada serie.',
    '4. <code>/finish</code> cierra el entrenamiento y te avisa de los récords.',
    '',
    '<b>Dos formas de registrar, siempre disponibles</b>',
    'Con botones: ajusta con −2.5 / +2.5 / −1 rep / +1 rep y pulsa ↻ Registrar.',
    'Escribiendo, que es más rápido:',
    '<code>60x8</code> — 60 kg por 8 repeticiones',
    '<code>60 x 8</code> — los espacios dan igual',
    '<code>60x8 rpe8</code> — con esfuerzo percibido',
    '<code>sentadilla 100x5</code> — cambia de ejercicio y registra de una vez',
    '',
    '<b>Calentamiento</b>',
    'Pulsa 🔥 Calent. y la siguiente serie no contará en el volumen ni en los récords. Se desactiva sola en cuanto la registras.',
    '',
    '<b>Descanso</b>',
    'Si el ejercicio tiene descanso objetivo en tu rutina, el bot te avisa cuando toca la siguiente serie. El botón ⏱ lo cancela.',
    '',
    '<b>Comandos</b>',
    '<code>/start</code> — inicio y resumen',
    '<code>/finish</code> — terminar el entrenamiento',
    '<code>/routines</code> — mis rutinas',
    '<code>/last</code> — historial de un ejercicio',
    '<code>/help</code> — esta pantalla',
  ].join('\n'),
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
