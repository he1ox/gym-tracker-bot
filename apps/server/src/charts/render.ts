import type { ChartConfiguration, Plugin } from 'chart.js';
import { CHART_HEIGHT, CHART_WIDTH, COLORS, FONT_FAMILY, LABEL_FONT_SIZE } from './theme';

type ChartModule = typeof import('chart.js');
type CanvasModule = typeof import('skia-canvas');

let loading: Promise<{ chart: ChartModule; canvas: CanvasModule }> | null = null;

/**
 * Carga diferida y memoizada. Con un `import` estático, el binario nativo de
 * skia-canvas se cargaría AL ARRANCAR EL PROCESO en toda instalación, incluidas
 * las que nunca ven una gráfica: arranque más lento y decenas de MB de RSS
 * residentes en un servicio que vive meses. Así, el coste se paga en el primer
 * dibujo y solo si llega.
 */
function load(): Promise<{ chart: ChartModule; canvas: CanvasModule }> {
  loading ??= (async () => {
    const [chart, canvas] = await Promise.all([import('chart.js'), import('skia-canvas')]);
    // Registro explícito, no `chart.js/auto`: así no se carga todo el paquete.
    chart.Chart.register(
      chart.BarController,
      chart.BarElement,
      chart.LineController,
      chart.LineElement,
      chart.PointElement,
      chart.CategoryScale,
      chart.LinearScale,
      chart.Filler,
    );
    chart.Chart.defaults.font.family = FONT_FAMILY;
    chart.Chart.defaults.font.size = LABEL_FONT_SIZE;
    chart.Chart.defaults.color = COLORS.text;
    return { chart, canvas };
  })();
  return loading;
}

// Chart.js borra el lienzo entero en su propio paso de render, así que un
// `fillRect` pintado ANTES de construir el `Chart` no sobrevive: el PNG sale con
// fondo transparente (probado en el spike de la Tarea 1). El fondo hay que
// pintarlo desde un plugin `beforeDraw`, que Chart.js ejecuta DESPUÉS de su
// propio borrado.
const backgroundPlugin: Plugin = {
  id: 'background',
  beforeDraw(chartInstance) {
    const { ctx: chartCtx, width, height } = chartInstance;
    chartCtx.save();
    chartCtx.fillStyle = COLORS.bg;
    chartCtx.fillRect(0, 0, width, height);
    chartCtx.restore();
  },
};

function withDefaults(config: ChartConfiguration): ChartConfiguration {
  // `responsive: false` y `animation: false`: sin ellos Chart.js no funciona headless.
  return { ...config, options: { responsive: false, animation: false, ...config.options } };
}

/**
 * Configuración → PNG. **No lanza nunca**: registra el fallo en stdout y devuelve
 * `null`, y quien llama lo trata como «no hay foto» y sigue con su texto. Este
 * diseño admite dos formas realistas de fallo (el `.node` que no carga en Windows,
 * el paquete de fuentes ausente en Docker), así que la degradación no es defensa
 * preventiva: es el camino esperado en esos entornos.
 */
export async function renderChart(config: ChartConfiguration): Promise<Buffer | null> {
  try {
    const { chart, canvas } = await load();
    const surface = new canvas.Canvas(CHART_WIDTH, CHART_HEIGHT);
    const context = surface.getContext('2d');

    // `as unknown as`: el contexto de skia-canvas implementa la superficie que
    // Chart.js usa, pero no declara el tipo del DOM. Es el puente entre las dos
    // librerías y vive solo aquí.
    const instance = new chart.Chart(context as unknown as CanvasRenderingContext2D, {
      ...withDefaults(config),
      plugins: [backgroundPlugin, ...(config.plugins ?? [])],
    });
    try {
      // `await` aunque skia-canvas devolviera el buffer de forma síncrona.
      return await surface.toBuffer('png');
    } finally {
      // Sin esto, cada render deja colgados el config, los datos y el canvas en el
      // registro global de instancias de Chart.js: una fuga lenta en un proceso
      // de larga vida.
      instance.destroy();
    }
  } catch (error) {
    console.error('[charts] render failed:', error);
    return null;
  }
}
