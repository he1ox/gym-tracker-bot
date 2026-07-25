import { describe, expect, it } from 'vitest';
import { ACCENT_DOWN, ACCENT_UP, deltaColor, formatDelta, formatKg, formatLoad } from './format';

describe('formatKg', () => {
  it('uses Spanish thousand separators', () => {
    expect(formatKg(42_800)).toBe('42.800');
    expect(formatKg(1234.5)).toBe('1.234,5');
  });
});

describe('formatDelta', () => {
  it('uses a real minus sign, never a hyphen', () => {
    expect(formatDelta(-3, 'kg')).toBe('−3 kg');
  });
  it('prefixes a plus for gains', () => {
    expect(formatDelta(2.5, 'kg')).toBe('+2,5 kg');
  });
  it('treats zero as a gain, matching the design', () => {
    expect(formatDelta(0, 'min')).toBe('+0 min');
  });
});

describe('deltaColor', () => {
  it('maps sign to the accent ramp', () => {
    expect(deltaColor(1)).toBe(ACCENT_UP);
    expect(deltaColor(0)).toBe(ACCENT_UP);
    expect(deltaColor(-1)).toBe(ACCENT_DOWN);
  });
});

describe('formatLoad', () => {
  it('renders barbell loads', () => {
    expect(formatLoad(95, 8, false)).toBe('95 kg × 8');
  });
  it('renders bodyweight loads', () => {
    expect(formatLoad(0, 10, true)).toBe('PC × 10');
    expect(formatLoad(25, 6, true)).toBe('PC+25 × 6');
  });
});
