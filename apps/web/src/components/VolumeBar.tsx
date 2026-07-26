import { VOLUME_TARGET_MAX, VOLUME_TARGET_MIN, isVolumeInBand } from '@gym-tracker/core';
import { ACCENT_DOWN } from '../presenters/format';

export function VolumeBar({ label, count, max }: { label: string; count: number; max: number }) {
  const inBand = isVolumeInBand(count);
  const pct = (value: number) => `${Math.min(100, (value / max) * 100)}%`;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 30px', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ position: 'relative', height: 9, background: 'var(--color-neutral-900)', borderRadius: 5 }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: pct(VOLUME_TARGET_MIN),
          width: pct(VOLUME_TARGET_MAX - VOLUME_TARGET_MIN),
          background: 'color-mix(in srgb, var(--color-accent) 13%, transparent)',
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: pct(count),
          background: inBand ? 'var(--color-accent-400)' : ACCENT_DOWN, borderRadius: 5,
        }} />
      </div>
      <span style={{ fontSize: 13, textAlign: 'right', color: inBand ? undefined : ACCENT_DOWN }}>
        {count}
      </span>
    </div>
  );
}
