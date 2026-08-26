#!/usr/bin/env node
// §6.11 slice (docs/phase6-full-parity-plan.md, "PWA & polish pass"): the build-time half of
// `public/sw.js`'s real static precache strategy -- see that file's own header for the full
// reasoning. Runs after `vite build` (chained in package.json's `build` script): reads Vite's
// own build manifest (`dist/.vite/manifest.json`, emitted because `vite.config.ts` sets
// `build.manifest: true`) to find every real content-hashed JS/CSS/asset file this build actually
// emitted, combines that with the small fixed set of unhashed `public/` files every build always
// has (the HTML shell, the PWA manifest, the 3 icon files), and rewrites `dist/sw.js`'s
// `PRECACHE_URLS` placeholder with the real list -- direct-porting legacy's own real precache
// strategy onto a build where, unlike legacy's single unhashed `index.html`, there's no fixed
// asset list to hand-write ahead of time. The actual list-building/templating logic lives in
// `scripts/swPrecache.mjs` (pure, unit-tested); this file is just the file-I/O wrapper around it.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrecacheUrls, templateServiceWorker } from './swPrecache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const manifestPath = path.join(distDir, '.vite', 'manifest.json');
const swPath = path.join(distDir, 'sw.js');

if (!existsSync(manifestPath)) {
  console.error('[generate-sw-precache] dist/.vite/manifest.json not found -- did `vite build` run with build.manifest:true?');
  process.exit(1);
}
if (!existsSync(swPath)) {
  console.error('[generate-sw-precache] dist/sw.js not found -- is public/sw.js present?');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const precacheUrls = buildPrecacheUrls(manifest);
const listHash = createHash('sha256').update(JSON.stringify(precacheUrls)).digest('hex').slice(0, 10);

let sw;
try {
  sw = templateServiceWorker(readFileSync(swPath, 'utf8'), precacheUrls, listHash);
} catch (err) {
  console.error(`[generate-sw-precache] ${err.message}`);
  process.exit(1);
}

writeFileSync(swPath, sw);
console.log(`[generate-sw-precache] wrote ${precacheUrls.length} precache URLs into dist/sw.js (cache "${listHash}")`);
