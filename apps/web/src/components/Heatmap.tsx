/**
 * 0-4 are training intensities; 'empty' is a cell outside the recorded range
 * (a future date in the current week), which must not read as a rest day.
 */
export type HeatmapLevel = 0 | 1 | 2 | 3 | 4 | 'empty';

export interface HeatmapDay {
  level: HeatmapLevel;
  title: string;
}

const LEVEL_BG = [
  '#1e2030',
  'var(--color-accent-800)',
  'var(--color-accent-700)',
  'var(--color-accent-500)',
  'var(--color-accent-400)',
] as const;

const ROW_LABELS = ['Lun', '', 'Mié', '', 'Vie', '', 'Dom'] as const;

export function Heatmap({ weeks }: { weeks: ReadonlyArray<ReadonlyArray<HeatmapDay>> }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'space-between',
        paddingTop: 1, fontSize: 9, color: 'color-mix(in srgb, var(--color-text) 45%, transparent)',
      }}>
        {ROW_LABELS.map((label, index) => (
          <span key={index} style={{ height: 13, lineHeight: '13px' }}>{label}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map((day, dayIndex) => (
              <div key={dayIndex} title={day.title} style={{
                width: 13, height: 13, borderRadius: 2,
                background: day.level === 'empty' ? 'transparent' : LEVEL_BG[day.level],
              }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
