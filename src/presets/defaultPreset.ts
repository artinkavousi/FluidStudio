import type { Preset } from './types';

export const defaultPreset: Preset = {
  id: 'default',
  name: 'Aurora Default',
  description: 'Balanced dye swirl with gentle bloom and medium viscosity.',
  state: {
    simulation: {
      resolution: 128,
      viscosity: 0.001,
      diffusion: 0.00001,
      dissipation: 0.995,
      curlStrength: 20,
      pressureIterations: 20
    },
    rendering: {
      mode: 'gradient',
      gradientStops: [
        { position: 0, color: '#04070a' },
        { position: 0.35, color: '#064663' },
        { position: 0.7, color: '#4a90e2' },
        { position: 1, color: '#f5f7fa' }
      ],
      exposure: 1.0,
      bloomStrength: 0.35
    },
    audio: {
      active: false,
      smoothing: 0.6,
      gain: 1.0
    },
    emitters: {
      primary: {
        id: 'primary',
        brushRadius: 0.04,
        brushStrength: 25,
        forceStrength: 250,
        audioBand: 4
      }
    }
  }
};
