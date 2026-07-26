import { describe, expect, it } from 'vitest';
import { COLORS } from './theme';
import { weeklyVolumeChart } from './weekly-volume';

const rows = [
  { label: 'Cuádriceps', count: 22 },
  { label: 'Pecho', count: 14 },
  { label: 'Bíceps', count: 6 },
];

describe('weeklyVolumeChart', () => {
  it('conserva el orden de las filas que recibe', () => {
    const config = weeklyVolumeChart(rows);
    expect(config.data.labels).toEqual(['Cuádriceps', 'Pecho', 'Bíceps']);
  });

  it('pinta barras horizontales con las cuentas', () => {
    const config = weeklyVolumeChart(rows);
    expect(config.options?.indexAxis).toBe('y');
    expect(config.data.datasets[1]?.data).toEqual([22, 14, 6]);
  });

  it('colorea cada barra según la banda 10-20', () => {
    const config = weeklyVolumeChart(rows);
    expect(config.data.datasets[1]?.backgroundColor).toEqual([
      COLORS.barOutOfBand, // 22, por encima
      COLORS.barInBand, // 14, dentro
      COLORS.barOutOfBand, // 6, por debajo
    ]);
  });

  it('pinta la banda de referencia detrás de cada fila', () => {
    const config = weeklyVolumeChart(rows);
    expect(config.data.datasets[0]?.data).toEqual([[10, 20], [10, 20], [10, 20]]);
    expect(config.data.datasets[0]?.backgroundColor).toBe(COLORS.bandFill);
  });

  it('deja la banda dentro del lienzo en una semana floja', () => {
    // Sin el mínimo de VOLUME_TARGET_MAX + 4, un máximo de 3 dejaría la banda fuera.
    expect(weeklyVolumeChart([{ label: 'Pecho', count: 3 }]).options?.scales?.x?.max).toBe(24);
  });

  it('crece con la semana cuando alguna cuenta supera la banda', () => {
    expect(weeklyVolumeChart([{ label: 'Pecho', count: 31 }]).options?.scales?.x?.max).toBe(31);
  });

  it('produce una configuración válida sin filas', () => {
    const config = weeklyVolumeChart([]);
    expect(config.data.labels).toEqual([]);
    expect(config.data.datasets[1]?.data).toEqual([]);
    expect(config.options?.scales?.x?.max).toBe(24);
  });
});
