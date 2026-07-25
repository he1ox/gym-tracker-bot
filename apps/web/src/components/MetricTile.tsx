import type { ReactNode } from 'react';

export function MetricTile({
  label, value, unit, footer,
}: { label: string; value: string; unit?: string; footer?: ReactNode }) {
  return (
    <div className="card elev-sm" style={{ padding: 'var(--space-6)', gap: 'var(--space-2)' }}>
      <span style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'color-mix(in srgb, var(--color-text) 55%, transparent)',
      }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
        {unit !== undefined && (
          <span style={{ fontSize: 18, color: 'color-mix(in srgb, var(--color-text) 60%, transparent)' }}>
            {' '}{unit}
          </span>
        )}
      </span>
      {footer !== undefined && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>{footer}</span>
      )}
    </div>
  );
}
