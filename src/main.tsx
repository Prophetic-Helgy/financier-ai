import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Initialize theme BEFORE React renders to avoid flash
(function initTheme() {
  const saved = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null) || 'system';
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (saved === 'system') {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(systemDark ? 'dark' : 'light');
  } else {
    root.classList.add(saved);
  }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
