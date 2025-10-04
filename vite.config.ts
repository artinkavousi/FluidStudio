import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    https: false,
    port: 5173
  },
  build: {
    sourcemap: true,
    target: 'esnext'
  }
});
