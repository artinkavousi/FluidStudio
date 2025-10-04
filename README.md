# FluidStudio
✅ **PromptPack ON — Plan→Do→Check→Revise | deep-dive** *(say “PromptPack OFF” to disable; “brevity mode” to shorten)*

---

## Plan (≤6 steps)

1. Gather the must-have features from Wallpaper Engine’s **Advanced Fluid Simulation** to mirror in our editor. ([Wallpaper Engine][1])
2. Lock our stack choices and architecture: **three.js + WebGPU + TSL**, compute passes, data layouts, editor UX (Tweakpane), and audio (Web Audio FFT). ([three.js forum][2])
3. Specify **two solver families** (Eulerian + PBF/SPH) and a path to **3D multigrid**; cite exemplar repos. ([GitHub][3])
4. Write the **Full Documentation**: architecture, pipelines, file structure, APIs, UI spec, presets, performance, QA, and roadmap.
5. Add **development docs**: conventions, build scripts, test/benchmark plans, perf budgets, and migration notes.
6. Self-check vs. goals; revise once.

---

## Do

# AURORA Fluid Studio — Full Documentation & Development Docs (v1.0)

### 0. Executive Summary

AURORA Fluid Studio is a WebGPU-first fluid sim + visualizer built on **three.js + TSL Nodes + compute**. It ships: (a) **hot-swappable solvers** (Eulerian 2D, PBF 3D; optional Eulerian 3D with multigrid), (b) a **Wallpaper-Engine-style editor** with emitters, collision/dye painting, perspective controls, and rendering modes (Gradient / Emitter Color / Background / Distortion), and (c) **pro-grade audio reactivity** via the Web Audio API. ([Wallpaper Engine][1])

---

## 1) Feature Set

**Parity with Wallpaper Engine (mirrored concepts)**

* Emitters: **Point**, **Line**, **Dye (painted)**; mouse attach; audio-responsiveness.
* **Collision mask** painting.
* Rendering modes: **Gradient map**, **Emitter color**, **Background color**, **Distortion (refraction/warping)**.
* **Perspective** transform for the sim layer; **Brightness**, **Feather**, **Opacity** controls.
* **Clear Velocity** / **Clear Dye** actions. ([Wallpaper Engine][1])

**AURORA upgrades**

* Solver plug-ins (Eulerian 2D, **PBF 3D**, optional **Eulerian 3D with multigrid**). ([GitHub][3])
* **Thickness & normal reconstruction** for glassy refraction & ink/smoke looks; post-FX (bloom, chroma). ([GitHub][4])
* **Advanced audio routing matrix** (bands → emitters / sim params / post-FX) with attack/release + limiter. ([MDN Web Docs][5])
* **Preset system** (JSON), import/export, screenshot, and quality presets (Low/Med/High/Ultra).

---

## 2) Architecture Overview

**Tech stack**

* **Renderer:** three.js **WebGPURenderer** + **TSL Nodes** for materials; WGSL compute where needed. ([three.js forum][2])
* **Editor/UX:** **Tweakpane** (panes, folders, monitors, presets). ([Tweakpane][6])
* **Audio:** Web Audio API `AnalyserNode` for FFT/time domain buffers. ([MDN Web Docs][5])

**High-level data flow**

```
UI (Tweakpane) → Param Store
Audio (AnalyserNode) → Band features (EMA smoothing, limiter)
Input (mouse/touch) → Cursor forces / emitter triggers
▼
Compute Pipeline (per solver)
  Eulerian 2D: Advect → Diffuse → AddForces → Divergence → Pressure (Jacobi) → Projection → Dissipate
  PBF 3D: Hash/Grid → Neighbor Find → Density Constraint Solve → Viscosity (XSPH) → Vorticity → Integrate
  Eulerian 3D (optional): 3D textures + Multigrid pressure pyramid
▼
Visual Buffers (thickness/depth, normals)
▼
Material pass (TSL): surface/ink/smoke/distortion
▼
Post-FX (Bloom/Chroma/Vignette)
```

**Data layouts**

