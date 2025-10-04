import './styles/main.css';
import { App } from './core/App';

declare global {
  interface Window {
    app?: App;
  }
}

async function bootstrap() {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Failed to find app container');
  }

  const app = new App(container);
  await app.init();
  window.app = app;
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap AURORA Fluid Studio', error);
});
