import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { installAudienceBridge } from './state/audienceBridge';
import { seedFixtureIfRequested } from './state/devFixture';

// Phase 0 (docs/framework-migration-plan.md): this is a scaffold, not the real app yet.
// Its only job right now is proving the React + Vite + TypeScript + Zustand toolchain
// builds, typechecks, lints, and tests cleanly inside the npm-workspaces monorepo — real
// UI work starts at Phase 1 (porting src/core/, src/state/, src/utils/ from legacy/).

// §6.6 slice (docs/phase6-full-parity-plan.md): installs `window.__sakuraAudience` on EVERY
// window unconditionally, regardless of which role (presenter or audience) it ends up playing --
// see audienceBridge.ts's own header for the full mechanism. Must run before either role's own
// cross-window calls can reach it, so this happens here at the true top of boot, before
// `App` even renders.
installAudienceBridge();

// §8.5 slice (docs/phase8-design-system-parity-plan.md): the real verification fixture, gated
// behind `?seedFixture=1` -- a no-op otherwise. Must run before App renders and before
// DocumentTabs.tsx's own mount-time `documentsStore.init()` call, same "before React renders"
// placement as installAudienceBridge() above.
seedFixtureIfRequested(window.location.search);

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
