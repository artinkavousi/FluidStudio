# Editor Manual

## Layout
- **Left Pane**: Tweakpane-driven control stack (Simulation, Emitter, Rendering, Audio, Actions, Presets).
- **Right Viewport**: Fluid canvas showing current dye density using selected render mode.

## Controls
### Simulation
- **Resolution**: Grid cells (NxN) for solver. Higher values increase fidelity at cost of performance.
- **Viscosity**: Resistance to flow; higher → smoother, more diffused motion.
- **Diffusion**: Dye spread rate per step.
- **Dissipation**: Multiplicative fade for dye energy per frame.
- **Pressure Iterations**: Jacobi iterations for divergence-free velocity.

### Emitter
- **Brush Radius**: Normalized radius of dye injection (0–1).
- **Brush Strength**: Amount of dye added per stroke.
- **Force Strength**: Multiplier for velocity impulses based on pointer velocity.
- **Audio Band**: FFT bin index to sample for reactivity.

### Rendering
- **Mode**: Select gradient/emitter/distortion (distortion placeholder for future WebGPU pass).
- **Exposure**: Post tonemapping multiplier.
- **Bloom Strength**: Weight for bloom post effect placeholder.

### Audio Reactivity
- **Enable Microphone**: Requests permission and spins up Web Audio analyser.
- **Smoothing**: Low-pass smoothing on FFT magnitude.
- **Gain**: Scalar applied to normalized FFT amplitude.

### Actions
- **Clear Simulation**: Resets velocity and dye buffers.

### Presets
- Dropdown listing available presets. Selecting applies values instantly.

## Pointer Gestures
- **Left Click + Drag**: Paint dye and inject velocity using brush settings.
- **Release**: Stops emission.

## Tips
- Start at resolution 96 for mid-tier GPUs.
- Use low diffusion (<0.0001) for sharper ink trails.
- Pair high dissipation (~0.99) with strong brush for vivid bursts.
