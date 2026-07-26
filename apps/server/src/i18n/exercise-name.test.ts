import { beforeAll, describe, expect, it } from 'vitest';
import { setCurrent } from './current';
import { displayName, groupLabel, localizeOptions } from './exercise-name';
import { initI18n } from './index';

describe('nombres traducibles', () => {
  beforeAll(() => initI18n());

  it('traduce los del catálogo por su clave', () => {
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    expect(displayName({ name: 'Sentadilla con barra', nameKey: 'squat_barbell' })).toBe('Barbell squat');
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
    expect(displayName({ name: 'Sentadilla con barra', nameKey: 'squat_barbell' })).toBe(
      'Sentadilla con barra',
    );
  });

  it('deja intactos los ejercicios propios', () => {
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    expect(displayName({ name: 'Mi invento raro', nameKey: null })).toBe('Mi invento raro');
  });

  it('traduce los grupos musculares', () => {
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    expect(groupLabel('chest')).toBe('Chest');
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
    expect(groupLabel('chest')).toBe('Pecho');
  });

  it('localizeOptions no muta la entrada', () => {
    setCurrent({ locale: 'en', unit: 'kg', step: 2.5 });
    const input = [{ id: 1, name: 'Dominadas', nameKey: 'pull_up' }];
    const output = localizeOptions(input);
    expect(output[0]?.name).toBe('Pull-up');
    expect(input[0]?.name).toBe('Dominadas');
  });
});
