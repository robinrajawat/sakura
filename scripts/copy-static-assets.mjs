#!/usr/bin/env node
/**
 * Phase "properly deployable dist/" investigation (docs/architecture-plan.md, Open items):
 * `vite build` alone produces an INCOMPLETE, and in one place actively BROKEN, `dist/` —
 * found by checking what actually landed in `dist/` against what index.html/hub.html and
 * their manifests reference, not assumed from the build succeeding without error.
 *
 * 1. `sw.js`: registered via a JS string literal
 *    (`navigator.serviceWorker.register('sw.js')` in index.html), which Vite's HTML asset
 *    scanner never sees (it only rewrites `href`/`src` attributes it can find in the markup
 *    itself). Never made it into `dist/` at all — a deploy of `dist/` as built would 404 on
 *    the service worker, silently breaking offline/installability with no visible error.
 *
 * 2. `manifest.json`/`hub-manifest.json`: Vite DOES see `<link rel="manifest" href="...">`
 *    and processes it like any other HTML-referenced asset — hashes it and copies it to
 *    `dist/assets/manifest-<hash>.json`, rewriting the `<link>` tag to point there. Tried
 *    making the `<link>` href root-absolute (`/manifest.json`) on the theory that Vite leaves
 *    absolute HTML references alone — checked, not the case in this Vite/config combination;
 *    it hashes and relocates absolute references exactly the same way. That relocation is a
 *    real, silent regression: the Web App Manifest spec resolves BOTH `start_url` and each
 *    icon's `src` relative to the manifest's OWN url, not the document's. The manifest's
 *    `start_url` is `./index.html` — correct today because `manifest.json` sits at the same
 *    root `index.html` does, but WRONG once relocated to `dist/assets/`, where it would
 *    resolve to a nonexistent `dist/assets/index.html`. The same relocation is also why the
 *    icon files below never resolved either — `icon-192-pwa.png` etc. would need to live
 *    alongside wherever the manifest actually ends up, and Vite never copies them there since
 *    it only sees HTML attributes, never a manifest's own JSON content.
 *
 *    Rather than chase the hashed manifest's exact final path (fragile — its hash changes
 *    every time the manifest's content does), this script copies the REAL, unhashed
 *    manifests into `dist/` at the same root path production already serves them from today,
 *    then rewrites the built HTML's `<link>` tag back to that plain path. `start_url` and
 *    every icon `src` then resolve exactly the way they already do in production — zero
 *    reliance on manifest-relative-URL edge cases. The hashed copies Vite left in
 *    `dist/assets/` become orphaned, unreferenced dead weight (a few KB) — left in place
 *    rather than deleted, to keep this script's own blast radius to "add/fix", not "also
 *    prune Vite's own output".
 *
 * 3. `CNAME`: not referenced by any HTML/JS at all (GitHub Pages reads it directly from the
 *    published tree's root under the "deploy from branch" source type). Not required under
 *    the "GitHub Actions" source type — custom domain there is a repo setting, independent of
 *    the artifact — but copied anyway so `dist/` is a genuinely complete, self-contained copy
 *    of the deployed site rather than one that's silently incomplete depending on which
 *    deployment mechanism happens to be active.
 *
 * All six real files (sw.js, manifest.json, hub-manifest.json, and the three icons) are
 * deliberately kept at the repo root (not moved into a Vite `public/` dir, Vite's normal
 * passthrough mechanism) — moving them would remove them from the root the CURRENT "legacy"
 * GitHub Pages deployment (serving `main` root directly) actually reads them from, breaking
 * the LIVE site immediately on merge, well before any deploy-mechanism switch. Copying
 * instead of moving keeps both the legacy root-served files and dist/'s own output correct
 * at the same time.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');

const PASSTHROUGH_FILES = [
  'sw.js',
  'manifest.json',
  'hub-manifest.json',
  'icon-192-pwa.png',
  'icon-512-pwa.png',
  'icon-512-maskable.png',
  'CNAME'
];

if (!existsSync(distDir)) {
  console.error(`✖ ${distDir} does not exist — run \`vite build\` first.`);
  process.exit(1);
}

for (const file of PASSTHROUGH_FILES) {
  const src = path.join(repoRoot, file);
  if (!existsSync(src)) {
    console.error(`✖ Expected static passthrough file "${file}" not found at repo root.`);
    process.exit(1);
  }
  copyFileSync(src, path.join(distDir, file));
}

/** Rewrites the built HTML's Vite-hashed <link rel="manifest"> tag back to the plain,
 * unhashed root path this script just copied the real manifest to — see this file's own
 * header for why the hashed/relocated version breaks the manifest's own relative URLs. */
function fixManifestLink(htmlFile, correctHref) {
  const htmlPath = path.join(distDir, htmlFile);
  const original = readFileSync(htmlPath, 'utf8');
  const fixed = original.replace(/<link rel="manifest" href="[^"]*">/, `<link rel="manifest" href="${correctHref}">`);
  if (fixed === original) {
    console.error(`✖ Could not find a <link rel="manifest"> tag to fix in dist/${htmlFile}.`);
    process.exit(1);
  }
  writeFileSync(htmlPath, fixed);
}
fixManifestLink('index.html', '/manifest.json');
fixManifestLink('hub.html', '/hub-manifest.json');

console.log(`✓ Copied ${PASSTHROUGH_FILES.length} static passthrough files into dist/ (${PASSTHROUGH_FILES.join(', ')})`);
console.log('✓ Fixed dist/index.html and dist/hub.html manifest links to point at the real, unhashed manifests');
