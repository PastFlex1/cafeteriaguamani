import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent mouse wheel scrolling from changing number inputs globally
document.addEventListener('wheel', (event) => {
  const active = document.activeElement as HTMLInputElement;
  if (active?.tagName === 'INPUT' && active.type === 'number') {
    active.blur();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
