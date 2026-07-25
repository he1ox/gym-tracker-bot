import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VolumeBar } from './VolumeBar';

// CSSOM canonicalizes inline style colours to rgb() on read-back, in jsdom
// and in real browsers alike, so the hex token never appears verbatim here.
const ACCENT_DOWN_RGB = 'rgb(212, 161, 90)';

describe('VolumeBar', () => {
  it('shows label and count', () => {
    render(<VolumeBar label="Pecho" count={14} max={24} />);
    expect(screen.getByText('Pecho')).toBeDefined();
    expect(screen.getByText('14')).toBeDefined();
  });

  it('flags counts below the 10-20 band', () => {
    render(<VolumeBar label="Gemelos" count={6} max={24} />);
    expect(screen.getByText('6').getAttribute('style')).toContain(ACCENT_DOWN_RGB);
  });

  it('flags counts above the band', () => {
    render(<VolumeBar label="Abdominales" count={22} max={24} />);
    expect(screen.getByText('22').getAttribute('style')).toContain(ACCENT_DOWN_RGB);
  });

  it('leaves in-band counts without an amber colour override', () => {
    render(<VolumeBar label="Dorsal" count={18} max={24} />);
    expect(screen.getByText('18').getAttribute('style')).not.toContain('color:');
  });
});
