import { beforeAll, describe, expect, it } from 'vitest';
import { setCurrent, snapshot, t, unitLabel, weightStep, withCurrent } from './current';
import { initI18n } from './index';

describe('estado del update en curso', () => {
  beforeAll(() => initI18n());

  it('traduce con el idioma activo', () => {
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
    expect(t('todayLabel')).toBe('Hoy');
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    expect(t('todayLabel')).toBe('Today');
  });

  it('interpola variables y resuelve plurales', () => {
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
    expect(t('setsCount', { count: 1 })).toBe('1 serie');
    expect(t('setsCount', { count: 3 })).toBe('3 series');
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    expect(t('setsCount', { count: 1 })).toBe('1 set');
    expect(t('setsCount', { count: 3 })).toBe('3 sets');
  });

  it('expone la unidad y el salto sin convertir nada', () => {
    setCurrent({ locale: 'es', unit: 'lb', step: 5 });
    expect(unitLabel()).toBe('lb');
    expect(weightStep()).toBe(5);
  });

  it('withCurrent restaura el estado anterior incluso si fn lanza', () => {
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    const snap = snapshot();
    setCurrent({ locale: 'es', unit: 'lb', step: 10 });
    expect(() =>
      withCurrent(snap, () => {
        expect(t('todayLabel')).toBe('Today');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(t('todayLabel')).toBe('Hoy'); // el estado de fuera sobrevive
    expect(unitLabel()).toBe('lb');
  });

  it('lanza ante una clave inexistente en test', () => {
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
    expect(() => t('clave_que_no_existe')).toThrow(/sin traducir/);
  });
});
