import { defineConfig } from 'vite';
import { resolve } from 'path';

// Phase 0 (see docs/architecture-plan.md): this config exists to PROVE the build pipeline
// works against the app exactly as it is today — index.html and hub.html are each a
// complete, self-contained static page (markup + inline CSS + inline scripts + CDN
// <script> tags with SRI hashes), and nothing here changes that. Vite's multi-page mode
// just treats both as build entries so the pipeline can be validated end-to-end before any
// actual code extraction (Phase 1+) begins.
//
// base: '/' because production is served from a custom domain root (www.sakura-notes.com),
// not a /sakura/ GitHub Pages project-page subpath — confirmed via the GitHub Pages API
// (cname: www.sakura-notes.com) before writing this config. Originally confirmed with
// source: main branch, path /; as of Stage 2 (docs/architecture-plan.md) the Pages source is
// "GitHub Actions" instead (deploy.yml publishes dist/ directly), but the custom domain and
// base '/' are unaffected either way.
//
// "Properly deployable dist/" (see docs/architecture-plan.md): Vite's own asset pipeline
// can't see everything the app needs — sw.js (registered via a JS string, not an HTML
// attribute) and the PWA manifests' own icon/start_url resolution (broken by Vite hashing and
// relocating them). `npm run build` covers this with a second step,
// scripts/copy-static-assets.mjs, run right after `vite build` — see that script's own header
// for the full investigation. This file's own `input`/`chunkSizeWarningLimit` config is
// unaffected; the fix lives entirely in that separate script.
export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        hub: resolve(__dirname, 'hub.html')
      }
    },
    // Both entry files are already large, hand-optimized single files (see the repo's own
    // scripts/validate_html_structure.py for why they're treated this carefully) — Vite's
    // default chunk-size warning threshold isn't a meaningful signal here yet. Revisit once
    // Phase 1+ actually splits code into real chunks.
    chunkSizeWarningLimit: 5000
  },
  server: {
    port: 5173
  }
});
