import type { RenderingParameters } from '../core/ParamStore';
import type { DyeField } from '../simulation/EulerianFluid2D';

interface GradientLUT {
  texture: Uint8ClampedArray;
  width: number;
}

export class FluidRenderer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private config: RenderingParameters;
  private gradient: GradientLUT;

  constructor(container: HTMLElement, config: RenderingParameters) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'aurora-canvas';
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to acquire 2D rendering context');
    }
    this.context = context;
    this.config = config;
    this.gradient = this.buildGradientLUT(config);
  }

  async init() {
    this.container.appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }

  updateConfig(config: RenderingParameters) {
    this.config = config;
    this.gradient = this.buildGradientLUT(config);
  }

  render(field: DyeField) {
    const { size, data } = field;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const image = this.context.getImageData(0, 0, width, height);
    const buffer = image.data;

    for (let y = 0; y < height; y++) {
      const sy = Math.floor((y / height) * size);
      for (let x = 0; x < width; x++) {
        const sx = Math.floor((x / width) * size);
        const base = data[sy * size + sx];
        const adjusted = Math.min(1, base * this.config.exposure);
        const color = this.sampleGradient(adjusted);
        const idx = (y * width + x) * 4;
        buffer[idx] = color[0];
        buffer[idx + 1] = color[1];
        buffer[idx + 2] = color[2];
        buffer[idx + 3] = 255;
      }
    }

    this.context.putImageData(image, 0, 0);
  }

  getViewport() {
    const rect = this.canvas.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  }

  setMode(mode: RenderingParameters['mode']) {
    this.config.mode = mode;
  }

  private resize = () => {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
  };

  private buildGradientLUT(config: RenderingParameters): GradientLUT {
    const width = 256;
    const texture = new Uint8ClampedArray(width * 4);
    for (let i = 0; i < width; i++) {
      const t = i / (width - 1);
      const color = this.interpolateStops(config.gradientStops, t);
      texture[i * 4] = color[0];
      texture[i * 4 + 1] = color[1];
      texture[i * 4 + 2] = color[2];
      texture[i * 4 + 3] = 255;
    }
    return { texture, width };
  }

  private sampleGradient(value: number): [number, number, number] {
    const clamped = Math.max(0, Math.min(0.999, value));
    const index = Math.floor(clamped * (this.gradient.width - 1));
    const lut = this.gradient.texture;
    return [lut[index * 4], lut[index * 4 + 1], lut[index * 4 + 2]];
  }

  private interpolateStops(stops: RenderingParameters['gradientStops'], t: number): [number, number, number] {
    if (stops.length === 0) return [255, 255, 255];
    if (stops.length === 1) return this.hexToRgb(stops[0].color);

    let left = stops[0];
    let right = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].position && t <= stops[i + 1].position) {
        left = stops[i];
        right = stops[i + 1];
        break;
      }
    }
    const span = right.position - left.position || 1;
    const localT = Math.min(1, Math.max(0, (t - left.position) / span));
    const leftColor = this.hexToRgb(left.color);
    const rightColor = this.hexToRgb(right.color);
    return [
      leftColor[0] + (rightColor[0] - leftColor[0]) * localT,
      leftColor[1] + (rightColor[1] - leftColor[1]) * localT,
      leftColor[2] + (rightColor[2] - leftColor[2]) * localT
    ];
  }

  private hexToRgb(hex: string): [number, number, number] {
    const sanitized = hex.replace('#', '');
    const bigint = parseInt(sanitized, 16);
    if (sanitized.length === 6) {
      return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    }
    if (sanitized.length === 3) {
      const r = (bigint >> 8) & 15;
      const g = (bigint >> 4) & 15;
      const b = bigint & 15;
      return [r * 17, g * 17, b * 17];
    }
    return [255, 255, 255];
  }
}
