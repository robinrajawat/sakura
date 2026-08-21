import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The new React app (docs/framework-migration-plan.md). Not deployed anywhere yet — see
// this package's own package.json description. base: '/' matches legacy/'s own config in
// anticipation of eventually serving from the same custom-domain root, but this has no
// effect until Phase 5's cutover actually points deploy.yml at this package's build output.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5175
  }
});
