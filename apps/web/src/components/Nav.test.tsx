import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Nav } from './Nav';

describe('Nav', () => {
  it('shows the four screens in Spanish', () => {
    render(<Nav current="overview" />);
    for (const label of ['Resumen', 'Ejercicio', 'Sesiones', 'Rutinas']) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('marks the current screen', () => {
    render(<Nav current="routines" />);
    expect(screen.getByText('Rutinas').getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Resumen').getAttribute('aria-current')).toBeNull();
  });
});
