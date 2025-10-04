import { Pane } from 'tweakpane';
import type { FolderApi, TpChangeEvent } from 'tweakpane';
import type { AudioAnalyser } from '../audio/AudioAnalyser';
import type { ParamStore } from '../core/ParamStore';
import type { AppEvents } from '../core/events';
import { defaultPreset } from '../presets/defaultPreset';
import type { Preset } from '../presets/types';

export class EditorPanel {
  private pane: Pane | null = null;
  private store: ParamStore;
  private events: AppEvents;
  private analyser: AudioAnalyser;
  private presets: Preset[] = [defaultPreset];

  constructor(store: ParamStore, events: AppEvents, analyser: AudioAnalyser) {
    this.store = store;
    this.events = events;
    this.analyser = analyser;
  }

  mount(container: HTMLElement) {
    this.pane = new Pane({
      title: 'AURORA Studio',
      expanded: true,
      container
    });
    const pane = this.pane as Pane & { addFolder: (params: { title: string }) => FolderApi };
    pane.element.classList.add('tweakpane-panel');

    const simFolder = pane.addFolder({ title: 'Simulation' });
    const simState = this.store.state.simulation;
    simFolder
      .addInput(simState, 'resolution', { min: 32, max: 256, step: 32 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateSimulation({ resolution: ev.value }));
    simFolder
      .addInput(simState, 'viscosity', { min: 0, max: 0.01, step: 0.0001 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateSimulation({ viscosity: ev.value }));
    simFolder
      .addInput(simState, 'diffusion', { min: 0, max: 0.001, step: 0.00001 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateSimulation({ diffusion: ev.value }));
    simFolder
      .addInput(simState, 'dissipation', { min: 0.9, max: 1, step: 0.001 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateSimulation({ dissipation: ev.value }));
    simFolder
      .addInput(simState, 'pressureIterations', { min: 5, max: 60, step: 1 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateSimulation({ pressureIterations: ev.value }));

    const emitFolder = pane.addFolder({ title: 'Emitter' });
    const emitter = this.store.state.emitters.primary;
    emitFolder
      .addInput(emitter, 'brushRadius', { min: 0.01, max: 0.25, step: 0.005 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateEmitter({ brushRadius: ev.value }));
    emitFolder
      .addInput(emitter, 'brushStrength', { min: 1, max: 200, step: 1 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateEmitter({ brushStrength: ev.value }));
    emitFolder
      .addInput(emitter, 'forceStrength', { min: 10, max: 500, step: 5 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateEmitter({ forceStrength: ev.value }));
    emitFolder
      .addInput(emitter, 'audioBand', { min: 0, max: 32, step: 1 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateEmitter({ audioBand: ev.value }));

    const renderFolder = pane.addFolder({ title: 'Rendering' });
    const rendering = this.store.state.rendering;
    renderFolder
      .addInput(rendering, 'mode', { options: { Gradient: 'gradient', Emitter: 'emitter', Distortion: 'distortion' } })
      .on('change', (ev: TpChangeEvent<'gradient' | 'emitter' | 'distortion'>) =>
        this.events.emit('render:mode', ev.value)
      );
    renderFolder
      .addInput(rendering, 'exposure', { min: 0.25, max: 2, step: 0.05 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateRendering({ exposure: ev.value }));
    renderFolder
      .addInput(rendering, 'bloomStrength', { min: 0, max: 1, step: 0.05 })
      .on('change', (ev: TpChangeEvent<number>) => this.store.updateRendering({ bloomStrength: ev.value }));

    const audioFolder = pane.addFolder({ title: 'Audio Reactivity' });
    const audio = this.store.state.audio;
    audioFolder
      .addButton({ title: 'Enable Microphone' })
      .on('click', async () => {
        try {
          await this.analyser.activate();
        } catch (error) {
          console.error('Failed to activate audio', error);
        }
      });
    audioFolder
      .addInput(audio, 'smoothing', { min: 0, max: 0.9, step: 0.05 })
      .on('change', (ev: TpChangeEvent<number>) => {
        this.store.setAudioActive(true);
        this.analyser.setSmoothing(ev.value);
      });
    audioFolder
      .addInput(audio, 'gain', { min: 0.1, max: 4, step: 0.1 })
      .on('change', (ev: TpChangeEvent<number>) => {
        this.store.setAudioActive(true);
        this.analyser.setGain(ev.value);
      });

    const actionsFolder = pane.addFolder({ title: 'Actions' });
    actionsFolder.addButton({ title: 'Clear Simulation' }).on('click', () => this.events.emit('simulation:reset', undefined));

    const presetsFolder = pane.addFolder({ title: 'Presets' });
    presetsFolder
      .addBlade({
        view: 'list',
        label: 'Load Preset',
        options: this.presets.map((preset) => ({ text: preset.name, value: preset.id })),
        value: defaultPreset.id
      })
      .on('change', (ev: TpChangeEvent<string>) => {
        const preset = this.presets.find((p) => p.id === ev.value);
        if (preset) {
          this.events.emit('presets:apply', preset);
        }
      });
  }

  dispose() {
    this.pane?.dispose();
    this.pane = null;
  }
}
