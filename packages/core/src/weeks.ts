const MS_PER_WEEK = 7 * 86_400_000;

export function isoWeekKey(instant: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(instant).split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Could not extract local date for timezone ${timeZone}`);
  }
  // ISO-8601: a date belongs to the week of its Thursday; week 1 contains Jan 4.
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // 0 = Monday
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 3);
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayOfWeek = (jan4.getUTCDay() + 6) % 7;
  const week1Thursday = new Date(Date.UTC(isoYear, 0, 4 - jan4DayOfWeek + 3));
  const week = 1 + Math.round((date.getTime() - week1Thursday.getTime()) / MS_PER_WEEK);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function compareWeekKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
