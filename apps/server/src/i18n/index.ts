import type { Locale } from '@gym-tracker/db';
import i18next from 'i18next';
import { en } from './locales/en';
import { es } from './locales/es';

// El tipo Locale vive en packages/db (es quien lo persiste). Aquí NO se redeclara:
// un segundo tipo con los mismos valores compila pero engaña.
export const LOCALES: readonly Locale[] = ['es', 'en'];

/** El nombre de cada idioma se escribe SIEMPRE en ese idioma, no traducido. */
export const LOCALE_NAMES: Record<Locale, string> = { es: 'Español', en: 'English' };

export const resources = {
  es: { ui: es.ui, muscleGroup: es.muscleGroup, exercise: es.exercise },
  en: { ui: en.ui, muscleGroup: en.muscleGroup, exercise: en.exercise },
};

let initialized = false;

export function initI18n(): void {
  if (initialized) {
    return; // los tests lo llaman por fichero; init dos veces reinicia i18next
  }
  void i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    // 'ui' es el namespace por defecto: t('chooseDayPrompt') sin prefijo.
    ns: ['ui', 'muscleGroup', 'exercise'],
    defaultNS: 'ui',
    resources,
    // CRÍTICO: i18next escapa para HTML de navegador por defecto y convertiría los
    // <b> y <code> de la pantalla de ayuda en texto visible. El escapado de lo que
    // viene del usuario lo sigue haciendo escapeHtml (welcome.ts).
    interpolation: { escapeValue: false },
    saveMissing: true,
    missingKeyHandler: (_lngs, ns, key) => {
      const message = `[i18n] clave sin traducir: ${ns}:${key}`;
      if (process.env.NODE_ENV === 'test') {
        throw new Error(message);
      }
      console.error(message);
    },
  });
  initialized = true;
}
