# AURORA Fluid Studio — Technical Specification

## Architecture
- **App Core**: `App` orchestrates simulation, rendering, input, audio, and UI.
- **State**: `ParamStore` stores simulation/render/audio/emitter parameters with reactive listeners.
- **Simulation**: `EulerianFluid2D` implements CPU stable fluid solver with diffusion, advection, projection, and dissipation.
- **Rendering**: `FluidRenderer` rasterizes dye field via Canvas2D with gradient LUTs.
- **UI**: `EditorPanel` uses Tweakpane for controls, preset loading, and actions.
- **Audio**: `AudioAnalyser` handles microphone activation, FFT sampling, smoothing, and gain.

## Data Flow
1. UI updates `ParamStore` → solver/renderer receive new config.
2. Pointer events create dye/velocity impulses in solver.
3. Audio analyser provides normalized band amplitude for emitter modulation.
4. Simulation `step` integrates velocity and density fields.
5. Renderer fetches dye field and maps to gradient colours per pixel.

## Modules
| Module | Responsibility |
| --- | --- |
| `src/core/App.ts` | Bootstraps systems, runs frame loop. |
| `src/simulation/EulerianFluid2D.ts` | Stable fluids solver, impulses, buffer management. |
| `src/render/FluidRenderer.ts` | Canvas drawing, gradient LUT, viewport queries. |
| `src/ui/EditorPanel.ts` | Tweakpane controls, preset dropdown, audio activation. |
| `src/audio/AudioAnalyser.ts` | Web Audio integration, FFT band queries. |
| `src/core/ParamStore.ts` | State management + preset application. |

## Roadmap
- Port solver to WebGPU compute pipelines.
- Implement emitter colour buffer and distortion render modes.
- Add preset export/import UI and screenshot capture.
- Introduce 3D PBF solver module with separate renderer.
