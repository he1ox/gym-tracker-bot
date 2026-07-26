import { VOLUME_TARGET_MAX } from '@gym-tracker/core';

export interface VolumeBarRow {
  label: string;
  count: number;
}

// Diez celdas: la barra llena equivale al techo de la banda del SPEC §8.1, así que
// cada celda son dos series. El '│' va tras la quinta y marca el mínimo de 10.
const CELLS = 10;
const SETS_PER_CELL = VOLUME_TARGET_MAX / CELLS;
const HALF = CELLS / 2;

/**
 * Barras de bloque para el `<pre>` de la bienvenida.
 *
 * Los tres glifos (`█░│`) y las etiquetas latinas son unidades UTF-16 simples, así
 * que `padEnd`/`padStart` cuadran igual que en la tabla de métricas de welcome.ts.
 *
 * Contrapartida registrada: la escala no dice nada por encima de 20 (la barra ya
 * está llena) y la cifra exacta, que va al lado, manda sobre la barra.
 */
export function volumeBars(rows: readonly VolumeBarRow[]): string[] {
  if (rows.length === 0) {
    return [];
  }
  // Ancho calculado, no constante: "Deltoide posterior" no cabe en los 14
  // caracteres que usa la tabla de métricas.
  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  const countWidth = Math.max(...rows.map((row) => String(row.count).length));

  return rows.map((row) => {
    const filled = Math.min(CELLS, Math.round(row.count / SETS_PER_CELL));
    const cells = '█'.repeat(filled) + '░'.repeat(CELLS - filled);
    const bar = `${cells.slice(0, HALF)}│${cells.slice(HALF)}`;
    return `${row.label.padEnd(labelWidth)} ${bar} ${String(row.count).padStart(countWidth)}`;
  });
}
