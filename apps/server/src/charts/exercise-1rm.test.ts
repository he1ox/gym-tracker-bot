import { describe, expect, it } from 'vitest';
import { MAX_SESSIONS, exercise1RMChart } from './exercise-1rm';
import { COLORS } from './theme';

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 5, 12, 0, 0);
const point = (dayOffset: number, best1RM: number, isRecord = false) => ({
  at: START + dayOffset * DAY,
  best1RM,
  isRecord,
});
const OPTIONS = { locale: 'es', timeZone: 'UTC', unit: 'kg' };

describe('exercise1RMChart', () => {
  it('reparte el eje X por tiempo, no por índice', () => {
    const config = exercise1RMChart([point(0, 100), point(7, 102), point(67, 104)], OPTIONS);
    expect(config.options?.scales?.x?.type).toBe('linear');
    expect(config.data.datasets[0]?.data).toEqual([
      { x: START, y: 100 },
      { x: START + 7 * DAY, y: 102 },
      { x: START + 67 * DAY, y: 104 },
    ]);
  });

  it('se queda con las 12 sesiones más recientes', () => {
    const points = Array.from({ length: 20 }, (_, i) => point(i, 100 + i));
    const config = exercise1RMChart(points, OPTIONS);
    const data = config.data.datasets[0]?.data as Array<{ x: number; y: number }>;
    expect(data).toHaveLength(MAX_SESSIONS);
    expect(data[0]?.y).toBe(108); // la 9.ª de 20
    expect(data[MAX_SESSIONS - 1]?.y).toBe(119);
  });

  it('marca con un punto solo las sesiones récord', () => {
    const config = exercise1RMChart([point(0, 100, true), point(7, 99), point(14, 105, true)], OPTIONS);
    expect(config.data.datasets[0]?.pointRadius).toEqual([expect.any(Number), 0, expect.any(Number)]);
    const radii = config.data.datasets[0]?.pointRadius as number[];
    expect(radii[0]).toBeGreaterThan(0);
    expect(radii[2]).toBeGreaterThan(0);
  });

  it('formatea las marcas del eje X como fechas del locale pedido', () => {
    const config = exercise1RMChart([point(0, 100), point(7, 102)], OPTIONS);
    const callback = config.options?.scales?.x?.ticks?.callback;
    expect(typeof callback).toBe('function');
    // El callback recibe el valor numérico del eje: epoch en milisegundos.
    const label = (callback as (v: number) => string).call(null, START);
    expect(label).toContain('05'); // 5 de enero
  });

  it('usa el acento y un trazo grueso', () => {
    const config = exercise1RMChart([point(0, 100), point(7, 102)], OPTIONS);
    expect(config.data.datasets[0]?.borderColor).toBe(COLORS.accent);
    expect(config.data.datasets[0]?.borderWidth).toBeGreaterThanOrEqual(2);
  });

  it('etiqueta el eje Y con la unidad configurada, sin convertir nada', () => {
    const config = exercise1RMChart([point(0, 100)], { ...OPTIONS, unit: 'lb' });
    expect(config.options?.scales?.y?.title).toMatchObject({ display: true, text: 'lb' });
  });

  it('rellena con un degradado que se calcula al pintar', () => {
    const config = exercise1RMChart([point(0, 100), point(7, 102)], OPTIONS);
    const fill = config.data.datasets[0]?.backgroundColor;
    expect(typeof fill).toBe('function');
    // Antes del primer layout no hay área de dibujo: no puede reventar.
    expect((fill as (c: unknown) => unknown)({ chart: { ctx: null, chartArea: null } })).toBe('transparent');
  });

  it('produce una configuración válida sin puntos', () => {
    const config = exercise1RMChart([], OPTIONS);
    expect(config.data.datasets[0]?.data).toEqual([]);
  });
});
