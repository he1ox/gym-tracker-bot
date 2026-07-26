import type { Locale, WeightUnit } from '@gym-tracker/db';
import i18next from 'i18next';

export interface CurrentPrefs {
  locale: Locale;
  unit: WeightUnit;
  step: number;
}

// Estado global del update en curso. Decisión explícita del autor frente a pasar
// las preferencias por parámetro. Riesgo asumido: cualquier código que genere
// texto FUERA del ciclo de vida de un update debe capturar snapshot() al
// programarse y restaurarlo con withCurrent() al ejecutarse, como hace
// rest-timer.ts. Si añades un cron, un webhook o una tarea diferida, haz lo mismo.
let current: CurrentPrefs = { locale: 'en', unit: 'kg', step: 2.5 };

export function setCurrent(prefs: CurrentPrefs): void {
  current = prefs;
}

export function snapshot(): CurrentPrefs {
  return { ...current };
}

export function withCurrent<T>(prefs: CurrentPrefs, fn: () => T): T {
  const previous = current;
  current = prefs;
  try {
    return fn();
  } finally {
    current = previous; // también si fn lanza
  }
}

export const currentLocale = (): Locale => current.locale;
export const unitLabel = (): string => current.unit;
export const weightStep = (): number => current.step;

export function t(key: string, vars?: Record<string, unknown>): string {
  return String(i18next.getFixedT(current.locale)(key, vars ?? {}));
}
