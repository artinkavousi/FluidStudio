export class AudioAnalyser {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Float32Array | null = null;
  private smoothing = 0.6;
  private gain = 1.0;
  private active = false;
  private activationListeners: Set<(active: boolean) => void> = new Set();

  async activate() {
    if (this.active) return;
    const context = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = this.smoothing;
    source.connect(analyser);

    this.context = context;
    this.analyser = analyser;
    this.dataArray = new Float32Array(analyser.frequencyBinCount);
    this.active = true;
    this.notifyActivation(true);
  }

  dispose() {
    this.context?.close();
    this.context = null;
    this.analyser = null;
    this.dataArray = null;
    this.active = false;
    this.notifyActivation(false);
  }

  setSmoothing(value: number) {
    this.smoothing = value;
    if (this.analyser) {
      this.analyser.smoothingTimeConstant = value;
    }
  }

  setGain(value: number) {
    this.gain = value;
  }

  getBandValue(index: number): number {
    if (!this.analyser || !this.dataArray) return 0;
    const buffer = this.dataArray;
    this.analyser.getFloatFrequencyData(buffer);
    const clampedIndex = Math.min(Math.max(index, 0), buffer.length - 1);
    const db = buffer[clampedIndex];
    const normalized = (db + 140) / 140;
    return Math.max(0, Math.min(1, normalized * this.gain));
  }

  onActivationChange(listener: (active: boolean) => void) {
    this.activationListeners.add(listener);
  }

  private notifyActivation(active: boolean) {
    this.activationListeners.forEach((listener) => listener(active));
  }
}
