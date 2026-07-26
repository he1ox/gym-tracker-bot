import { describe, expect, it } from 'vitest';
import { volumeBars } from './volume-bars';

describe('volumeBars', () => {
  it('pinta una celda por cada dos series, con el separador tras la quinta', () => {
    expect(volumeBars([{ label: 'Pecho', count: 14 }])).toEqual(['Pecho █████│██░░░ 14']);
  });

  it('redondea al alza la media celda', () => {
    // 7 series → 3.5 celdas → 4.
    expect(volumeBars([{ label: 'X', count: 7 }])[0]).toContain('████░│░░░░░');
  });

  it('llena la barra a partir de 20 y no se pasa', () => {
    expect(volumeBars([{ label: 'X', count: 22 }])[0]).toContain('█████│█████');
    expect(volumeBars([{ label: 'X', count: 20 }])[0]).toContain('█████│█████');
  });

  it('pinta una celda con una sola serie, para que la fila no parezca vacía', () => {
    expect(volumeBars([{ label: 'X', count: 1 }])[0]).toContain('█░░░░│░░░░░');
  });

  it('calcula el ancho de etiqueta sobre las filas presentes', () => {
    const [long, short] = volumeBars([
      { label: 'Deltoides posterior', count: 4 },
      { label: 'Pecho', count: 12 },
    ]);
    expect(long?.startsWith('Deltoides posterior ')).toBe(true);
    expect(short?.startsWith('Pecho ')).toBe(true);
    // La barra arranca en la misma columna en las dos filas, y las dos miden igual.
    expect(short?.indexOf('█')).toBe(long?.indexOf('█'));
    expect(long?.length).toBe(short?.length);
  });

  it('alinea las cifras a la derecha', () => {
    const rows = volumeBars([{ label: 'A', count: 6 }, { label: 'B', count: 14 }]);
    expect(rows[0]?.endsWith(' 6')).toBe(true);
    expect(rows[1]?.endsWith('14')).toBe(true);
    expect(rows[0]?.length).toBe(rows[1]?.length);
  });

  it('no pinta nada sin filas', () => {
    expect(volumeBars([])).toEqual([]);
  });
});
