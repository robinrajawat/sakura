import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Phase 0 (docs/framework-migration-plan.md): this is a scaffold, not the real app yet.
// Its only job right now is proving the React + Vite + TypeScript + Zustand toolchain
// builds, typechecks, lints, and tests cleanly inside the npm-workspaces monorepo — real
// UI work starts at Phase 1 (porting src/core/, src/state/, src/utils/ from legacy/).
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element not found — check web/index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA install support (Phase 3, docs/framework-migration-plan.md) -- registers the runtime-
// caching service worker at public/sw.js. Guarded by the standard feature check; a failed
// registration (e.g. running over plain http in some dev setups) doesn't block the app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal -- the app works fine without offline support, just without it.
    });
  });
}
