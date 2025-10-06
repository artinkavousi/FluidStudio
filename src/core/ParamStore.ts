import { defaultPreset } from '../presets/defaultPreset';
import type { Preset } from '../presets/types';

export interface SimulationParameters {
  resolution: number;
  viscosity: number;
  diffusion: number;
  dissipation: number;
  curlStrength: number;
  pressureIterations: number;
}

export interface RenderingParameters {
  mode: 'gradient' | 'emitter' | 'distortion';
  gradientStops: Array<{ position: number; color: string }>;
  exposure: number;
  bloomStrength: number;
}

export interface AudioParameters {
  active: boolean;
  smoothing: number;
  gain: number;
}

export interface EmitterParameters {
  id: string;
  brushRadius: number;
  brushStrength: number;
  forceStrength: number;
  audioBand: number;
}

export interface AppState {
  simulation: SimulationParameters;
  rendering: RenderingParameters;
  audio: AudioParameters;
  emitters: {
    primary: EmitterParameters;
  };
}

type Listener = (state: AppState) => void;

export class ParamStore {
  private _state: AppState;
  private listeners: Set<Listener> = new Set();

  constructor() {
    this._state = structuredClone(defaultPreset.state);
  }

  get state(): AppState {
    return this._state;
  }

  onChange(listener: Listener) {
    this.listeners.add(listener);
  }

  off(listener: Listener) {
    this.listeners.delete(listener);
  }

  setState(partial: Partial<AppState>) {
    this._state = {
      ...this._state,
      ...partial,
    };
    this.notify();
  }

  applyPreset(preset: Preset) {
    this._state = structuredClone(preset.state);
    this.notify();
  }

  updateSimulation(partial: Partial<SimulationParameters>) {
    this._state = {
      ...this._state,
      simulation: {
        ...this._state.simulation,
        ...partial
      }
    };
    this.notify();
  }

  updateRendering(partial: Partial<RenderingParameters>) {
    this._state = {
      ...this._state,
      rendering: {
        ...this._state.rendering,
        ...partial
      }
    };
    this.notify();
  }

  updateEmitter(partial: Partial<EmitterParameters>) {
    this._state = {
      ...this._state,
      emitters: {
        primary: {
          ...this._state.emitters.primary,
          ...partial
        }
      }
    };
    this.notify();
  }

  updateAudio(partial: Partial<AudioParameters>) {
    this._state = {
      ...this._state,
      audio: {
        ...this._state.audio,
        ...partial
      }
    };
    this.notify();
  }

  setAudioActive(active: boolean) {
    if (this._state.audio.active === active) return;
    this.updateAudio({ active });
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this._state));
  }
}
