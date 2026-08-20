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
// (cname: www.sakura-notes.com, source: main branch, path /) before writing this config.
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
