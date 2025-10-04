interface PointerButtons {
  left: boolean;
  right: boolean;
}

interface PointerPosition {
  x: number;
  y: number;
}

type MoveListener = (position: PointerPosition, buttons: PointerButtons) => void;

export class PointerController {
  private element: HTMLElement;
  private moveListeners: Set<MoveListener> = new Set();
  private _isPressed = false;
  private lastPosition: PointerPosition = { x: 0, y: 0 };
  private lastMoveTime = performance.now();
  private _velocity = { x: 0, y: 0 };

  constructor(element: HTMLElement) {
    this.element = element;
    this.bindEvents();
  }

  get isPressed() {
    return this._isPressed;
  }

  get position() {
    return this.lastPosition;
  }

  get velocity() {
    return this._velocity;
  }

  onMove(listener: MoveListener) {
    this.moveListeners.add(listener);
  }

  dispose() {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  setPressed(pressed: boolean) {
    this._isPressed = pressed;
  }

  private bindEvents() {
    this.element.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerDown = (event: PointerEvent) => {
    this._isPressed = event.buttons === 1;
    this.updatePosition(event);
    this.emitMove(event);
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (event.buttons === 0) this._isPressed = false;
    this.updatePosition(event);
    this.emitMove(event);
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (event.buttons === 0) {
      this._isPressed = false;
    }
    this.updatePosition(event);
    this.emitMove(event);
  };

  private emitMove(event: PointerEvent) {
    const buttons: PointerButtons = {
      left: (event.buttons & 1) === 1,
      right: (event.buttons & 2) === 2
    };
    const position = this.lastPosition;
    this.moveListeners.forEach((listener) => listener(position, buttons));
  }

  private updatePosition(event: PointerEvent) {
    const now = performance.now();
    const dt = Math.max((now - this.lastMoveTime) / 1000, 0.0001);
    const newPosition = { x: event.clientX, y: event.clientY };
    this._velocity = {
      x: (newPosition.x - this.lastPosition.x) / dt,
      y: (newPosition.y - this.lastPosition.y) / dt
    };
    this.lastPosition = newPosition;
    this.lastMoveTime = now;
  }
}
