import type { SetRow } from '../presenters/sessions';

const COLUMNS = '34px 1fr 64px 64px';

export function SetTable({ rows }: { rows: readonly SetRow[] }) {
  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: COLUMNS, gap: 8, padding: '0 2px 6px',
        fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'color-mix(in srgb, var(--color-text) 50%, transparent)',
      }}>
        <span>Serie</span><span>Peso × reps</span>
        <span style={{ textAlign: 'center' }}>RPE</span>
        <span style={{ textAlign: 'center' }}>Descanso</span>
      </div>
      {rows.map((row, index) => (
        <div key={index} style={{
          display: 'grid', gridTemplateColumns: COLUMNS, gap: 8, alignItems: 'center',
          padding: '6px 2px', borderBottom: '1px solid var(--color-divider)',
          opacity: row.isWarmup ? 0.6 : 1,
        }}>
          <span style={{
            textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-heading)',
            color: `color-mix(in srgb, var(--color-text) ${row.isWarmup ? 40 : 65}%, transparent)`,
          }}>{row.label}</span>
          <span style={{ fontSize: 13.5 }}>
            {row.load}
            {row.isWarmup && <span className="text-muted" style={{ fontSize: 11 }}> · calentamiento</span>}
          </span>
          <span style={{ textAlign: 'center', fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 78%, transparent)' }}>{row.rpe}</span>
          <span style={{ textAlign: 'center', fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>{row.rest}</span>
        </div>
      ))}
    </>
  );
}
