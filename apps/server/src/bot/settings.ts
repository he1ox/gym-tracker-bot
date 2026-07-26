import { type Locale, type WeightUnit, updateUserPreferences } from '@gym-tracker/db';
import { type Bot, InlineKeyboard } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { setCurrent } from '../i18n/current';
import { LOCALES, LOCALE_NAMES } from '../i18n/index';
import { CB } from './callback-data';
import type { CustomContext } from './context';
import { T } from './texts';
import type { Rendered } from './welcome';

export const WEIGHT_STEPS = [1, 2.5, 5, 10] as const;
const UNITS: readonly WeightUnit[] = ['kg', 'lb'];

export interface SettingsPrefs {
  locale: Locale;
  unit: WeightUnit;
  step: number;
}

const mark = (active: boolean, label: string): string => (active ? `✓ ${label}` : label);

export function renderSettings(prefs: SettingsPrefs): Rendered {
  const keyboard = new InlineKeyboard();
  // row() ANTES de cada fila nueva, nunca después de la última: ver el comentario
  // sobre InlineKeyboard en exercise-picker.ts.
  for (const locale of LOCALES) {
    keyboard.text(mark(locale === prefs.locale, LOCALE_NAMES[locale]), CB.setLocale(locale));
  }
  keyboard.row();
  for (const unit of UNITS) {
    keyboard.text(mark(unit === prefs.unit, unit), CB.setUnit(unit));
  }
  keyboard.row();
  for (const step of WEIGHT_STEPS) {
    keyboard.text(mark(step === prefs.step, String(step)), CB.setStep(step));
  }
  keyboard.row().text(T.welcomeBackButton, CB.wcBack);

  const text = [
    T.settingsTitle,
    '',
    `${T.settingsLanguageLabel}: ${LOCALE_NAMES[prefs.locale]}`,
    `${T.settingsUnitLabel}: ${prefs.unit}`,
    `${T.settingsStepLabel}: ${prefs.step}`,
    '',
    T.settingsIntro,
  ].join('\n');

  return { text, keyboard };
}

const prefsOf = (ctx: CustomContext): SettingsPrefs => ({
  locale: ctx.user.locale,
  unit: ctx.user.weightUnit,
  step: ctx.user.weightStep,
});

// Sin parámetro de config: el botón ‹ Volver reutiliza el handler de CB.wcBack que
// ya registra welcome.ts, y es ese quien necesita el timezone.
export function registerSettings(bot: Bot<CustomContext>, db: DatabaseSync): void {
  // Mensaje NUEVO, como /help: /settings funciona con un entrenamiento en curso y
  // no debe pisar el mensaje activo de la sesión.
  bot.command('settings', async (ctx) => {
    const { text, keyboard } = renderSettings(prefsOf(ctx));
    await ctx.reply(text, { reply_markup: keyboard });
  });

  // Guarda, actualiza el estado global del update en curso y repinta EN EL SITIO,
  // así el cambio de idioma se ve al instante en la propia pantalla.
  const apply = async (ctx: CustomContext, patch: Partial<SettingsPrefs>): Promise<void> => {
    const next = { ...prefsOf(ctx), ...patch };
    updateUserPreferences(db, ctx.user.id, {
      locale: patch.locale,
      weightUnit: patch.unit,
      weightStep: patch.step,
    });
    setCurrent({ locale: next.locale, unit: next.unit, step: next.step });
    const { text, keyboard } = renderSettings(next);
    await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => {});
    await ctx.answerCallbackQuery(T.settingsSaved);
  };

  // Un handler POR VALOR PERMITIDO: así 'set:s:3' o 'set:l:fr' no encuentran
  // handler y no escriben nada, sin validar a mano.
  for (const locale of LOCALES) {
    bot.callbackQuery(CB.setLocale(locale), (ctx) => apply(ctx, { locale }));
  }
  for (const unit of UNITS) {
    bot.callbackQuery(CB.setUnit(unit), (ctx) => apply(ctx, { unit }));
  }
  for (const step of WEIGHT_STEPS) {
    bot.callbackQuery(CB.setStep(step), (ctx) => apply(ctx, { step }));
  }
}
