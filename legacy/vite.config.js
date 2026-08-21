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
// Static passthrough assets (service worker, both PWA manifests, icons, social-card image,
// CNAME) live in public/ — Vite's own publicDir convention (the default, so no explicit
// `publicDir` option is needed here). Files there are copied verbatim into dist/ at build
// time, with their HTML references left completely untouched (not hashed/relocated the way
// Vite treats assets inside its own module graph) — this is what actually fixes the
// historical gap here: `vite build` alone used to silently drop sw.js (registered via a JS
// string, invisible to Vite's HTML scanner) and mis-hash the manifests, breaking their own
// start_url/icon resolution (the Web App Manifest spec resolves both relative to the
// manifest's own URL). See docs/architecture-plan.md's "Repo hygiene" note for the history —
// these files used to sit at the repo root with a hand-rolled copy script
// (scripts/copy-static-assets.mjs, now deleted) working around exactly this; moving them into
// public/ fixes the underlying cause instead.
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
