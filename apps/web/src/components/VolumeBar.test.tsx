import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACCENT_DOWN } from '../presenters/format';
import { VolumeBar } from './VolumeBar';

describe('VolumeBar', () => {
  it('shows label and count', () => {
    render(<VolumeBar label="Pecho" count={14} max={24} />);
    expect(screen.getByText('Pecho')).toBeDefined();
    expect(screen.getByText('14')).toBeDefined();
  });

  it('flags counts below the 10-20 band', () => {
    render(<VolumeBar label="Gemelos" count={6} max={24} />);
    expect(screen.getByText('6').getAttribute('style')).toContain(ACCENT_DOWN);
  });

  it('flags counts above the band', () => {
    render(<VolumeBar label="Abdominales" count={22} max={24} />);
    expect(screen.getByText('22').getAttribute('style')).toContain(ACCENT_DOWN);
  });

  it('leaves in-band counts on the accent colour', () => {
    render(<VolumeBar label="Dorsal" count={18} max={24} />);
    expect(screen.getByText('18').getAttribute('style')).not.toContain(ACCENT_DOWN);
  });
});
