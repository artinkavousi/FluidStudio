# Performance Playbook

## Targets
- 60 FPS at 128² resolution on mid-tier GPUs.
- Under 8 ms solver time, <4 ms rendering, <2 ms UI/audio overhead.

## Tuning Knobs
- **Resolution**: Primary cost driver (O(n²)). Offer presets at 64, 96, 128, 192, 256.
- **Pressure Iterations**: Balance incompressibility accuracy vs. compute cost.
- **Dissipation**: Higher values reduce dye accumulation, lowering buffer energy.
- **Brush Strength**: Avoid extremely high inputs that saturate the field.

## Profiling Workflow
1. Start with clean scene, warm up 200 frames.
2. Record FPS and kernel timings using browser devtools Performance panel.
3. Adjust resolution / iterations to hit budget.
4. Inspect GC by watching memory timeline while interacting for 2+ minutes.

## Optimization Backlog
- Migrate solver kernels to WebGPU compute passes to leverage parallelism.
- Add half-res bloom and distortion passes.
- Introduce adaptive timestep based on velocity magnitude.
