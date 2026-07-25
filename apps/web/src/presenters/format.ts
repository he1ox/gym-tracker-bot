/** The design's up/down pair: accent for progress, amber for regression. */
export const ACCENT_UP = 'var(--color-accent-300)';
export const ACCENT_DOWN = '#d4a15a';

// `useGrouping: 'always'` is required: with the default 'auto' grouping,
// this ICU build applies CLDR's "min2" rule for es-ES and skips the
// thousands separator when the leading group would have a single digit
// (e.g. 1234.5 -> "1234,5" instead of "1.234,5"). Forcing 'always' matches
// the design's expected output regardless of that CLDR default.
const NUMBER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' });

export function formatKg(value: number): string {
  return NUMBER.format(value);
}

export function formatDelta(value: number, unit: string): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${NUMBER.format(Math.abs(value))} ${unit}`;
}

export function deltaColor(value: number): string {
  return value >= 0 ? ACCENT_UP : ACCENT_DOWN;
}

export function formatDayMonth(date: Date, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('es-ES', { timeZone, weekday: 'short' }).format(date);
  const dayMonth = new Intl.DateTimeFormat('es-ES', { timeZone, day: 'numeric', month: 'short' }).format(date);
  return `${weekday} · ${dayMonth}`;
}

export function formatClockRange(from: Date, to: Date, timeZone: string): string {
  const clock = new Intl.DateTimeFormat('es-ES', { timeZone, hour: '2-digit', minute: '2-digit' });
  return `${clock.format(from)} – ${clock.format(to)}`;
}

export function formatLoad(weightKg: number, reps: number, isBodyweight: boolean): string {
  if (!isBodyweight) return `${NUMBER.format(weightKg)} kg × ${reps}`;
  return weightKg > 0 ? `PC+${NUMBER.format(weightKg)} × ${reps}` : `PC × ${reps}`;
}
