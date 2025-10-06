import type { SimulationParameters } from '../core/ParamStore';

export interface DyeField {
  size: number;
  data: Float32Array;
}

export class EulerianFluid2D {
  private config: SimulationParameters;
  private size: number;
  private gridSize: number;

  private velocityX: Float32Array;
  private velocityY: Float32Array;
  private velocityXPrev: Float32Array;
  private velocityYPrev: Float32Array;

  private density: Float32Array;
  private densityPrev: Float32Array;
  private curl: Float32Array;

  constructor(config: SimulationParameters) {
    this.config = config;
    this.size = config.resolution;
    this.gridSize = (this.size + 2) * (this.size + 2);

    this.velocityX = new Float32Array(this.gridSize);
    this.velocityY = new Float32Array(this.gridSize);
    this.velocityXPrev = new Float32Array(this.gridSize);
    this.velocityYPrev = new Float32Array(this.gridSize);
    this.density = new Float32Array(this.gridSize);
    this.densityPrev = new Float32Array(this.gridSize);
    this.curl = new Float32Array(this.gridSize);
  }

  updateConfig(config: SimulationParameters) {
    if (config.resolution !== this.config.resolution) {
      this.config = config;
      this.resize(config.resolution);
    } else {
      this.config = config;
    }
  }

  reset() {
    this.clearVelocity();
    this.clearDye();
    this.curl.fill(0);
  }

  clearDye() {
    this.density.fill(0);
    this.densityPrev.fill(0);
  }

  clearVelocity() {
    this.velocityX.fill(0);
    this.velocityY.fill(0);
    this.velocityXPrev.fill(0);
    this.velocityYPrev.fill(0);
  }

  step(dt: number) {
    const visc = this.config.viscosity;
    const diff = this.config.diffusion;

    this.diffuse(1, this.velocityXPrev, this.velocityX, visc, dt);
    this.diffuse(2, this.velocityYPrev, this.velocityY, visc, dt);
    this.project(this.velocityXPrev, this.velocityYPrev, this.velocityX, this.velocityY);

    this.advect(1, this.velocityX, this.velocityXPrev, this.velocityXPrev, this.velocityYPrev, dt);
    this.advect(2, this.velocityY, this.velocityYPrev, this.velocityXPrev, this.velocityYPrev, dt);
    this.applyVorticityConfinement(this.velocityX, this.velocityY, dt);
    this.project(this.velocityX, this.velocityY, this.velocityXPrev, this.velocityYPrev);

    this.diffuse(0, this.densityPrev, this.density, diff, dt);
    this.advect(0, this.density, this.densityPrev, this.velocityX, this.velocityY, dt);
    this.applyDissipation();
  }

