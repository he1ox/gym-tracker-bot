import type { ChartConfiguration, ScriptableContext } from 'chart.js';
import type { SessionPoint } from '../services/exercise-sessions';
import { ACCENT_LINE_WIDTH, COLORS, LABEL_FONT_SIZE, LINE_WIDTH, POINT_RADIUS, TICK_FONT_SIZE } from './theme';

/** Ventana del spec §4.3: las 12 sesiones más recientes. */
export const MAX_SESSIONS = 12;

/** Máximo de marcas de fecha en el eje X para evitar sobreposición. */
const MAX_X_TICKS = 6;

/**
 * Evolución del mejor 1RM estimado por sesión, con las récord marcadas.
 *
 * Eje X TEMPORAL, `type: 'linear'` sobre epoch-ms: doce sesiones equiespaciadas
 * harían que dos meses sin pisar el gimnasio se vieran como una semana normal.
 * Deliberadamente NO se usa la escala `time` de Chart.js: exige
 * `chartjs-adapter-date-fns` y una librería de fechas, y DECISIONS (Fase 0) fijó
 * que no entra ninguna. `Intl.DateTimeFormat` da el mismo resultado sin dependencia.
 *
 * Nota: el dashboard reparte por índice (`AreaChart.tsx`). La divergencia es
 * consciente y está en DECISIONS; corregir el dashboard es alcance de otra tarea.
 */
export function exercise1RMChart(
  points: ReadonlyArray<SessionPoint>,
  options: { locale: string; timeZone: string; unit: string },
): ChartConfiguration<'line'> {
  const window = points.slice(-MAX_SESSIONS);
  const axisDate = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    day: '2-digit',
    month: 'short',
  });

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: '1RM',
          data: window.map((point) => ({ x: point.at, y: point.best1RM })),
          borderColor: COLORS.accent,
          borderWidth: ACCENT_LINE_WIDTH,
          tension: 0.25,
          fill: true,
          // El degradado necesita el contexto del canvas, que solo existe al
          // pintar: por eso es una función y no un color. Antes del primer layout
          // no hay `chartArea` y devolvemos un relleno neutro.
          backgroundColor: (context: ScriptableContext<'line'>) => {
            const { ctx, chartArea } = context.chart;
            if (!ctx || !chartArea) {
              return 'transparent';
            }
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, COLORS.accentGradientStart);
            gradient.addColorStop(1, COLORS.accentGradientEnd);
            return gradient;
          },
          pointRadius: window.map((point) => (point.isRecord ? POINT_RADIUS : 0)),
          pointBackgroundColor: COLORS.accent,
          pointBorderColor: COLORS.bg,
          pointBorderWidth: LINE_WIDTH,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: COLORS.text,
            font: { size: TICK_FONT_SIZE },
            maxTicksLimit: MAX_X_TICKS,
            callback: (value) => axisDate.format(new Date(Number(value))),
          },
          grid: { color: COLORS.divider },
          border: { color: COLORS.divider },
        },
        y: {
          // La unidad es solo una etiqueta: el histórico de quien cambie de kg a lb
          // mezcla unidades (SPEC §6) y aquí no se convierte nada. Se rotula con la
          // que esté configurada en este momento.
          title: { display: true, text: options.unit, color: COLORS.text, font: { size: LABEL_FONT_SIZE } },
          ticks: { color: COLORS.text, font: { size: LABEL_FONT_SIZE } },
          grid: { color: COLORS.divider },
          border: { color: COLORS.divider },
        },
      },
    },
  };
}
