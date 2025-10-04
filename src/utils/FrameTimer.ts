export class FrameTimer {
  private last = 0;

  delta(time: number): number {
    if (this.last === 0) {
      this.last = time;
      return 0;
    }
    const dt = (time - this.last) / 1000;
    this.last = time;
    return Math.min(dt, 0.1);
  }
}
