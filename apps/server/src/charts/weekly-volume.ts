import { VOLUME_TARGET_MAX, VOLUME_TARGET_MIN, isVolumeInBand } from '@gym-tracker/core';
import type { ChartConfiguration } from 'chart.js';
import { BAR_THICKNESS, COLORS, LABEL_FONT_SIZE, TICK_FONT_SIZE } from './theme';
import type { VolumeBarRow } from './volume-bars';

// Margen sobre el techo de la banda, igual que el dashboard
// (apps/web/src/presenters/overview.ts): sin él, una semana floja deja la banda
// 10-20 fuera del lienzo y la referencia desaparece justo cuando más importa.
const AXIS_HEADROOM = 4;

/**
 * Barras horizontales de series efectivas por grupo muscular, con la banda 10-20
 * de fondo (SPEC §8.1). Las filas llegan ya ordenadas y filtradas por
 * `weeklyGroupCounts`; esta función no reordena ni descarta nada.
 *
 * Función pura: no toca canvas ni Telegram. Quien la pinta es `render.ts`.
 */
export function weeklyVolumeChart(rows: readonly VolumeBarRow[]): ChartConfiguration<'bar'> {
  const counts = rows.map((row) => row.count);
  // Barra coloreada según la banda, con el mismo criterio que VolumeBar.tsx: con un
  // acento único, las dos superficies contarían historias distintas del mismo dato.
  const colors = counts.map((count) => (isVolumeInBand(count) ? COLORS.barInBand : COLORS.barOutOfBand));

  return {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          // Barras flotantes [min, max]: la banda de referencia, sin plugins.
          label: 'band',
          data: rows.map(() => [VOLUME_TARGET_MIN, VOLUME_TARGET_MAX] as [number, number]),
          backgroundColor: COLORS.bandFill,
          // `grouped: false` en los dos: si no, las barras se repartirían la fila
          // en vez de superponerse.
          grouped: false,
          barPercentage: 1,
          categoryPercentage: 1,
        },
        {
          label: 'sets',
          data: [...counts],
          backgroundColor: colors,
          grouped: false,
          barThickness: BAR_THICKNESS,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          max: Math.max(VOLUME_TARGET_MAX + AXIS_HEADROOM, ...counts),
          ticks: { color: COLORS.text, font: { size: TICK_FONT_SIZE }, precision: 0 },
          grid: { color: COLORS.divider },
          border: { color: COLORS.divider },
        },
        y: {
          ticks: { color: COLORS.text, font: { size: LABEL_FONT_SIZE } },
          grid: { display: false },
          border: { color: COLORS.divider },
        },
      },
    },
  };
}
