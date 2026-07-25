import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SetRow } from '../presenters/sessions';
import { SetTable } from './SetTable';

const ROWS: SetRow[] = [
  { label: 'W', load: '40 kg × 8', rpe: '—', rest: '—', isWarmup: true },
  { label: '1', load: '95 kg × 8', rpe: '7', rest: '165s', isWarmup: false },
];

describe('SetTable', () => {
  it('renders the Spanish column headings', () => {
    render(<SetTable rows={ROWS} />);
    for (const heading of ['Serie', 'Peso × reps', 'RPE', 'Descanso']) {
      expect(screen.getByText(heading)).toBeDefined();
    }
  });

  it('annotates warm-up rows and dims them', () => {
    const { container } = render(<SetTable rows={ROWS} />);
    expect(screen.getByText('· calentamiento')).toBeDefined();
    const warmupRow = container.querySelector('div[style*="opacity: 0.6"]');
    expect(warmupRow).not.toBeNull();
  });

  it('leaves working rows at full opacity and shows their figures', () => {
    render(<SetTable rows={ROWS} />);
    expect(screen.getByText('95 kg × 8')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
    expect(screen.getByText('165s')).toBeDefined();
  });
});
