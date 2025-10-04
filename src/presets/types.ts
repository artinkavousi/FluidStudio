import type { AppState } from '../core/ParamStore';

export interface Preset {
  id: string;
  name: string;
  description: string;
  state: AppState;
}
