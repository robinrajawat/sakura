import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React rewrite of Sakura (docs/framework-migration-plan.md). Deployed to
// www.sakura-notes.com as of Phase 5's cutover (deploy.yml) -- base: '/' matches legacy/'s own
// config since both serve from the same custom-domain root (only one is live at a time).
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5175
  }
});
