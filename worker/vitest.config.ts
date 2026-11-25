import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url)) }
  },
  test: {
    server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } }
  }
});