* 2D grid: `rgba16f` storage textures for **velocity**, **dye**, **pressure**, **divergence**; ping-pong textures as needed.
* 3D PBF: SSBO/StorageBuffers: positions, velocities, cell indices, cell offsets; prefix-sum grid. (See PBF/SPH refs.) ([GitHub][7])
* 3D Eulerian: 3D textures for velocity/pressure/density; **multigrid** levels for pressure solve. ([GitHub][8])

---

## 3) Solvers

### 3.1 Eulerian 2D (Stable Fluids)

* **Passes**: Advect(MacCormack opt), Diffuse(ν), AddForces, Divergence, **Pressure (Jacobi, iters N)**, Projection, Dissipation/High-pass cleanup.
* **Controls**: viscosity, dissipation, pressure amount, **curling** (vorticity confinement), saturation; **gravity** dir/strength; **cursor influence** radius/strength. (Mirrors WE control vocabulary.) ([Wallpaper Engine][1])

### 3.2 PBF 3D (Position-Based Fluids)

* **Pipeline**:

  1. Hash particles to grid;
  2. Build neighbor lists (cell offsets/prefix sums);
  3. Solve density constraints (λ), position corrections;
  4. **XSPH viscosity**, **vorticity confinement**;
  5. Integrate & collisions.
* Reference implementations demonstrate **WebGPU-friendly neighbor search** and constraint loops. ([GitHub][7])

### 3.3 Eulerian 3D (optional cinematic smoke/liquid)

* 3D grid; **multigrid** Poisson solver for high-res pressure projection (far more efficient than Jacobi for 256³). See **Roquefort** repo + demo. ([GitHub][8])

---

## 4) Rendering & Post-FX

**Modes** (matching WE semantics):

* **Gradient**: color by gradient map (128×8 recommended), with **Feather** to accent edges.
* **Emitter Color**: composite dyes per-emitter.
* **Background Color**: sample scene or image layer.
* **Distortion**: refract background using surface normals; optional chromatic dispersion. ([Wallpaper Engine][1])

**Surface polish**

* **Thickness accumulation** + normal reconstruction → TSL material with IOR, Fresnel, refraction.
* **Ink/Smoke**: absorption/scattering approximation in screen space.
* **Post-FX**: Bloom (threshold/knee/intensity), Chroma split (axial/radial), Vignette/Grain. (Ocean/3D fluid examples inform surface/normal tricks.) ([GitHub][4])

---

## 5) Editor UX (Tweakpane)

**Panels**

* **Global**: Play/Pause, Reset, **ClearVelocity**, **ClearDye**; Resolution scale; Substeps; dt; Blend mode (Normal/Add/Screen), Opacity, Brightness, **Feather**; **Perspective** (4-corner warp). ([Wallpaper Engine][1])
* **Simulation**: Solver (Euler2D/PBF3D/Euler3D); Viscosity, Dissipation, Pressure, **Curling**, Saturation, **High-pass**; Gravity(dir/strength); Cursor Influence. ([Wallpaper Engine][1])
* **Emitters**: add/remove **Point/Line/Dye**; per-emitter: pos/angle/size/rate/init-vel/color; **mouse binding**; **audio routing**. (Gizmos on-canvas.) ([Wallpaper Engine][1])
* **Collision & Painting**: brush size/hardness/erase; import/export collision mask; dye paint/map import. ([Wallpaper Engine][1])
* **Rendering**: Mode; Gradient map; Distortion (strength/scale/chroma); Surface (IOR, refraction, Fresnel, thickness gain).
* **Audio**: Source (mic/file); bands (log spacing); min/max Hz; **attack/release**; gain/normalize; **routing matrix**; limiter. ([MDN Web Docs][5])
* **FX**: Bloom, Chroma, Vignette, Grain; Temporal jitter.
* **Presets**: save/load, built-ins (Ambient Ink / Neon Smoke / Glass Lagoon / Bass Splash).
  (Tweakpane supports clean presets/monitors and plugin extensions.) ([Tweakpane][6])

---

## 6) Audio Reactivity (Design)

