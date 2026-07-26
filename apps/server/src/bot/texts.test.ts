import { beforeAll, describe, expect, it } from 'vitest';
import { setCurrent } from '../i18n/current';
import { initI18n } from '../i18n/index';
import { T, parseErrorText } from './texts';

describe('T resuelve por idioma activo', () => {
  beforeAll(() => initI18n());

  it('cambia de idioma sin recargar el módulo', () => {
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
    expect(T.chooseDayPrompt).toBe('¿Qué toca hoy? Elige un día o entrena libre.');
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    expect(T.chooseDayPrompt).toBe('What are you training today? Pick a day or train freestyle.');
  });

  it('pone la unidad activa en la cabecera, sin convertir el número', () => {
    setCurrent({ locale: 'es', unit: 'lb', step: 2.5 });
    expect(T.header('Torso', 4, '1,250')).toBe('🏋️ Torso · 4 series · 1,250 lb');
  });

  it('rotula los botones de peso con el salto configurado', () => {
    setCurrent({ locale: 'es', unit: 'kg', step: 5 });
    expect(T.weightMinusButton).toBe('−5');
    expect(T.weightPlusButton).toBe('+5');
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
    expect(T.weightPlusButton).toBe('+2.5');
  });

  it('traduce los errores del parser', () => {
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    expect(parseErrorText('empty_input')).toBe('Type the weight and the reps, e.g. 60x8.');
    expect(parseErrorText('invalid_rpe')).toBe('RPE must be between 1 and 10.');
  });
});
