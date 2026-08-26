import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The new React app (docs/framework-migration-plan.md). Not deployed anywhere yet -- see
// this package's own package.json description. A brief cutover attempt was reverted; see
// deploy.yml's own header for why. base: '/' matches legacy/'s own config in anticipation of
// eventually serving from the same custom-domain root, but this has no effect until a real,
// re-verified Phase 5 cutover actually points deploy.yml at this package's build output again.
export default defineConfig({
  plugins: [react()],
  base: '/',
  // §6.11 slice (docs/phase6-full-parity-plan.md, "PWA & polish pass"): `build.manifest` emits
  // `dist/.vite/manifest.json` (source file -> real hashed output file mapping), which
  // `scripts/generate-sw-precache.mjs` reads after the build to populate `sw.js`'s real
  // `PRECACHE_URLS` list -- see that script's own header for why this exists at all (Vite's
  // content-hashed filenames mean there's no fixed list to hand-write the way legacy's own real
  // `sw.js` does for its single unhashed `index.html`).
  build: {
    manifest: true
  },
  server: {
    port: 5175
  }
});
