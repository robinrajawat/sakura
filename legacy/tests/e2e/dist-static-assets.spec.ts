import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const distDir = path.join(repoRoot, 'dist');
const publicDir = path.join(repoRoot, 'public');

// Same skip pattern as build-smoke.spec.ts — requires `npm run build` to have run first (CI's
// verify job does this before e2e tests; run `npm run build && npx playwright test
// dist-static-assets` to exercise this file deliberately).
//
// Regression coverage for public/'s static passthrough. Static assets (service worker, both
// PWA manifests, icons, social-card image, CNAME) live in public/ — Vite's own publicDir
// convention — and get copied verbatim into dist/ at build time with zero configuration, no
// custom script needed. This replaces scripts/copy-static-assets.mjs's hand-rolled version of
// the same thing: that script existed only because these files previously lived at the repo
// root (outside any Vite-recognized static folder), which made `vite build` alone silently
// drop sw.js entirely (never referenced from any HTML attribute Vite's scanner can see) and
// mis-hash manifest.json/hub-manifest.json into dist/assets/, breaking their own start_url/icon
// resolution (the Web App Manifest spec resolves both relative to the manifest's own URL).
// Moving the files into public/ fixes the underlying cause rather than working around it —
// see docs/architecture-plan.md's "Repo hygiene" note for the full history — and also fixed a
// real, previously-invisible gap: social-card.png (referenced only via an absolute
// https://www.sakura-notes.com/... URL in Open Graph/Twitter meta tags, never HTML-relative)
// and icon-glyph-192.png (referenced only via a JS string in a Notification() call, same blind
// spot sw.js used to sit in) were never copied into dist/ at all under the old script, meaning
// both were silently 404ing in production since Stage 2's cutover to CI-built dist/ — neither
// was in that script's own PASSTHROUGH_FILES list, since both reference patterns are the same
// class of "invisible to Vite's HTML scanner" blind spot sw.js already had, just not audited
// for at the time.
test.describe('dist/ static passthrough assets (public/)', () => {
  test.skip(!existsSync(distDir), 'dist/ not built yet — run `npm run build` first');

  const PASSTHROUGH_FILES = [
    'sw.js',
    'manifest.json',
    'hub-manifest.json',
    'icon-192-pwa.png',
    'icon-512-pwa.png',
    'icon-512-maskable.png',
    'icon-192.png',
    'icon-192-dark.png',
    'icon-glyph-192.png',
    'flower-glyph.svg',
    'social-card.png',
    'CNAME'
  ];

  for (const file of PASSTHROUGH_FILES) {
    test(`dist/${file} exists and is byte-identical to public/${file}`, () => {
      const distPath = path.join(distDir, file);
      const sourcePath = path.join(publicDir, file);
      expect(existsSync(distPath)).toBe(true);
      expect(readFileSync(distPath).equals(readFileSync(sourcePath))).toBe(true);
    });
  }

  test('dist/index.html\'s manifest link points at the real dist/manifest.json (left untouched by Vite, not hashed into dist/assets/)', () => {
    const html = readFileSync(path.join(distDir, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="manifest.json">');
  });

  test('dist/hub.html\'s manifest link points at the real dist/hub-manifest.json', () => {
    const html = readFileSync(path.join(distDir, 'hub.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="hub-manifest.json">');
  });

  test('dist/ has no orphaned Vite-hashed dist/assets/ directory left over from the old manifest-hashing behavior', () => {
    expect(existsSync(path.join(distDir, 'assets'))).toBe(false);
  });

  test('the manifest\'s own start_url and icon paths resolve correctly relative to where it actually lives in dist/', () => {
    // start_url and icon src are both spec'd to resolve relative to the manifest's OWN url —
    // correct here specifically because manifest.json sits at dist/'s root, same as
    // index.html, matching production's existing (already-correct) layout exactly.
    const manifest = JSON.parse(readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
    expect(manifest.start_url).toBe('./index.html');
    expect(existsSync(path.join(distDir, 'index.html'))).toBe(true);
    for (const icon of manifest.icons) {
      expect(existsSync(path.join(distDir, icon.src))).toBe(true);
    }
  });
});
