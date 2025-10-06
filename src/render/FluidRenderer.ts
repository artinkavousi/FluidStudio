import type { RenderingParameters } from '../core/ParamStore';
import type { DyeField } from '../simulation/EulerianFluid2D';

const VERTEX_SHADER = /* wgsl */ `
struct VSOut {
  @builtin(position) position : vec4<f32>;
  @location(0) uv : vec2<f32>;
};

@vertex
fn main(@location(0) position : vec2<f32>, @location(1) uv : vec2<f32>) -> VSOut {
  var output : VSOut;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = uv;
  return output;
}
`;

const FRAGMENT_SHADER = /* wgsl */ `
struct Uniforms {
  exposure : f32;
  mode : u32;
  fieldWidth : f32;
  fieldHeight : f32;
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var dyeSampler : sampler;
@group(0) @binding(2) var dyeTexture : texture_2d<f32>;
@group(0) @binding(3) var gradientSampler : sampler;
@group(0) @binding(4) var gradientTexture : texture_2d<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let dyeSample = textureSample(dyeTexture, dyeSampler, uv).r;
  let exposure = max(0.0, uniforms.exposure);
  let value = clamp(dyeSample * exposure, 0.0, 1.0);

  if (uniforms.mode == 0u) {
    let gradientUV = vec2<f32>(value, 0.5);
    let color = textureSample(gradientTexture, gradientSampler, gradientUV).rgb;
    return vec4<f32>(color, 1.0);
  }

  if (uniforms.mode == 1u) {
    return vec4<f32>(vec3<f32>(value), 1.0);
  }

  let texel = vec2<f32>(1.0 / max(uniforms.fieldWidth, 1.0), 1.0 / max(uniforms.fieldHeight, 1.0));
  let sx = textureSampleLevel(dyeTexture, dyeSampler, uv + vec2<f32>(texel.x, 0.0), 0.0).r -
           textureSampleLevel(dyeTexture, dyeSampler, uv - vec2<f32>(texel.x, 0.0), 0.0).r;
  let sy = textureSampleLevel(dyeTexture, dyeSampler, uv + vec2<f32>(0.0, texel.y), 0.0).r -
           textureSampleLevel(dyeTexture, dyeSampler, uv - vec2<f32>(0.0, texel.y), 0.0).r;
  let normal = normalize(vec3<f32>(sx, sy, 0.2));
  let encoded = normal * 0.5 + vec3<f32>(0.5, 0.5, 0.5);
  return vec4<f32>(encoded, 1.0);
}
`;

type GradientStop = RenderingParameters['gradientStops'][number];

export class FluidRenderer {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private config: RenderingParameters;

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private dyeTexture: GPUTexture | null = null;
  private dyeTextureView: GPUTextureView | null = null;
  private gradientTexture: GPUTexture | null = null;
  private gradientTextureView: GPUTextureView | null = null;
  private dyeSampler: GPUSampler | null = null;
  private gradientSampler: GPUSampler | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private bindGroupDirty = true;

  private fallbackContext: CanvasRenderingContext2D | null = null;
  private fallbackImageData: ImageData | null = null;

  private gradientWidth = 256;
  private gradientData: Uint8Array;
  private gradientClamped: Uint8ClampedArray;
  private dyeUpload = new Uint8Array(0);

  private webgpuReady = false;
  private lastFieldSize = 0;

  private uniformBufferData = new ArrayBuffer(16);
  private uniformFloats = new Float32Array(this.uniformBufferData);
  private uniformUint = new Uint32Array(this.uniformBufferData);