  addImpulse(x: number, y: number, radius: number, strength: number, audioFactor = 0) {
    const N = this.size;
    const r = Math.max(Math.floor(radius * N), 1);
    const centerX = Math.floor(x * N);
    const centerY = Math.floor(y * N);
    const impulse = strength * (1 + audioFactor);

    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const px = centerX + i;
        const py = centerY + j;
        if (px < 1 || px > N || py < 1 || py > N) continue;
        const weight = 1 - Math.sqrt(i * i + j * j) / r;
        if (weight <= 0) continue;
        const idx = this.IX(px, py);
        this.density[idx] += impulse * weight * 0.01;
      }
    }
  }

  addVelocityImpulse(x: number, y: number, vx: number, vy: number, forceStrength: number) {
    const N = this.size;
    const px = Math.floor(x * N);
    const py = Math.floor(y * N);
    if (px < 1 || px > N || py < 1 || py > N) return;
    const idx = this.IX(px, py);
    this.velocityX[idx] += (vx / 1000) * forceStrength;
    this.velocityY[idx] += (vy / 1000) * forceStrength;
  }

  getDyeField(): DyeField {
    const N = this.size;
    const data = new Float32Array(N * N);
    for (let y = 1; y <= N; y++) {
      for (let x = 1; x <= N; x++) {
        const idx = this.IX(x, y);
        data[(y - 1) * N + (x - 1)] = Math.min(1, Math.max(0, this.density[idx]));
      }
    }
    return { size: N, data };
  }

  private resize(resolution: number) {
    this.size = resolution;
    this.gridSize = (resolution + 2) * (resolution + 2);
    this.velocityX = new Float32Array(this.gridSize);
    this.velocityY = new Float32Array(this.gridSize);
    this.velocityXPrev = new Float32Array(this.gridSize);
    this.velocityYPrev = new Float32Array(this.gridSize);
    this.density = new Float32Array(this.gridSize);
    this.densityPrev = new Float32Array(this.gridSize);
    this.curl = new Float32Array(this.gridSize);
  }

  private applyDissipation() {
    const factor = this.config.dissipation;
    for (let i = 0; i < this.density.length; i++) {
      this.density[i] *= factor;
    }
  }

  private diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number) {
    const N = this.size;
    const a = dt * diff * N * N;
    this.linearSolve(b, x, x0, a, 1 + 4 * a);
  }

  private advect(
    b: number,
    d: Float32Array,
    d0: Float32Array,
    velocX: Float32Array,
    velocY: Float32Array,
    dt: number
  ) {
    const N = this.size;
    const dt0 = dt * N;
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        let x = i - dt0 * velocX[this.IX(i, j)];
        let y = j - dt0 * velocY[this.IX(i, j)];
        if (x < 0.5) x = 0.5;
        if (x > N + 0.5) x = N + 0.5;
        const i0 = Math.floor(x);
        const i1 = i0 + 1;
        if (y < 0.5) y = 0.5;
        if (y > N + 0.5) y = N + 0.5;
        const j0 = Math.floor(y);
        const j1 = j0 + 1;
        const s1 = x - i0;
        const s0 = 1 - s1;
        const t1 = y - j0;
        const t0 = 1 - t1;
        d[this.IX(i, j)] =
          s0 * (t0 * d0[this.IX(i0, j0)] + t1 * d0[this.IX(i0, j1)]) +
          s1 * (t0 * d0[this.IX(i1, j0)] + t1 * d0[this.IX(i1, j1)]);
      }
    }
    this.setBounds(b, d);
  }

  private project(
    velocX: Float32Array,
    velocY: Float32Array,
    p: Float32Array,
    div: Float32Array
  ) {
    const N = this.size;
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        div[this.IX(i, j)] =
          -0.5 *
          (velocX[this.IX(i + 1, j)] - velocX[this.IX(i - 1, j)] +
            velocY[this.IX(i, j + 1)] - velocY[this.IX(i, j - 1)]) /
          N;
        p[this.IX(i, j)] = 0;
      }
    }
    this.setBounds(0, div);
    this.setBounds(0, p);
    this.linearSolve(0, p, div, 1, 4);

    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        velocX[this.IX(i, j)] -= 0.5 * N * (p[this.IX(i + 1, j)] - p[this.IX(i - 1, j)]);
        velocY[this.IX(i, j)] -= 0.5 * N * (p[this.IX(i, j + 1)] - p[this.IX(i, j - 1)]);
      }
    }
    this.setBounds(1, velocX);
    this.setBounds(2, velocY);
  }

  private linearSolve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number) {
    const N = this.size;
    for (let k = 0; k < this.config.pressureIterations; k++) {
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          x[this.IX(i, j)] =
            (x0[this.IX(i, j)] +
              a *
                (x[this.IX(i - 1, j)] +
                  x[this.IX(i + 1, j)] +
                  x[this.IX(i, j - 1)] +
                  x[this.IX(i, j + 1)])) /
            c;
        }
      }
      this.setBounds(b, x);
    }
  }

  private applyVorticityConfinement(velocX: Float32Array, velocY: Float32Array, dt: number) {
    const epsilon = this.config.curlStrength;
    if (epsilon <= 0) return;

    const N = this.size;
    const curl = this.curl;

    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        const index = this.IX(i, j);
        const dw_dy = velocY[this.IX(i + 1, j)] - velocY[this.IX(i - 1, j)];
        const du_dx = velocX[this.IX(i, j + 1)] - velocX[this.IX(i, j - 1)];
        curl[index] = 0.5 * (dw_dy - du_dx);
      }
    }

    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        const index = this.IX(i, j);
        let Nx = (Math.abs(curl[this.IX(i + 1, j)]) - Math.abs(curl[this.IX(i - 1, j)])) * 0.5;
        let Ny = (Math.abs(curl[this.IX(i, j + 1)]) - Math.abs(curl[this.IX(i, j - 1)])) * 0.5;
        const length = Math.hypot(Nx, Ny) + 1e-5;
        Nx /= length;
        Ny /= length;
        const vorticity = curl[index];
        const force = epsilon * vorticity;
        velocX[index] += Ny * -force * dt;
        velocY[index] += Nx * force * dt;
      }
    }

    this.setBounds(1, velocX);
    this.setBounds(2, velocY);
  }

  private setBounds(b: number, x: Float32Array) {
    const N = this.size;
    for (let i = 1; i <= N; i++) {
      x[this.IX(0, i)] = b === 1 ? -x[this.IX(1, i)] : x[this.IX(1, i)];
      x[this.IX(N + 1, i)] = b === 1 ? -x[this.IX(N, i)] : x[this.IX(N, i)];
      x[this.IX(i, 0)] = b === 2 ? -x[this.IX(i, 1)] : x[this.IX(i, 1)];
      x[this.IX(i, N + 1)] = b === 2 ? -x[this.IX(i, N)] : x[this.IX(i, N)];
    }
    x[this.IX(0, 0)] = 0.5 * (x[this.IX(1, 0)] + x[this.IX(0, 1)]);
    x[this.IX(0, N + 1)] = 0.5 * (x[this.IX(1, N + 1)] + x[this.IX(0, N)]);
    x[this.IX(N + 1, 0)] = 0.5 * (x[this.IX(N, 0)] + x[this.IX(N + 1, 1)]);
    x[this.IX(N + 1, N + 1)] = 0.5 * (x[this.IX(N, N + 1)] + x[this.IX(N + 1, N)]);
  }

  private IX(x: number, y: number) {
    return x + (this.size + 2) * y;
  }
}
