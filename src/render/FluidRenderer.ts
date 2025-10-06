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
  colorParams : vec4<f32>;
  fieldParams : vec4<f32>;
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var dyeSampler : sampler;
@group(0) @binding(2) var dyeTexture : texture_2d<f32>;
@group(0) @binding(3) var gradientSampler : sampler;
@group(0) @binding(4) var gradientTexture : texture_2d<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let dyeSample = textureSample(dyeTexture, dyeSampler, uv).r;
  let exposure = max(0.0, uniforms.colorParams.x);
  let bloomStrength = clamp(uniforms.colorParams.y, 0.0, 1.0);
  let mode = u32(uniforms.colorParams.z + 0.5);
  let fieldWidth = max(1.0, uniforms.fieldParams.x);
  let fieldHeight = max(1.0, uniforms.fieldParams.y);

  let value = clamp(dyeSample * exposure, 0.0, 1.0);
  var color : vec3<f32>;

  if (mode == 0u) {
    let gradientUV = vec2<f32>(value, 0.5);
    color = textureSample(gradientTexture, gradientSampler, gradientUV).rgb;
  } else if (mode == 1u) {
    color = vec3<f32>(value);
  } else {
    let texel = vec2<f32>(1.0 / fieldWidth, 1.0 / fieldHeight);
    let sx = textureSampleLevel(dyeTexture, dyeSampler, uv + vec2<f32>(texel.x, 0.0), 0.0).r -
             textureSampleLevel(dyeTexture, dyeSampler, uv - vec2<f32>(texel.x, 0.0), 0.0).r;
    let sy = textureSampleLevel(dyeTexture, dyeSampler, uv + vec2<f32>(0.0, texel.y), 0.0).r -
             textureSampleLevel(dyeTexture, dyeSampler, uv - vec2<f32>(0.0, texel.y), 0.0).r;
    let normal = normalize(vec3<f32>(sx, sy, 0.2));
    color = normal * 0.5 + vec3<f32>(0.5, 0.5, 0.5);
  }

  let highlight = clamp(pow(value, 2.2) * bloomStrength, 0.0, 1.0);
  color = mix(color, vec3<f32>(1.0), highlight);
  return vec4<f32>(color, 1.0);
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
  private gradientDirty = true;
  private dyeUpload = new Uint8Array(0);
  private dyeRowPitch = 0;

  private webgpuReady = false;
  private lastFieldSize = 0;
  private contextSize = { width: 0, height: 0 };

  private uniformBufferData = new ArrayBuffer(32);
  private uniformFloats = new Float32Array(this.uniformBufferData);
  private uniformFieldSize = 1;
  private uniformDirty = true;

  private disposed = false;

  constructor(container: HTMLElement, config: RenderingParameters) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'aurora-canvas';
    this.config = structuredClone(config);
    this.gradientData = this.buildGradientData(this.config.gradientStops);
    this.gradientClamped = new Uint8ClampedArray(this.gradientData);
  }

  async init() {
    this.disposed = false;
    this.container.appendChild(this.canvas);
    const webgpuInitialised = await this.setupWebGPU();
    if (!webgpuInitialised) {
      this.setupFallback2D();
    }
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
    this.destroyGPUResources();
    this.fallbackContext = null;
    this.fallbackImageData = null;
  }

  updateConfig(config: RenderingParameters) {
    this.config = structuredClone(config);
    this.gradientData = this.buildGradientData(this.config.gradientStops);
    this.gradientClamped = new Uint8ClampedArray(this.gradientData);
    this.gradientDirty = true;
    this.uniformDirty = true;
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
    this.uniformDirty = true;
    if (this.webgpuReady && this.lastFieldSize > 0) {
      this.writeUniformBuffer(this.lastFieldSize);
    }
  }

  private async setupWebGPU(): Promise<boolean> {
    if (this.disposed) {
      return false;
    }

    const gpu = navigator.gpu as GPU | undefined;
    if (!gpu) {
      return false;
    }

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter || this.disposed) {
      return false;
    }

    const device = await adapter.requestDevice();
    if (this.disposed) {
      return false;
    }

    this.destroyGPUResources();

    const context = this.canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context || this.disposed) {
      return false;
    }

    this.device = device;
    this.context = context;
    this.format = gpu.getPreferredCanvasFormat();
    this.gradientDirty = true;
    this.uniformDirty = true;
    this.bindGroupDirty = true;

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
      size: this.uniformBufferData.byteLength,
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

    this.configureCanvasContext(this.canvas.width, this.canvas.height);
    this.webgpuReady = true;
    this.bindGroupDirty = true;
    this.ensureGradientTexture();
    this.writeUniformBuffer(Math.max(1, this.lastFieldSize || 1));
    void device.lost.then(this.handleDeviceLost);
    return true;
  }

  private setupFallback2D() {
    this.destroyGPUResources();
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to acquire WebGPU or 2D rendering context');
    }
    this.fallbackContext = context;
    this.webgpuReady = false;
    this.bindGroupDirty = true;
  }

  private renderWebGPU(field: DyeField) {
    if (!this.device || !this.context || !this.pipeline || !this.vertexBuffer || !this.uniformBuffer) {
      return;
    }

    this.configureCanvasContext(this.canvas.width, this.canvas.height);

    this.ensureDyeTexture(field.size);
    this.ensureGradientTexture();
    this.writeUniformBuffer(field.size);

    const pixels = this.prepareDyeUpload(field);
    const rowPitch = this.dyeRowPitch;
    if (this.dyeTexture && rowPitch > 0) {
      this.device.queue.writeTexture(
        { texture: this.dyeTexture },
        pixels as BufferSource,
        { bytesPerRow: rowPitch, rowsPerImage: field.size },
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
    if (width === 0 || height === 0 || size === 0) {
      return;
    }

    if (!this.fallbackImageData || this.fallbackImageData.width !== width || this.fallbackImageData.height !== height) {
      this.fallbackImageData = this.fallbackContext.createImageData(width, height);
    }

    const image = this.fallbackImageData;
    const buffer = image.data;
    const exposure = Math.max(0, this.config.exposure);
    const bloomStrength = Math.max(0, Math.min(1, this.config.bloomStrength));
    const mode = this.config.mode;
    const stride = size;
    const widthScale = width > 0 ? size / width : 0;
    const heightScale = height > 0 ? size / height : 0;

    for (let y = 0; y < height; y++) {
      const sampleY = Math.min(size - 1, Math.floor(y * heightScale));
      const northY = Math.max(sampleY - 1, 0);
      const southY = Math.min(sampleY + 1, size - 1);
      for (let x = 0; x < width; x++) {
        const sampleX = Math.min(size - 1, Math.floor(x * widthScale));
        const westX = Math.max(sampleX - 1, 0);
        const eastX = Math.min(sampleX + 1, size - 1);
        const baseIndex = sampleY * stride + sampleX;
        const base = data[baseIndex] ?? 0;
        const intensity = Math.min(1, base * exposure);
        let r: number;
        let g: number;
        let b: number;

        if (mode === 'gradient') {
          const color = this.sampleGradient(intensity);
          [r, g, b] = color;
        } else if (mode === 'emitter') {
          const value = Math.round(intensity * 255);
          r = value;
          g = value;
          b = value;
        } else {
          const left = data[sampleY * stride + westX] ?? base;
          const right = data[sampleY * stride + eastX] ?? base;
          const top = data[northY * stride + sampleX] ?? base;
          const bottom = data[southY * stride + sampleX] ?? base;
          const sxGrad = right - left;
          const syGrad = bottom - top;
          const invLength = 1 / Math.sqrt(sxGrad * sxGrad + syGrad * syGrad + 0.04);
          const nx = sxGrad * invLength;
          const ny = syGrad * invLength;
          const nz = 0.2 * invLength;
          r = Math.min(255, Math.max(0, Math.round((nx * 0.5 + 0.5) * 255)));
          g = Math.min(255, Math.max(0, Math.round((ny * 0.5 + 0.5) * 255)));
          b = Math.min(255, Math.max(0, Math.round((nz * 0.5 + 0.5) * 255)));
        }

        const highlight = Math.min(1, Math.pow(intensity, 2.2) * bloomStrength);
        r = Math.min(255, Math.round(r + (255 - r) * highlight));
        g = Math.min(255, Math.round(g + (255 - g) * highlight));
        b = Math.min(255, Math.round(b + (255 - b) * highlight));

        const idx = (y * width + x) * 4;
        buffer[idx] = r;
        buffer[idx + 1] = g;
        buffer[idx + 2] = b;
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

    this.configureCanvasContext(width, height);
  };

  private configureCanvasContext(width: number, height: number) {
    if (!this.context || !this.device || !this.format) {
      return;
    }
    if (width === 0 || height === 0) {
      return;
    }
    if (this.contextSize.width === width && this.contextSize.height === height) {
      return;
    }
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied'
    });
    this.contextSize.width = width;
    this.contextSize.height = height;
  }

  private ensureDyeTexture(size: number) {
    if (!this.device) {
      return;
    }
    if (size <= 0) {
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
      this.uniformDirty = true;
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
      this.gradientDirty = true;
    }

    if (this.gradientDirty && this.gradientTexture) {
      this.device.queue.writeTexture(
        { texture: this.gradientTexture },
        this.gradientData as BufferSource,
        { bytesPerRow: this.gradientWidth * 4 },
        { width: this.gradientWidth, height: 1, depthOrArrayLayers: 1 }
      );
      this.gradientDirty = false;
    }
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
    if (!this.uniformDirty && this.uniformFieldSize === size) {
      return;
    }
    this.uniformFloats[0] = this.config.exposure;
    this.uniformFloats[1] = this.config.bloomStrength;
    this.uniformFloats[2] = this.modeToIndex(this.config.mode);
    this.uniformFloats[3] = 0;
    this.uniformFloats[4] = size;
    this.uniformFloats[5] = size;
    this.uniformFloats[6] = 0;
    this.uniformFloats[7] = 0;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformBufferData);
    this.uniformFieldSize = size;
    this.uniformDirty = false;
  }

  private prepareDyeUpload(field: DyeField): Uint8Array {
    const { size, data } = field;
    const bytesPerPixel = 4;
    if (size <= 0) {
      this.dyeRowPitch = 0;
      return this.dyeUpload;
    }
    const rowPitch = Math.max(bytesPerPixel, this.alignTo(size * bytesPerPixel, 256));
    const requiredSize = rowPitch * size;
    if (this.dyeUpload.length < requiredSize) {
      this.dyeUpload = new Uint8Array(requiredSize);
    }

    this.dyeRowPitch = rowPitch;
    const pixels = this.dyeUpload;
    let srcIndex = 0;
    for (let y = 0; y < size; y++) {
      const rowOffset = y * rowPitch;
      for (let x = 0; x < size; x++, srcIndex++) {
        const value = Math.min(255, Math.max(0, Math.floor(data[srcIndex] * 255)));
        const idx = rowOffset + x * bytesPerPixel;
        pixels[idx] = value;
        pixels[idx + 1] = value;
        pixels[idx + 2] = value;
        pixels[idx + 3] = 255;
      }
      const trailingStart = rowOffset + size * bytesPerPixel;
      if (trailingStart < rowOffset + rowPitch) {
        pixels.fill(0, trailingStart, rowOffset + rowPitch);
      }
    }
    return pixels;
  }

  private alignTo(value: number, alignment: number) {
    if (alignment <= 0) return value;
    return Math.ceil(value / alignment) * alignment;
  }

  private destroyGPUResources() {
    this.vertexBuffer?.destroy();
    this.uniformBuffer?.destroy();
    this.dyeTexture?.destroy();
    this.gradientTexture?.destroy();

    this.vertexBuffer = null;
    this.uniformBuffer = null;
    this.dyeTexture = null;
    this.gradientTexture = null;
    this.dyeTextureView = null;
    this.gradientTextureView = null;
    this.dyeSampler = null;
    this.gradientSampler = null;
    this.bindGroup = null;
    this.pipeline = null;

    const context = this.context as (GPUCanvasContext & { unconfigure?: () => void }) | null;
    context?.unconfigure?.();
    this.context = null;
    this.device = null;
    this.format = null;

    this.webgpuReady = false;
    this.bindGroupDirty = true;
    this.lastFieldSize = 0;
    this.uniformFieldSize = 1;
    this.uniformDirty = true;
    this.gradientDirty = true;
    this.dyeRowPitch = 0;
    this.dyeUpload = new Uint8Array(0);
    this.contextSize.width = 0;
    this.contextSize.height = 0;
  }

  private handleDeviceLost = async (info: GPUDeviceLostInfo) => {
    if (this.disposed) {
      return;
    }
    console.warn('WebGPU device lost:', info.message);
    this.destroyGPUResources();
    const restarted = await this.setupWebGPU();
    if (!restarted) {
      this.setupFallback2D();
    }
  };

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
