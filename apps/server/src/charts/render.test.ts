import { describe, expect, it, vi } from 'vitest';
import { CHART_HEIGHT, CHART_WIDTH, COLORS } from './theme';
import { renderChart } from './render';
import { weeklyVolumeChart } from './weekly-volume';

// Cabecera PNG: firma de 8 bytes y chunk IHDR con ancho y alto en big-endian.
// Sin snapshots de píxeles: las fuentes del sistema difieren entre Windows, Linux
// y CI, y un test así sería inestable por diseño.
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect([...buffer.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// Esquina superior derecha del lienzo: esta gráfica de barras horizontales solo
// dibuja barras, líneas de rejilla y etiquetas en la zona izquierda/inferior, así
// que este píxel nunca lo toca el propio Chart.js — lo que haya aquí al final
// refleja solo el fondo del lienzo (relleno previo vs. plugin), no el contenido
// de la gráfica.
const PROBE_X = 995;
const PROBE_Y = 5;

// Deriva el RGBA esperado de COLORS.bg en vez de duplicar el literal: si la
// paleta cambia, el test sigue comprobando el color real, no una copia suya.
function hexToRgba(hex: string): number[] {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r, g, b, 255];
}

describe('renderChart', () => {
  it('devuelve un PNG del tamaño del lienzo', async () => {
    const buffer = await renderChart({
      type: 'bar',
      data: { labels: ['A', 'B'], datasets: [{ data: [1, 2] }] },
      options: { responsive: false, animation: false },
    });

    expect(buffer).not.toBeNull();
    expect(pngSize(buffer as Buffer)).toEqual({ width: CHART_WIDTH, height: CHART_HEIGHT });
  });

  it('devuelve null y registra el fallo en vez de lanzar', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    // 'radar' no está registrado: Chart.js lanza al construir la instancia. Necesita
    // al menos un dataset con datos: con `datasets: []` nunca se resuelve ningún
    // controlador y la construcción no lanza.
    const buffer = await renderChart({
      type: 'radar',
      data: { labels: ['a'], datasets: [{ data: [1] }] },
    });

    expect(buffer).toBeNull();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('ignora responsive/animation del caller: el render headless nunca se desactiva', async () => {
    // `responsive: false` y `animation: false` son invariantes, no valores por defecto:
    // un caller que pase lo contrario no debe poder reactivarlos, porque sin ellos
    // Chart.js no funciona en este entorno sin DOM.
    const buffer = await renderChart({
      type: 'bar',
      data: { labels: ['A', 'B'], datasets: [{ data: [1, 2] }] },
      // Chart.js solo admite `false` o un objeto de configuración para `animation`
      // (nunca `true`); un objeto no vacío es lo más parecido a «animación activada».
      options: { responsive: true, animation: { duration: 400 } },
    });

    expect(buffer).not.toBeNull();
    expect(pngSize(buffer as Buffer)).toEqual({ width: CHART_WIDTH, height: CHART_HEIGHT });
  });

  it('pinta el fondo de COLORS.bg incluso donde Chart.js no dibuja nada', async () => {
    // Excepción deliberada, solo en el test: `render.ts` es el único fichero de
    // producción que debe importar skia-canvas, pero aquí necesitamos decodificar
    // el PNG resultante para leer un píxel, y no hay otro decodificador permitido
    // en el proyecto (solo chart.js y skia-canvas son dependencias válidas).
    const { Canvas, loadImage } = await import('skia-canvas');
    const buffer = await renderChart({
      type: 'bar',
      data: {
        labels: ['Pecho', 'Cuádriceps', 'Bíceps'],
        datasets: [{ data: [14, 22, 6] }],
      },
      options: { indexAxis: 'y', plugins: { legend: { display: false } } },
    });

    expect(buffer).not.toBeNull();

    // Decodificamos el PNG resultante para leer el píxel de la esquina: si el fondo
    // se pintara con un fillRect ANTES de construir el Chart, Chart.js lo borraría
    // en su propio paso de render (borra el lienzo entero al dibujar) y este píxel
    // saldría transparente en vez de COLORS.bg. Este es el bug que un plugin
    // `beforeDraw` evita, y esta prueba es lo que impide que reaparezca.
    const image = await loadImage(buffer as Buffer);
    const canvas = new Canvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixel = ctx.getImageData(PROBE_X, PROBE_Y, 1, 1).data;

    expect(Array.from(pixel)).toEqual(hexToRgba(COLORS.bg));
  });

  it('no deja instancias huérfanas en el registro de Chart.js tras renders fallidos repetidos', async () => {
    // Excepción deliberada, solo en el test (igual que el `import('skia-canvas')` de
    // arriba): necesitamos inspeccionar el registro interno de Chart.js
    // (`Chart.instances`), algo que `render.ts` no expone ni debe exponer. El módulo
    // 'chart.js' ya está cacheado por Node desde la carga diferida de `renderChart`,
    // así que este `Chart` es la misma instancia de clase y el mismo registro.
    const { Chart } = await import('chart.js');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const before = Object.keys(Chart.instances).length;
    for (let i = 0; i < 5; i++) {
      // Mismo fallo que el segundo test: tipo no registrado con dataset no vacío,
      // para forzar que el CONSTRUCTOR de Chart.js lance (no un fallo posterior).
      const buffer = await renderChart({
        type: 'radar',
        data: { labels: ['a'], datasets: [{ data: [1] }] },
      });
      expect(buffer).toBeNull();
    }
    const after = Object.keys(Chart.instances).length;

    // Medido antes de esta corrección: cada construcción fallida dejaba una entrada
    // huérfana (el registro crecía de 1 en 1, 5 veces). Con la limpieza en el catch
    // de construcción, el registro vuelve al mismo tamaño que tenía antes.
    expect(after).toBe(before);

    errors.mockRestore();
  });

  it('dibuja la gráfica de volumen semanal', async () => {
    const buffer = await renderChart(weeklyVolumeChart([{ label: 'Pecho', count: 14 }]));
    expect(buffer).not.toBeNull();
    expect(pngSize(buffer as Buffer)).toEqual({ width: CHART_WIDTH, height: CHART_HEIGHT });
  });
});
