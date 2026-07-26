import { Chart, BarController, BarElement, CategoryScale, LinearScale } from 'chart.js';
import type { Plugin } from 'chart.js';
import { Canvas } from 'skia-canvas';
import { describe, expect, it } from 'vitest';

// PNG header: 8-byte signature, then the IHDR chunk with width/height as big-endian.
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect([...buffer.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 560;
const BACKGROUND = '#161826';
const BACKGROUND_RGBA = [0x16, 0x18, 0x26, 255];

// Top-right corner of the canvas: this horizontal bar chart only draws bars, gridlines
// and tick labels in the left/bottom bulk of the canvas, so this pixel is never touched
// by the chart's own draw calls — whatever is here at the end reflects only what the
// canvas background (fillRect vs. plugin) left behind, not chart content.
const PROBE_X = 995;
const PROBE_Y = 5;

function buildChart(
  ctx: CanvasRenderingContext2D,
  plugins: Plugin[] = [],
): Chart {
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Pecho', 'Cuádriceps', 'Bíceps'],
      datasets: [{ data: [14, 22, 6], backgroundColor: '#b5abfc' }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#e9e9ed', font: { size: 16 } } },
        y: { ticks: { color: '#e9e9ed', font: { size: 18 } } },
      },
    },
    plugins,
  });
}

describe('spike: chart.js on top of skia-canvas', () => {
  Chart.register(BarController, BarElement, CategoryScale, LinearScale);

  it('draws a 1000x560 PNG with no DOM', async () => {
    const canvas = new Canvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const chart = buildChart(ctx as unknown as CanvasRenderingContext2D);

    const buffer = await canvas.toBuffer('png');
    chart.destroy();

    expect(pngSize(buffer)).toEqual({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
    // Save the PNG to look at it on the phone (step 5).
    const { writeFile } = await import('node:fs/promises');
    await writeFile('spike-chart.png', buffer);
  });

  it('wipes a background painted before the chart is constructed', () => {
    const canvas = new Canvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const chart = buildChart(ctx as unknown as CanvasRenderingContext2D);
    const pixel = ctx.getImageData(PROBE_X, PROBE_Y, 1, 1).data;
    chart.destroy();

    // Chart.js clears the whole canvas on its own render pass, so the pre-fill does
    // not survive: the pixel comes back fully transparent, not the painted color.
    expect(Array.from(pixel)).toEqual([0, 0, 0, 0]);
    expect(Array.from(pixel)).not.toEqual(BACKGROUND_RGBA);
  });

  it('keeps a background painted from a beforeDraw plugin', () => {
    const canvas = new Canvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    const backgroundPlugin: Plugin = {
      id: 'background',
      beforeDraw(chartInstance) {
        const { ctx: chartCtx, width, height } = chartInstance;
        chartCtx.save();
        chartCtx.fillStyle = BACKGROUND;
        chartCtx.fillRect(0, 0, width, height);
        chartCtx.restore();
      },
    };

    const chart = buildChart(ctx as unknown as CanvasRenderingContext2D, [backgroundPlugin]);
    const pixel = ctx.getImageData(PROBE_X, PROBE_Y, 1, 1).data;
    chart.destroy();

    // This is the recipe Task 6 must copy: painting the background from inside a
    // beforeDraw plugin runs after Chart.js's own clear, so it survives the render.
    expect(Array.from(pixel)).toEqual(BACKGROUND_RGBA);
  });
});
