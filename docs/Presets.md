# Preset Catalog

## Aurora Default
- **Mood**: Cool teal ink with soft bloom.
- **Simulation**: 128² grid, low viscosity (0.001), slow diffusion (1e-5), dissipation 0.995.
- **Emitter**: Small radius (0.04), strong dye (25), medium velocity force (250).
- **Audio**: Inactive by default; use band 4 for low-mid thump.

## JSON Schema (excerpt)
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "state": {
    "simulation": {
      "resolution": "number",
      "viscosity": "number",
      "diffusion": "number",
      "dissipation": "number",
      "curlStrength": "number",
      "pressureIterations": "number"
    },
    "rendering": {
      "mode": "gradient | emitter | distortion",
      "gradientStops": [
        { "position": "number(0-1)", "color": "#rrggbb" }
      ],
      "exposure": "number",
      "bloomStrength": "number"
    },
    "audio": {
      "active": "boolean",
      "smoothing": "number",
      "gain": "number"
    },
    "emitters": {
      "primary": {
        "id": "string",
        "brushRadius": "number",
        "brushStrength": "number",
        "forceStrength": "number",
        "audioBand": "number"
      }
    }
  }
}
```
