const GRADIENT_ID = 'area-gradient';

/**
 * `markers` flags points to circle — the exercise detail screen uses it for
 * records (SPEC 8.2). Positional, one boolean per point.
 */
export function AreaChart({ points, height = 150, markers }: {
  points: readonly number[]; height?: number; markers?: readonly boolean[];
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points.map((value, index) => {
    const x = 8 + (index / (points.length - 1)) * 464;
    const y = 140 - ((value - min) / span) * 110;
    return { x, y };
  });
  const line = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M${coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} L472,140 L8,140 Z`;
  const last = coords[coords.length - 1];
  return (
    <svg viewBox="0 0 480 150" style={{ width: '100%', height: 'auto', display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9184d9" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#9184d9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="8" y1={height - 10} x2="472" y2={height - 10} stroke="var(--color-divider)" strokeWidth="1" />
      <path d={area} fill={`url(#${GRADIENT_ID})`} />
      <polyline fill="none" stroke="#9184d9" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" points={line} />
      {coords.map((point, index) => (
        markers?.[index] === true
          ? <circle key={index} cx={point.x} cy={point.y} r="2.75" fill="#9184d9" />
          : null
      ))}
      {last !== undefined && (
        <circle cx={last.x} cy={last.y} r="3.5" fill="var(--color-bg)" stroke="#9184d9" strokeWidth="1.75" />
      )}
    </svg>
  );
}
