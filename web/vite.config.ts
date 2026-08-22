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
  server: {
    port: 5175
  }
});
