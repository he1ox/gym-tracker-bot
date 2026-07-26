import { InputFile } from 'grammy';
import type { DatabaseSync } from 'node:sqlite';
import { weeklyVolumeChart } from '../charts/weekly-volume';
import { renderChart } from '../charts/render';
import { currentLocale } from '../i18n/current';
import { groupLabel } from '../i18n/exercise-name';
import { buildUserSummary } from '../services/overview-service';
import { isoWeekRange } from '../services/weekly-volume';
import type { CustomContext } from './context';
import { T } from './texts';

function shortDate(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat(currentLocale(), { timeZone, day: '2-digit', month: '2-digit' }).format(
    new Date(epochMs),
  );
}

/**
 * Gráfica del volumen de la semana en curso, como MENSAJE NUEVO.
 *
 * Silenciosa por diseño en los dos caminos de «no hay foto»: semana sin series
 * efectivas (se da al cerrar un entrenamiento en el que no se registró nada) y
 * render fallido (`renderChart` devuelve `null`). Quien llama sigue con su texto.
 */
export async function sendWeeklyChart(
  ctx: CustomContext,
  db: DatabaseSync,
  timezone: string,
): Promise<void> {
  const now = Date.now();
  const { weeklyVolume } = buildUserSummary(db, { userId: ctx.user.id, timezone, now });
  if (weeklyVolume.length === 0) {
    return;
  }

  const buffer = await renderChart(
    weeklyVolumeChart(weeklyVolume.map((row) => ({ label: groupLabel(row.group), count: row.count }))),
  );
  if (buffer === null) {
    return;
  }

  const { fromMs, toMs } = isoWeekRange(now, timezone);
  const total = weeklyVolume.reduce((sum, row) => sum + row.count, 0);
  await ctx.replyWithPhoto(new InputFile(buffer, 'weekly-volume.png'), {
    caption: T.chartWeeklyCaption(shortDate(fromMs, timezone), shortDate(toMs, timezone), total),
  });
}
