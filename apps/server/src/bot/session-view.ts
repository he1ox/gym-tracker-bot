import { InlineKeyboard } from 'grammy';
import { CB } from './callback-data';
import { T } from './texts';

export interface HeaderInfo {
  dayName: string | null;
  effectiveSets: number;
  tonnageKg: number;
}
export interface DisplaySet {
  weightKg: number;
  reps: number;
}
export interface ExercisePickItem {
  exerciseId: number;
  name: string;
  done: boolean;
}
export interface DayOption {
  routineDayId: number;
  name: string;
}
export interface RestTimerInfo {
  seconds: number;
}

export type SessionViewModel =
  | { kind: 'choosing_exercise'; header: HeaderInfo; items: ExercisePickItem[] }
  | {
      kind: 'in_exercise';
      header: HeaderInfo;
      exerciseName: string;
      lastTime: DisplaySet[] | null;
      today: DisplaySet[];
      pending: DisplaySet | null;
      nextIsWarmup: boolean;
      restTimer: RestTimerInfo | null;
    };

export interface RecordLine {
  exerciseName: string;
  estimated1RM: number;
  previous1RM: number | null;
}
export interface FinishSummary {
  dayName: string | null;
  effectiveSets: number;
  tonnageKg: number;
  durationMinutes: number;
  records: RecordLine[];
}

export const formatWeight = (kg: number): string => String(kg);
export const formatSet = (s: DisplaySet): string => `${formatWeight(s.weightKg)}×${s.reps}`;
export const formatTonnage = (kg: number): string =>
  Math.round(kg)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const format1RM = (kg: number): string => String(Math.round(kg * 10) / 10);

function headerText(h: HeaderInfo): string {
  return T.header(h.dayName, h.effectiveSets, formatTonnage(h.tonnageKg));
}

export function renderDayPicker(days: DayOption[]): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard();
  for (const day of days) {
    keyboard.text(day.name, CB.day(day.routineDayId)).row();
  }
  keyboard.text(T.freeWorkoutButton, CB.free);
  return { text: T.chooseDayPrompt, keyboard };
}

function renderChoosingExercise(
  model: Extract<SessionViewModel, { kind: 'choosing_exercise' }>,
): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard();
  for (const item of model.items) {
    keyboard.text(`${item.done ? '✓ ' : ''}${item.name}`, CB.ex(item.exerciseId)).row();
  }
  keyboard.text(T.otherExerciseButton, CB.add);
  return { text: `${headerText(model.header)}\n\n${T.chooseExercisePrompt}`, keyboard };
}

function renderInExercise(
  model: Extract<SessionViewModel, { kind: 'in_exercise' }>,
): { text: string; keyboard: InlineKeyboard } {
  const lines = [headerText(model.header), '', `▸ ${model.exerciseName}`];
  if (model.lastTime && model.lastTime.length > 0) {
    lines.push(`  ${T.lastTimeLabel}: ${model.lastTime.map(formatSet).join(' · ')}`);
  }
  if (model.today.length > 0) {
    lines.push(`  ${T.todayLabel}: ${model.today.map((s) => `${formatSet(s)} ✓`).join(' ')}`);
  }

  const keyboard = new InlineKeyboard();
  if (model.pending) {
    keyboard.text(T.recordButton(formatSet(model.pending)), CB.rec).row();
  }
  keyboard
    .text(T.weightMinusButton, CB.wMinus)
    .text(T.weightPlusButton, CB.wPlus)
    .text(T.repMinusButton, CB.rMinus)
    .text(T.repPlusButton, CB.rPlus)
    .row();
  keyboard.text(T.warmupButton(model.nextIsWarmup), CB.warmup).text(T.exercisesButton, CB.list);
  if (model.restTimer) {
    keyboard.row().text(T.restCancelButton(model.restTimer.seconds), CB.restCancel);
  }
  return { text: lines.join('\n'), keyboard };
}

export function renderSession(model: SessionViewModel): { text: string; keyboard: InlineKeyboard } {
  return model.kind === 'choosing_exercise' ? renderChoosingExercise(model) : renderInExercise(model);
}

export function renderFinishSummary(summary: FinishSummary): string {
  const title = summary.dayName ?? T.freeWorkoutTitle;
  const lines = [
    T.finishTitle,
    `${title} · ${T.setsSummary(summary.effectiveSets)} · ${formatTonnage(
      summary.tonnageKg,
    )} kg · ${summary.durationMinutes} min`,
  ];
  for (const rec of summary.records) {
    const previous = rec.previous1RM === null ? '' : T.previousRecord(format1RM(rec.previous1RM));
    lines.push(`${T.recordIcon} ${rec.exerciseName}: ${format1RM(rec.estimated1RM)} kg ${T.estimatedRecordLabel}${previous}`);
  }
  return lines.join('\n');
}
