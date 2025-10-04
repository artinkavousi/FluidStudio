# Audio Reactivity Guide

## Overview
AURORA uses the Web Audio API `AnalyserNode` to expose FFT magnitudes. The analyser runs at `fftSize = 1024`, yielding 512 frequency bins. UI controls allow you to:
- Enable microphone capture (user gesture required).
- Adjust `smoothingTimeConstant` for temporal smoothing.
- Multiply normalized amplitudes via `gain`.

## Band Mapping
- **Band Index**: 0 is lowest frequency (~0–43 Hz at 44.1 kHz sample rate). Higher indices map to higher frequencies.
- **Usage**: Emitters sample the configured band each frame. The normalized magnitude (0–1) scales dye injection strength in `addImpulse`.

## Safety / UX
- On activation failure (user denies permission), the analyser remains inactive and the UI logs an error.
- Gain is clamped to prevent NaNs; values above 4 risk clipping.
- Smoothing 0.6 is a good balance between responsiveness and flicker.

## Future Work
- Support audio file playback routing.
- Implement multi-band routing matrix to drive multiple parameters simultaneously.
