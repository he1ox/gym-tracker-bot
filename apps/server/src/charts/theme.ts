/**
 * Paleta Nocturne con colores LITERALES: las `var(--color-*)` del dashboard no
 * existen fuera del DOM. Los valores salen de `apps/web/src/styles/nocturne.css`
 * y de `apps/web/src/presenters/format.ts`, para que las dos superficies se vean
 * iguales.
 */
export const COLORS = {
  bg: '#161826',
  text: '#e9e9ed',
  divider: 'rgba(233,233,237,0.16)',
  track: '#292b31',
  accent: '#9184d9',
  barInBand: '#b5abfc',
  barOutOfBand: '#d4a15a',
  bandFill: 'rgba(145,132,217,0.13)',
  accentGradientStart: 'rgba(145,132,217,0.30)',
  accentGradientEnd: 'rgba(145,132,217,0)',
} as const;

// Telegram recomprime las fotos; con menos ancho las etiquetas se ven borrosas.
export const CHART_WIDTH = 1000;
export const CHART_HEIGHT = 560;

/**
 * Mínimos tipográficos. Más píxeles de lienzo no compensan una recompresión con
 * pérdida: lo que la sobrevive es tipografía grande y trazo grueso. Viven aquí,
 * con nombre, y no dispersos por las configuraciones.
 */
export const LABEL_FONT_SIZE = 18;
export const TICK_FONT_SIZE = 16;
export const LINE_WIDTH = 2;
export const ACCENT_LINE_WIDTH = 3;
export const POINT_RADIUS = 6;
export const BAR_THICKNESS = 26;

// Las del sistema: no se versiona ningún .ttf. Contrapartida registrada: la imagen
// no es idéntica entre plataformas y la imagen Docker de la Fase 4 tendrá que
// instalar un paquete de fuentes o las etiquetas saldrán vacías.
export const FONT_FAMILY = 'sans-serif';
