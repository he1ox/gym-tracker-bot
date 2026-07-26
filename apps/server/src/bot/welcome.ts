import type { Overview } from '@gym-tracker/core';
import { InlineKeyboard } from 'grammy';
import { CB } from './callback-data';
import { formatTonnage, formatWeight } from './session-view';
import { T } from './texts';

export interface WelcomeModel {
  firstName: string | null;
  overview: Overview;
}

// Exportada porque registerWelcome (Tarea 7) la usa en la firma de su helper de edición.
export interface Rendered {
  text: string;
  keyboard: InlineKeyboard;
}

/**
 * Telegram HTML solo se rompe con estos tres caracteres. Se aplica a TODO lo que
 * venga de fuera del código: el nombre de Telegram del usuario y el nombre del
 * ejercicio de "Más pesado", que puede ser un ejercicio propio con texto arbitrario
 * (routines-wizard.ts, askOwnName, no valida caracteres).
 * El '&' va primero: si no, escaparía los '&' que él mismo acaba de introducir.
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// La fuente por defecto de Telegram es proporcional: la tabla solo cuadra dentro
// de un <pre>. Anchos fijos en unidades UTF-16, que es lo que cuentan padStart y
// padEnd; todas las etiquetas son latinas precompuestas, así que coinciden con
// los caracteres visibles.
const LABEL_WIDTH = 14;
const VALUE_WIDTH = 12;
const CHANGE_WIDTH = 8;
const TABLE_WIDTH = LABEL_WIDTH + VALUE_WIDTH + CHANGE_WIDTH;

function changeCell(percent: number | null): string {
  if (percent === null) {
    return T.overviewNoChange;
  }
  // padStart(2) alinea los dígitos entre filas: "▲ 20 %" y "▼  3 %".
  const magnitude = `${String(Math.abs(percent)).padStart(2)} %`;
  if (percent > 0) {
    return `▲ ${magnitude}`;
  }
  if (percent < 0) {
    return `▼ ${magnitude}`;
  }
  return magnitude; // sin movimiento: sin flecha
}

function metricRow(label: string, value: string, percent: number | null): string {
  return label.padEnd(LABEL_WIDTH) + value.padStart(VALUE_WIDTH) + changeCell(percent).padStart(CHANGE_WIDTH);
}

function metricsBlock(overview: Overview): string {
  const rows = [
    T.overviewTitle.padEnd(TABLE_WIDTH - T.overviewCompare.length) + T.overviewCompare,
    metricRow(T.overviewWorkouts, formatTonnage(overview.workouts.current), overview.workouts.changePercent),
    metricRow(T.overviewSets, formatTonnage(overview.effectiveSets.current), overview.effectiveSets.changePercent),
    metricRow(T.overviewReps, formatTonnage(overview.reps.current), overview.reps.changePercent),
    metricRow(T.overviewTonnage, `${formatTonnage(overview.tonnageKg.current)} kg`, overview.tonnageKg.changePercent),
    // formatWeight, NO formatTonnage: es el peso crudo de una serie y redondearlo
    // convertiría 62.5 kg en 63 kg, que es un dato falso.
    metricRow(T.overviewHeaviest, `${formatWeight(overview.heaviest.current)} kg`, overview.heaviest.changePercent),
  ];

  if (overview.heaviest.exerciseName !== null) {
    // Se rellena ANTES de escapar: '&amp;' ocupa 5 unidades y una sola columna,
    // así que escapar primero descuadraría la alineación.
    rows.push(escapeHtml(overview.heaviest.exerciseName.padStart(LABEL_WIDTH + VALUE_WIDTH)));
  }

  return `<pre>${rows.join('\n')}</pre>`;
}

export function renderWelcome(model: WelcomeModel): Rendered {
  const text = [
    escapeHtml(T.welcomeGreeting(model.firstName)),
    '',
    T.welcomeIntro,
    '',
    metricsBlock(model.overview),
  ].join('\n');

  // Cada .row() lleva otro botón detrás: el idioma `.text(x).row()` solo es seguro
  // así (ver el comentario sobre InlineKeyboard en exercise-picker.ts:17-21).
  const keyboard = new InlineKeyboard()
    .text(T.welcomeStartButton, CB.wcStart)
    .row()
    .text(T.welcomeRoutinesButton, CB.wcRoutines)
    .text(T.welcomeHistoryButton, CB.wcHistory)
    .row()
    .text(T.welcomeHelpButton, CB.wcHelp);

  return { text, keyboard };
}

export function renderHelp(): Rendered {
  return { text: T.helpText, keyboard: new InlineKeyboard().text(T.welcomeBackButton, CB.wcBack) };
}