* **FFT**: `AnalyserNode` with log-spaced bins (8–16 bands). Use EMA smoothing (attack ~60–100ms; release ~200–400ms), max-hold normalizer, and a per-frame **momentum limiter**. ([MDN Web Docs][5])
* **Routing matrix** (examples):

  * Lows → emitter **rate/size** + radial impulses,
  * Mids → **vorticity** + curl noise,
  * Highs → **chroma** + surface sparkle.
* **Safety**: clamp momentum injection; soft-clip; ignore sub-noise floor.

---

## 7) Presets (JSON schema)

```json
{
  "meta":{"version":1,"name":"Bass Splash"},
  "global":{"resolutionScale":1,"substeps":1,"dt":0.016,"blend":"Add","opacity":0.9,"brightness":1,"feather":1,"perspective":{"enabled":true,"corners":[[.1,.1],[.9,.1],[.9,.9],[.1,.9]]}},
  "simulation":{"solver":"Euler2D","viscosity":0.4,"dissipation":0.3,"pressure":0.6,"curling":12.0,"saturation":0.4,"highPass":0.1,"gravity":{"deg":-120,"strength":6.0}},
  "emitters":{"line":[{"p0":[.2,.6],"p1":[.8,.6],"angle":-10,"size":.05,"rate":1.0,"vel":[0,1],"color":"#22f","audio":{"sizeBand":0,"resp":15}}],"point":[],"dye":{"map":"dye.png","color":"#8cf"}},
  "collision":{"mask":"mask.png"},
  "render":{"mode":"Gradient","gradient":"grad128x8.png","distortion":{"enabled":true,"strength":0.4,"chroma":0.15}},
  "audio":{"source":"mic","bands":12,"minHz":30,"maxHz":14000,"attack":0.08,"release":0.28,"gain":1.0,"normalize":true},
  "fx":{"bloom":{"threshold":1.0,"intensity":0.7},"chroma":0.15,"vignette":0.2,"grain":0.1}
}
```

Values mirror WE semantics for intuitive cross-mapping. ([Wallpaper Engine][1])

---

## 8) Developer API

* `clearVelocity()` / `clearDye()` — UI bound. ([Wallpaper Engine][1])
* `emitters.add(type, params)` / `emitters.remove(id)` / `emitters.update(id, params)`
* `paint.collision(x, y, radius, hard)` / `paint.dye(...)` (pointer events → paint ops)
* `audio.setSource('mic'|'file')` / `audio.setRouting(matrix)`
* `presets.save(name)` / `presets.load(json)`
* `engine.setSolver('Euler2D'|'PBF3D'|'Euler3D')`

---

## 9) File & Module Layout (hot-swappable, ≤10 core files)

```
/core/Engine.ts              // app bootstrap; frame loop; param store bridge
/core/Compute.ts             // pass scheduler; ping-pong; dispatch helpers
/solvers/euler2D.ts          // advect, diffuse, pressure(jacobi), project, dissipate
/solvers/pbf3D.ts            // hash grid, neighbor, constraints, xsph, vorticity
/solvers/euler3D.ts          // 3D textures, multigrid pyramid, projection
/render/Materials.tsl.ts     // TSL nodes: surface/ink/distortion; uniforms
/render/Composite.ts         // thickness/depth/normals, post-FX chain
/ui/EditorPane.ts            // Tweakpane panels; preset save/load; gizmo hooks
/io/Audio.ts                 // analyser, bands, ema, limiter; routing matrix
/io/Input.ts                 // mouse/touch; paint tools; perspective warp
```

