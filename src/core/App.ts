import { AudioAnalyser } from '../audio/AudioAnalyser';
import { FluidRenderer } from '../render/FluidRenderer';
import { EulerianFluid2D } from '../simulation/EulerianFluid2D';
import { FrameTimer } from '../utils/FrameTimer';
import { ParamStore } from './ParamStore';
import { PointerController } from './PointerController';
import { AppEvents } from './events';
import { EditorPanel } from '../ui/EditorPanel';

const TARGET_DT = 1 / 60;

export class App {
  private readonly container: HTMLElement;
  private paramStore: ParamStore;
  private fluid: EulerianFluid2D;
  private renderer: FluidRenderer;
  private pointer: PointerController;
  private analyser: AudioAnalyser;
  private editor: EditorPanel | null = null;
  private events: AppEvents;
  private frameTimer = new FrameTimer();
  private animationFrame?: number;
  private running = false;

  constructor(container: HTMLElement) {
    this.container = container;

    this.paramStore = new ParamStore();
    this.events = new AppEvents();
    this.fluid = new EulerianFluid2D(this.paramStore.state.simulation);
    this.renderer = new FluidRenderer(this.container, this.paramStore.state.rendering);
    this.pointer = new PointerController(this.container);
    this.analyser = new AudioAnalyser();
  }

  async init() {
    this.container.classList.add('aurora-app');

    await this.renderer.init();
    this.editor = new EditorPanel(this.paramStore, this.events, this.analyser);
    this.editor.mount(this.container);

    this.pointer.onMove((position, buttons) => {
      if (!this.running) return;
      this.handlePointer(position.x, position.y, buttons.left, buttons.right);
    });

    this.events.on('simulation:reset', () => {
      this.fluid.reset();
    });

    this.events.on('simulation:clearDye', () => {
      this.fluid.clearDye();
    });

    this.events.on('simulation:clearVelocity', () => {
      this.fluid.clearVelocity();
    });

    this.events.on('presets:apply', (preset) => {
      this.paramStore.applyPreset(preset);
      this.fluid.updateConfig(this.paramStore.state.simulation);
      this.renderer.updateConfig(this.paramStore.state.rendering);
    });

    this.events.on('render:mode', (mode) => {
      this.renderer.setMode(mode);
    });

    this.analyser.onActivationChange((active) => {
      if (!active) {
        this.paramStore.setAudioActive(false);
      } else {
        this.paramStore.setAudioActive(true);
      }
    });

    this.paramStore.onChange((state) => {
      this.fluid.updateConfig(state.simulation);
      this.renderer.updateConfig(state.rendering);
    });

    this.start();
  }

  private start() {
    if (this.running) return;
    this.running = true;
    let accumulator = 0;
    const step = (time: number) => {
      this.animationFrame = requestAnimationFrame(step);
      const dt = this.frameTimer.delta(time);
      accumulator += dt;

      const emitter = this.paramStore.state.emitters.primary;
      const pointerPos = this.pointer.position;
      const viewport = this.renderer.getViewport();

      const audioStrength = this.paramStore.state.audio.active
        ? this.analyser.getBandValue(emitter.audioBand)
        : 0;

      if (this.pointer.isPressed) {
        const normX = (pointerPos.x - viewport.left) / viewport.width;
        const normY = 1 - (pointerPos.y - viewport.top) / viewport.height;
        this.fluid.addImpulse(normX, normY, emitter.brushRadius, emitter.brushStrength, audioStrength);
      }

      const pointerVelocity = this.pointer.velocity;
      if (this.pointer.isPressed) {
        this.fluid.addVelocityImpulse(
          (pointerPos.x - viewport.left) / viewport.width,
          1 - (pointerPos.y - viewport.top) / viewport.height,
          pointerVelocity.x,
          -pointerVelocity.y,
          emitter.forceStrength
        );
      }

      while (accumulator >= TARGET_DT) {
        this.fluid.step(TARGET_DT);
        accumulator -= TARGET_DT;
      }

      this.renderer.render(this.fluid.getDyeField());
    };

    this.animationFrame = requestAnimationFrame(step);
  }

  dispose() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.running = false;
    this.renderer.dispose();
    this.pointer.dispose();
    this.editor?.dispose();
    this.analyser.dispose();
  }

  private handlePointer(x: number, y: number, left: boolean, right: boolean) {
    if (!left && !right) return;
    const viewport = this.renderer.getViewport();
    if (x < viewport.left || y < viewport.top || x > viewport.right || y > viewport.bottom) {
      this.pointer.setPressed(false);
      return;
    }
    this.pointer.setPressed(left);
  }
}
