import type { Overview } from '@gym-tracker/core';
import { type Locale, listExercisesByMuscleGroup } from '@gym-tracker/db';
import { type Api, type Bot, InlineKeyboard } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { buildUserSummary } from '../services/overview-service';
import { withCurrent } from '../i18n/current';
import { groupLabel, localizeGroups } from '../i18n/exercise-name';
import { buildDayOptions } from '../services/session-service';
import type { GroupVolume } from '../services/weekly-volume';
import { volumeBars } from '../charts/volume-bars';
import { CB } from './callback-data';
import type { CustomContext } from './context';
import { renderPicker } from './exercise-picker';
import { renderRoutinesList } from './routines-wizard';
import { formatTonnage, formatWeight, renderDayPicker } from './session-view';
import { sendWeeklyChart } from './weekly-chart';
import { T } from './texts';

export interface WelcomeModel {
  firstName: string | null;
  overview: Overview;
  weeklyVolume: GroupVolume[];
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
    metricRow(
      T.overviewTonnage,
      T.withUnit(formatTonnage(overview.tonnageKg.current)),
      overview.tonnageKg.changePercent,
    ),
    // formatWeight, NO formatTonnage: es el peso crudo de una serie y redondearlo
    // convertiría 62.5 kg en 63 kg, que es un dato falso.
    metricRow(
      T.overviewHeaviest,
      T.withUnit(formatWeight(overview.heaviest.current)),
      overview.heaviest.changePercent,
    ),
  ];

  if (overview.heaviest.exerciseName !== null) {
    // Se rellena ANTES de escapar: '&amp;' ocupa 5 unidades y una sola columna,
    // así que escapar primero descuadraría la alineación.
    rows.push(escapeHtml(overview.heaviest.exerciseName.padStart(LABEL_WIDTH + VALUE_WIDTH)));
  }

  return `<pre>${rows.join('\n')}</pre>`;
}

/**
 * Barras de texto de la semana, en su propio <pre>. Las etiquetas salen del
 * catálogo de grupos musculares, no del usuario: no hay nada que escapar.
 */
function volumeBlock(rows: readonly GroupVolume[]): string | null {
  if (rows.length === 0) {
    return null;
  }
  const lines = volumeBars(rows.map((row) => ({ label: groupLabel(row.group), count: row.count })));
  return `<pre>${[T.welcomeVolumeTitle, ...lines].join('\n')}</pre>`;
}

export function renderWelcome(model: WelcomeModel): Rendered {
  const volume = volumeBlock(model.weeklyVolume);
  const text = [
    escapeHtml(T.welcomeGreeting(model.firstName)),
    '',
    T.welcomeIntro,
    '',
    T.welcomeSettingsHint,
    '',
    metricsBlock(model.overview),
    ...(volume === null ? [] : ['', volume]),
  ].join('\n');

  // Cada .row() lleva otro botón detrás: el idioma `.text(x).row()` solo es seguro
  // así (ver el comentario sobre InlineKeyboard en exercise-picker.ts:17-21).
  const keyboard = new InlineKeyboard()
    .text(T.welcomeStartButton, CB.wcStart)
    .row()
    .text(T.welcomeRoutinesButton, CB.wcRoutines)
    .text(T.welcomeHistoryButton, CB.wcHistory)
    .row()
    .text(T.welcomeHelpButton, CB.wcHelp)
    .text(T.welcomeChartButton, CB.wcChart);

  return { text, keyboard };
}

export function renderHelp(): Rendered {
  return { text: T.helpText, keyboard: new InlineKeyboard().text(T.welcomeBackButton, CB.wcBack) };
}

// parse_mode va en TODOS los envíos de estas dos pantallas: la tabla de métricas
// necesita <pre> y la ayuda usa <code> para los ejemplos.
const HTML = { parse_mode: 'HTML' } as const;

export function welcomeModel(db: DatabaseSync, ctx: CustomContext, timezone: string): WelcomeModel {
  const firstName = ctx.from?.first_name?.trim();
  const summary = buildUserSummary(db, { userId: ctx.user.id, timezone, now: Date.now() });
  return {
    firstName: firstName === undefined || firstName === '' ? null : firstName,
    overview: summary.overview,
    weeklyVolume: summary.weeklyVolume,
  };
}

