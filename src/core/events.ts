import type { RenderingParameters } from './ParamStore';
import type { Preset } from '../presets/types';

export type AppEventMap = {
  'simulation:reset': void;
  'presets:apply': Preset;
  'render:mode': RenderingParameters['mode'];
};

export class AppEvents {
  private listeners: {
    [K in keyof AppEventMap]?: Array<(payload: AppEventMap[K]) => void>;
  } = {};

  on<K extends keyof AppEventMap>(event: K, handler: (payload: AppEventMap[K]) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(handler);
  }

  emit<K extends keyof AppEventMap>(event: K, payload: AppEventMap[K]) {
    const handlers = this.listeners[event];
    if (!handlers) return;
    handlers.forEach((handler) => handler(payload));
  }
}