  constructor(container: HTMLElement, config: RenderingParameters) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'aurora-canvas';
    this.config = structuredClone(config);
    this.gradientData = this.buildGradientData(this.config.gradientStops);
    this.gradientClamped = new Uint8ClampedArray(this.gradientData);
  }

  async init() {
    this.container.appendChild(this.canvas);
    const webgpuInitialised = await this.setupWebGPU();
    if (!webgpuInitialised) {
      this.setupFallback2D();
    }
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
    this.vertexBuffer?.destroy();
    this.uniformBuffer?.destroy();
    this.dyeTexture?.destroy();
    this.gradientTexture?.destroy();
    this.vertexBuffer = null;
    this.uniformBuffer = null;
    this.dyeTexture = null;
    this.gradientTexture = null;
    this.context = null;
    this.device = null;
    this.pipeline = null;
    this.bindGroup = null;
    this.fallbackContext = null;
    this.fallbackImageData = null;
  }

  updateConfig(config: RenderingParameters) {
    this.config = structuredClone(config);
    this.gradientData = this.buildGradientData(this.config.gradientStops);
    this.gradientClamped = new Uint8ClampedArray(this.gradientData);
    if (this.webgpuReady) {
      this.ensureGradientTexture();
      if (this.lastFieldSize > 0) {
        this.writeUniformBuffer(this.lastFieldSize);
      }
    }
  }

  render(field: DyeField) {
    if (this.webgpuReady) {
      this.renderWebGPU(field);
    } else {
      this.renderFallback(field);
    }
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
    if (this.config.mode === mode) return;
    this.config.mode = mode;
    if (this.webgpuReady && this.lastFieldSize > 0) {
      this.writeUniformBuffer(this.lastFieldSize);
    }
  }

  private async setupWebGPU(): Promise<boolean> {
    const gpu = navigator.gpu as GPU | undefined;
    if (!gpu) {
      return false;
    }

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return false;
    }

    const device = await adapter.requestDevice();
    const context = this.canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) {
      return false;
    }

    this.device = device;
    this.context = context;
    this.format = gpu.getPreferredCanvasFormat();

    const vertexData = new Float32Array([
      -1, -1, 0, 0,
      3, -1, 2, 0,
      -1, 3, 0, 2
    ]);

    this.vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertexData.buffer, vertexData.byteOffset, vertexData.byteLength);

    this.uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.dyeSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    this.gradientSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: VERTEX_SHADER }),
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 16,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' }
            ]
          }
        ]
      },
      fragment: {
        module: device.createShaderModule({ code: FRAGMENT_SHADER }),
        entryPoint: 'main',
        targets: [
          {
            format: this.format
          }
        ]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });

    this.webgpuReady = true;
    this.bindGroupDirty = true;
    this.ensureGradientTexture();
    this.writeUniformBuffer(Math.max(1, this.lastFieldSize));
    return true;
  }

  private setupFallback2D() {
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to acquire WebGPU or 2D rendering context');
    }
    this.fallbackContext = context;
    this.webgpuReady = false;
  }

  private renderWebGPU(field: DyeField) {
    if (!this.device || !this.context || !this.pipeline || !this.vertexBuffer || !this.uniformBuffer) {
      return;
    }

    this.ensureDyeTexture(field.size);
    this.ensureGradientTexture();
    this.writeUniformBuffer(field.size);

    const pixels = this.prepareDyeUpload(field);
    if (this.dyeTexture) {
      this.device.queue.writeTexture(
        { texture: this.dyeTexture },
        pixels as BufferSource,
        { bytesPerRow: field.size * 4 },
        { width: field.size, height: field.size, depthOrArrayLayers: 1 }
      );
    }

    if (this.bindGroupDirty) {
      this.updateBindGroup();
    }

    if (!this.bindGroup) {
      return;
    }

    const currentTexture = this.context.getCurrentTexture();
    const view = currentTexture.createView();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });

    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  private renderFallback(field: DyeField) {
    if (!this.fallbackContext) {
      return;
    }

    const { size, data } = field;
    const width = this.canvas.width;
    const height = this.canvas.height;

    if (!this.fallbackImageData || this.fallbackImageData.width !== width || this.fallbackImageData.height !== height) {
      this.fallbackImageData = this.fallbackContext.createImageData(width, height);
    }

    const image = this.fallbackImageData;
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

    this.fallbackContext.putImageData(image, 0, 0);
  }

  private resize = () => {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    if (this.context && this.device && this.format) {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'premultiplied'
      });
    }
  };

  private ensureDyeTexture(size: number) {
    if (!this.device) {
      return;
    }
    if (!this.dyeTexture || this.lastFieldSize !== size) {
      this.dyeTexture?.destroy();
      this.dyeTexture = this.device.createTexture({
        size: { width: size, height: size, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      });
      this.dyeTextureView = this.dyeTexture.createView();
      this.bindGroupDirty = true;
      this.lastFieldSize = size;
    }
  }

  private ensureGradientTexture() {
    if (!this.device) {
      return;
    }
    if (!this.gradientTexture) {
      this.gradientTexture = this.device.createTexture({
        size: { width: this.gradientWidth, height: 1, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      });
      this.gradientTextureView = this.gradientTexture.createView();
      this.bindGroupDirty = true;
    }

    this.device.queue.writeTexture(
      { texture: this.gradientTexture },
      this.gradientData as BufferSource,
      { bytesPerRow: this.gradientWidth * 4 },
      { width: this.gradientWidth, height: 1, depthOrArrayLayers: 1 }
    );
  }

  private updateBindGroup() {
    if (!this.device || !this.pipeline || !this.uniformBuffer || !this.dyeSampler || !this.gradientSampler) {
      return;
    }
    if (!this.dyeTextureView || !this.gradientTextureView) {
      return;
    }

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.dyeSampler },
        { binding: 2, resource: this.dyeTextureView },
        { binding: 3, resource: this.gradientSampler },
        { binding: 4, resource: this.gradientTextureView }
      ]
    });

    this.bindGroupDirty = false;
  }

  private writeUniformBuffer(fieldSize: number) {
    if (!this.device || !this.uniformBuffer) {
      return;
    }
    const size = Math.max(1, fieldSize);
    this.uniformFloats[0] = this.config.exposure;
    this.uniformUint[1] = this.modeToIndex(this.config.mode);
    this.uniformFloats[2] = size;
    this.uniformFloats[3] = size;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformBufferData);
  }

  private prepareDyeUpload(field: DyeField): Uint8Array {
    const { size, data } = field;
    const total = size * size * 4;
    if (this.dyeUpload.length !== total) {
      this.dyeUpload = new Uint8Array(total);
    }

    const pixels = this.dyeUpload;
    for (let i = 0; i < data.length; i++) {
      const value = Math.min(255, Math.max(0, Math.floor(data[i] * 255)));
      const idx = i * 4;
      pixels[idx] = value;
      pixels[idx + 1] = value;
      pixels[idx + 2] = value;
      pixels[idx + 3] = 255;
    }
    return pixels;
  }

  private buildGradientData(stops: GradientStop[]): Uint8Array {
    const width = this.gradientWidth;
    const texture = new Uint8Array(width * 4);
    for (let i = 0; i < width; i++) {
      const t = i / (width - 1);
      const color = this.interpolateStops(stops, t);
      texture[i * 4] = color[0];
      texture[i * 4 + 1] = color[1];
      texture[i * 4 + 2] = color[2];
      texture[i * 4 + 3] = 255;
    }
    return texture;
  }

  private sampleGradient(value: number): [number, number, number] {
    const clamped = Math.max(0, Math.min(0.999, value));
    const index = Math.floor(clamped * (this.gradientWidth - 1));
    const lut = this.gradientClamped;
    return [lut[index * 4], lut[index * 4 + 1], lut[index * 4 + 2]];
  }

  private interpolateStops(stops: GradientStop[], t: number): [number, number, number] {
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

  private modeToIndex(mode: RenderingParameters['mode']): number {
    switch (mode) {
      case 'gradient':
        return 0;
      case 'emitter':
        return 1;
      case 'distortion':
        return 2;
      default:
        return 0;
    }
  }
}
