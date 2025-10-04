# Contribution Guide

## Tooling
- Node 20+, pnpm or npm.
- `npm install` then `npm run dev` for Vite dev server.
- `npm run lint` to ensure code quality.

## Branch Workflow
1. Fork / feature branch from `main`.
2. Implement change with tests or demo if applicable.
3. Update docs and presets when adding new parameters.
4. Submit PR with summary + testing notes.

## Code Style
- TypeScript strict mode.
- Prefer pure functions for math utilities.
- Document solver kernels with inline comments referencing equations.
- Avoid try/catch around imports (per repo style).

## Testing
- Manual QA: verify solver stability at 64² and 128², audio activation, preset switching.
- Automated backlog: integrate vitest + playwright for future regression coverage.
