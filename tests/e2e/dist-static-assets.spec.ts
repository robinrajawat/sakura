import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const distDir = path.join(repoRoot, 'dist');

// Same skip pattern as build-smoke.spec.ts — requires `npm run build` to have run first (CI's
// verify job does this before e2e tests; run `npm run build && npx playwright test
// dist-static-assets` to exercise this file deliberately).
//
// Regression coverage for scripts/copy-static-assets.mjs — see that file's own header for the
// full investigation. `vite build` alone silently drops sw.js entirely (never referenced from
// any HTML attribute Vite's scanner can see) and breaks manifest.json/hub-manifest.json's own
// start_url/icon resolution by hashing and relocating them to dist/assets/ — a real regression
// that produced no build error and no visible failure short of actually installing the PWA.
test.describe('dist/ static passthrough assets (scripts/copy-static-assets.mjs)', () => {
  test.skip(!existsSync(distDir), 'dist/ not built yet — run `npm run build` first');

  const PASSTHROUGH_FILES = [
    'sw.js',
    'manifest.json',
    'hub-manifest.json',
    'icon-192-pwa.png',
    'icon-512-pwa.png',
    'icon-512-maskable.png',
    'CNAME'
  ];

  for (const file of PASSTHROUGH_FILES) {
    test(`dist/${file} exists and is byte-identical to the repo-root source`, () => {
      const distPath = path.join(distDir, file);
      const sourcePath = path.join(repoRoot, file);
      expect(existsSync(distPath)).toBe(true);
      expect(readFileSync(distPath).equals(readFileSync(sourcePath))).toBe(true);
    });
  }

  test('dist/index.html\'s manifest link points at the real, unhashed dist/manifest.json (not a Vite-hashed dist/assets/ copy)', () => {
    const html = readFileSync(path.join(distDir, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.json">');
  });

  test('dist/hub.html\'s manifest link points at the real, unhashed dist/hub-manifest.json', () => {
    const html = readFileSync(path.join(distDir, 'hub.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/hub-manifest.json">');
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
