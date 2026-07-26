import { Chart, BarController, BarElement, CategoryScale, LinearScale } from 'chart.js';
import { Canvas } from 'skia-canvas';
import { describe, expect, it } from 'vitest';

// PNG header: 8-byte signature, then the IHDR chunk with width/height as big-endian.
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect([...buffer.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('spike: chart.js on top of skia-canvas', () => {
  it('draws a 1000x560 PNG with no DOM', async () => {
    Chart.register(BarController, BarElement, CategoryScale, LinearScale);
    const canvas = new Canvas(1000, 560);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#161826';
    ctx.fillRect(0, 0, 1000, 560);

    const chart = new Chart(ctx as unknown as CanvasRenderingContext2D, {
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
    });

    const buffer = await canvas.toBuffer('png');
    chart.destroy();

    expect(pngSize(buffer)).toEqual({ width: 1000, height: 560 });
    // Save the PNG to look at it on the phone (step 5).
    const { writeFile } = await import('node:fs/promises');
    await writeFile('spike-chart.png', buffer);
  });
});
