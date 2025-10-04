# AURORA Fluid Studio — Implementation Plan

## 1. Objectives
- Deliver a browser-based fluid simulation editor inspired by Wallpaper Engine's Advanced Fluid Simulation.
- Prioritize WebGPU-first architecture with fallbacks for wider compatibility.
- Provide modular documentation, presets, and tooling for future expansion (3D solvers, audio routing, etc.).

## 2. Scope Breakdown
1. **Core Simulation (Eulerian 2D)**
   - Implement stable-fluids solver (semi-Lagrangian advection, diffusion, projection).
   - Support dye & velocity buffers, emitters, and clearing actions.
   - Expose parameters (viscosity, dissipation, curl, gravity, timestep, resolution).

2. **Rendering Layer**
   - Render dye density as gradient-mapped texture over a full-screen quad.
   - Provide additional modes (emitter color, distortion) via shader/material abstractions.
   - Integrate post-processing (bloom/chromatic aberration) hooks for future work.

3. **Editor Experience**
   - Build Tweakpane panels for global sim controls, emitters, post FX, diagnostics.
   - Implement mouse painting for dye/collision masks with undo/erase.
   - Provide preset management (load/save/export JSON) and quality toggles.

4. **Audio Reactivity**
   - Wire Web Audio FFT bands to emitter parameters and visual modulation.
   - Include gain normalization, smoothing, limiter to prevent spikes.

5. **Tooling & Docs**
   - Establish TypeScript + Vite + ESLint/Prettier project skeleton.
   - Write module-level docs (`docs/*.md`) per README spec (Editor, Audio, Perf, Presets, Contrib).
   - Add benchmark harness placeholder and QA checklist.

## 3. Milestones
| Milestone | Deliverables |
|-----------|--------------|
| M1: Project Bootstrap | Vite + TypeScript scaffolding, core layout, rendering canvas, basic loop |
| M2: Fluid Solver | Eulerian 2D solver integrated, dye rendering, Tweakpane controls |
| M3: Interaction & Audio | Mouse painting, emitters, Web Audio analyser, audio-reactive hooks |
| M4: Polish & Presets | Gradient/distortion modes, presets, performance HUD, docs suite |

## 4. Architecture Overview
- `core/App.ts`: orchestrates lifecycle (init → loop → dispose), state store, event bus.
- `core/ParamStore.ts`: reactive parameter model consumed by UI, solver, renderer.
- `simulation/EulerianFluid2D.ts`: encapsulates grid buffers, WGSL/CPU kernels, integration steps.
- `render/FluidRenderer.ts`: manages three.js scene, material pipelines, gradient LUTs.
- `ui/EditorPanel.ts`: builds Tweakpane UI, binds actions, handles presets.
- `audio/AudioAnalyser.ts`: wraps Web Audio setup, exposes frequency bands to consumers.
- `presets/*.ts`: curated parameter sets serialized to JSON.
- `docs/*.md`: living documentation suite.

## 5. Risks & Mitigations
- **WebGPU availability** → Provide automatic fallback to CPU compute & WebGL rendering; guard code paths.
- **Performance on low-end devices** → Offer dynamic resolution, quality presets, and ability to disable expensive passes.
- **Audio permissions** → Lazy-initialize microphone capture after explicit user interaction; degrade gracefully.

## 6. Definition of Done
- Application launches in modern browsers, displays interactive fluid responsive to emitters and audio (if enabled).
- Editor exposes parity controls with Wallpaper Engine baseline (emitters, clear actions, render modes, perspective sliders).
- Presets load/save; documentation suite populated with actionable content.
- Lint/test scripts run cleanly; repository includes roadmap for 3D solver expansion.