(We can split further into /wgsl/* if some passes need raw WGSL.)

---

## 10) Coding Standards & Conventions

* **TSL-first** materials; WGSL compute when StorageTextures/SSBO patterns exceed TSL’s current affordances. ([three.js forum][2])
* **No CPU readbacks**; GPU-resident ping-pong & SSBOs only.
* **Workgroup sizes**: 2D = 16×16; 3D = 8×8×8; expose in **Perf** panel.
* **Precision**: prefer `rgba16f`; avoid 32f unless needed.
* **Stability**: clamp inputs; `max(eps, denom)`; avoid `pow` on negatives; NaN guards.
* **Determinism**: seed noise; guard platform-variant math.

---

## 11) Build & Tooling

* **Package**: `vite` (dev), `tsc` (types), `eslint` + `prettier`.
* **Scripts**: `dev`, `build`, `serve`, `test`, `bench`, `lint`, `typecheck`.
* **Assets**: `/presets/*.json`, `/gradients/*.png`, `/masks/*.png`, `/dye/*.png`.
* **Release**: static site; WebGPU requires modern Chromium/Edge; Firefox 141 (Win) and Safari 26 have WebGPU, but test for quirks. ([Bercon][9])

---

## 12) QA, Tests & Benchmarks

**Unit-ish (GPU kernels via headless runs)**

* Advect mass conservation within tolerance; pressure residual < ε after N iters.
* PBF density error < δ; neighbor counts bounded.

**Integration**

* Preset round-trip fidelity; editor actions (clear/perspective/paint) converge.
* Audio inputs: spikes don’t explode (limiter working).

**Benchmarks** *(targets on 2070/4090 classes)*

* 2D 1024×1024 @ 60 FPS (Jacobi iters ≤ 40).
* 3D PBF 150k–300k particles @ 60 FPS (hash+constraints in ~6–9 ms).
* 3D Eulerian 128³ @ 60 FPS with multigrid V-cycles tuned. (Roquefort demonstrates multigrid feasibility on WebGPU.) ([GitHub][8])

---

## 13) Performance Playbook

* Fuse short kernels; minimize bind group/layout swaps.
* Use **multigrid** for 3D pressure (orders faster than Jacobi at scale). ([GitHub][8])
* Downsample for thickness/normal passes; bilateral upsample.
* Toggle half-res post-FX for Ultra presets.

---

## 14) Migration & Inspiration Notes

* WE’s docs outline **emitter types**, **render modes**, **collision/dye painting**, **perspective**, and **audio/mouse responsiveness** — we mirrored semantics so artists feel at home. ([Wallpaper Engine][1])
* For deeper craft notes and modern WebGPU tricks, see **Codrops** fluid/WebGPU articles (great practical advice & demos). ([Codrops][10])

---

## 15) Roadmap

* **3D volumetric smoke** + bilateral upsample; temporal reprojection.
* **MLS-MPM/FLIP hybrid** (research track; see discussions around MPM/FLIP blends). ([Hacker News][11])
* **Brush system** (animated/noise stamps), **Node graph editor** for audio routing.
* **Preset hub** (share links with preview images).

---

# Development Docs (for engineers)

## A) Acceptance Criteria (MVP)

* Editor parity features working (emitters, collision/dye painting, perspective, four render modes, clear actions). ([Wallpaper Engine][1])
* 2D Eulerian stable at 1024², 60 FPS on mid-GPU; audio routing stable (no visual “pops”). ([MDN Web Docs][5])
* Preset save/load; two built-in presets validated.

## B) Definition of Done (per module)

* **Solvers**: kernels documented (I/O, units), workgroup sizes tunable, tests/bench results.
* **UI**: Tweakpane folders complete; each control wired and monitored. ([Tweakpane][6])
* **Audio**: MDN-compliant `AnalyserNode` usage; FFT config exposed; clipping guards. ([MDN Web Docs][5])
* **Rendering**: gradient/distortion parity with WE; thickness/refraction verified. ([Wallpaper Engine][1])

## C) Dev Tasks (initial sprint)

1. Boot **WebGPURenderer** scene + ParamStore + Tweakpane skeleton. ([Tweakpane][6])
2. Implement **Eulerian 2D** passes (TSL/WGSL), ping-pong, clear ops.
3. Paint tools: **collision** & **dye** masks with undo/erase. ([Wallpaper Engine][1])
4. Audio module: FFT bands, EMA, limiter; simple routing → emitter size/rate. ([MDN Web Docs][5])
5. Rendering: **Gradient** and **Distortion** modes; add Bloom.
6. Presets: JSON schema + example presets + export/import.

## D) Risk Log & Mitigations

* **TSL + StorageTexture quirks** → fall back to WGSL compute for tricky passes. ([three.js forum][2])
* **Cross-browser WebGPU** differences → feature detect + conservative math; clamp & NaN guards.
* **Audio input quality variance** → normalization + noise floor gating.

## E) Code Quality

* ESLint + Prettier; strict TS; docblocks on every kernel with math references.
* Visual assertions in dev HUD (residuals, max velocity, particle counts).

## F) Benchmark Protocol

* Warm-up 200 frames; record 5× 5-second windows; report medians.
* Track: total frame ms, each kernel ms, memory BW, FFT ms.
* Store results in `/bench/DATE.json`.

## G) Doc Listing (this package)

* `/docs/Spec.md` (this file)
* `/docs/Editor.md` (panel-by-panel manual)
* `/docs/Audio.md` (FFT setup, routing recipes)
* `/docs/Perf.md` (knobs, budgets, profiling guide)
* `/docs/Presets.md` (schema + gallery)
* `/docs/Contrib.md` (PR process; code style)

---

## Check (Quality Rubric)

* **Relevance**: Focused on WebGPU + three.js + TSL, WE-style editor parity, audio + UI. **5/5**
* **Factuality**: Cited WE docs, Tweakpane, MDN, and exemplar repos (PBF/SPH, multigrid). **5/5** ([Wallpaper Engine][1])
* **Completeness**: Includes features, architecture, APIs, presets, tests, perf, risks, roadmap. **5/5**
* **Clarity**: Structured sections, actionable tasks. **4/5** (dense but organized)

## Revise (one pass)

* Added explicit **Acceptance Criteria** and **Benchmark Protocol** so the team can validate MVP objectively.
* Included **file/module layout** capped at ~10 files, per your consolidation goal.

---

## Post-Run Audit

* **What worked:** Clear parity with WE; strong solver roadmap (Eulerian 2D → PBF 3D → Multigrid 3D); actionable dev tasks.
* **What’s missing:** No live code yet; multigrid WGSL kernels not included here.
* **Top assumption:** You want editor semantics to mirror WE closely for creator familiarity.
* **One risk:** Browser-specific WebGPU quirks could affect storage textures; we mitigate with WGSL fallbacks.
* **One next step:** I can generate a **starter repo** (TS + Vite) with a working **2D Eulerian** + **Tweakpane** + **Audio FFT** wired to an emitter—ready to extend to 3D.

[1]: https://docs.wallpaperengine.io/en/scene/effects/effect/advancedfluidsimulation.html?utm_source=chatgpt.com "Advanced Fluid Simulation Effect"
[2]: https://discourse.threejs.org/t/how-to-utilize-webgpu-is-nodes-the-best-option/50162?utm_source=chatgpt.com "How to utilize webgpu (is nodes the best option?) - Questions"
[3]: https://github.com/kishimisu/WebGPU-Fluid-Simulation?utm_source=chatgpt.com "kishimisu/WebGPU-Fluid-Simulation"
[4]: https://github.com/matsuoka-601/WebGPU-Ocean?utm_source=chatgpt.com "matsuoka-601/WebGPU-Ocean: A real-time 3D fluid ..."
[5]: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode?utm_source=chatgpt.com "AnalyserNode - Web APIs | MDN - Mozilla"
[6]: https://tweakpane.github.io/docs/?utm_source=chatgpt.com "Tweakpane"
[7]: https://github.com/MehdiSaffar/webgpu-sph?utm_source=chatgpt.com "MehdiSaffar/webgpu-sph: A fluid simulator than runs inside ..."
[8]: https://github.com/Bercon/roquefort?utm_source=chatgpt.com "Bercon/roquefort - WebGPU fluid simulator"
[9]: https://bercon.github.io/roquefort/?utm_source=chatgpt.com "Roquefort - WebGPU fluid simulator"
[10]: https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/?utm_source=chatgpt.com "WebGPU Fluid Simulations: High Performance & Real ..."
[11]: https://news.ycombinator.com/item?id=40429878&utm_source=chatgpt.com "Fast real time fluid simulator based on MPM algorithm"