/** `/start` sin sesión activa: mensaje nuevo. */
export async function sendWelcome(ctx: CustomContext, db: DatabaseSync, timezone: string): Promise<void> {
  const { text, keyboard } = renderWelcome(welcomeModel(db, ctx, timezone));
  await ctx.reply(text, { reply_markup: keyboard, ...HTML });
}

export function registerWelcome(
  bot: Bot<CustomContext>,
  db: DatabaseSync,
  config: { timezone: string },
): void {
  // Todas las pantallas de aquí editan el mensaje pulsado. El .catch silencia los
  // "message is not modified" y los mensajes ya inaccesibles, igual que last.ts.
  const edit = async (ctx: CustomContext, rendered: Rendered, html: boolean): Promise<void> => {
    await ctx
      .editMessageText(rendered.text, { reply_markup: rendered.keyboard, ...(html ? HTML : {}) })
      .catch(() => {});
  };

  bot.command('help', async (ctx) => {
    // Mensaje NUEVO: /help funciona con un entrenamiento en curso y no debe tocar
    // el mensaje activo de la sesión (spec §5).
    const { text, keyboard } = renderHelp();
    await ctx.reply(text, { reply_markup: keyboard, ...HTML });
  });

  bot.callbackQuery(CB.wcHelp, async (ctx) => {
    await edit(ctx, renderHelp(), true);
    await ctx.answerCallbackQuery();
  });

  // ‹ Volver reconstruye la bienvenida EN EL SITIO, venga de donde venga: no
  // depende de si a la ayuda se llegó por botón o por /help (spec §5).
  bot.callbackQuery(CB.wcBack, async (ctx) => {
    await edit(ctx, renderWelcome(welcomeModel(db, ctx, config.timezone)), true);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(CB.wcStart, async (ctx) => {
    await edit(ctx, renderDayPicker(buildDayOptions(db, ctx.user.id)), false);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(CB.wcRoutines, async (ctx) => {
    // Pinta la lista sin entrar en la conversación: su botón "➕ Nueva rutina" ya
    // hace conversation.enter por su cuenta (spec §7).
    await edit(ctx, renderRoutinesList(db, ctx.user.id), false);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(CB.wcHistory, async (ctx) => {
    // Origen 'l': sus callbacks los atiende last.ts:96, registrado antes que esto.
    const picker = renderPicker({ view: 'groups' }, 'l', localizeGroups(listExercisesByMuscleGroup(db, ctx.user.id)));
    await edit(ctx, picker, false);
    await ctx.answerCallbackQuery();
  });

  // La ÚNICA pantalla de aquí que no edita el mensaje pulsado: una foto no se puede
  // pintar sobre un mensaje de texto, así que va como mensaje nuevo. El botón se
  // conserva tras usarlo (es una entrada de menú permanente); pulsarlo dos veces
  // manda dos fotos, y es una acción explícita del usuario.
  bot.callbackQuery(CB.wcChart, async (ctx) => {
    // Antes de renderizar: si no, la ruedita del botón gira hasta que acabe todo.
    await ctx.answerCallbackQuery();
    await ctx.replyWithChatAction('upload_photo').catch(() => {});
    await sendWeeklyChart(ctx, db, config.timezone);
  });
}

/** El menú ☰ de Telegram (spec §6). El orden es el de la tabla del spec. */
const COMMAND_ORDER = ['start', 'finish', 'routines', 'last', 'stagnant', 'help', 'settings'] as const;

export function botCommands(locale: Locale): Array<{ command: string; description: string }> {
  // Las descripciones salen del catálogo del idioma pedido, no del estado global:
  // setBotCommands registra el menú de TODOS los idiomas de una vez, al arrancar.
  return withCurrent({ locale, unit: 'kg', step: 2.5 }, () =>
    COMMAND_ORDER.map((command) => ({ command, description: T.commandDescription(command) })),
  );
}

/**
 * Registra el menú una vez por idioma. La llamada SIN language_code define el
 * menú por defecto, y por eso lleva el inglés: es el idioma de reserva.
 */
export async function setBotCommands(api: Api): Promise<void> {
  await api.setMyCommands(botCommands('en'));
  await api.setMyCommands(botCommands('es'), { language_code: 'es' });
}
