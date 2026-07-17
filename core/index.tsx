import './App.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

const render = async () => {
  if (!('codiff' in window)) {
    const { installWebClient } = await import('./web-client.ts');
    installWebClient();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

await render();
