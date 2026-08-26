// Pure logic for `scripts/generate-sw-precache.mjs` -- split out from that script's own file I/O
// so it's directly unit-testable (`scripts/swPrecache.test.mjs`), matching this project's own
// established "pure logic separated from I/O" convention for everything else in `src/`.

/** Fixed, unhashed files every build always has -- matches legacy's own real `PRECACHE_URLS`
 * shape for its equivalent unhashed assets (the app shell HTML, the PWA manifest, its icon set).
 * No external CDN library/font URLs, unlike legacy's own real list -- `web/` bundles its own
 * dependencies via Vite (covered by the hashed-asset scan in `buildPrecacheUrls` below) and
 * doesn't load Google Fonts via a `<link>` tag the way legacy does. */
export const FIXED_PRECACHE_URLS = ['./', './index.html', './manifest.json', './icon-192-pwa.png', './icon-512-pwa.png', './icon-512-maskable.png'];

/** Given Vite's own real build manifest (`dist/.vite/manifest.json`'s already-parsed contents,
 * `build.manifest: true` in vite.config.ts), returns the real, deduplicated, sorted list of
 * every content-hashed asset URL this build actually emitted (JS entry/chunk files, their own
 * `css`/`assets` sub-lists), each relative-path-prefixed with `./` to match `FIXED_PRECACHE_URLS`'
 * own shape. */
export function hashedAssetUrlsFromManifest(manifest) {
  const urls = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry.file) urls.add('./' + entry.file);
    if (Array.isArray(entry.css)) entry.css.forEach((f) => urls.add('./' + f));
    if (Array.isArray(entry.assets)) entry.assets.forEach((f) => urls.add('./' + f));
  }
  return Array.from(urls).sort();
}

/** The full real precache list for one build: the fixed unhashed files plus every real hashed
 * asset this build emitted, in that order (fixed files first, matching legacy's own real
 * PRECACHE_URLS ordering convention of listing the app shell before library assets). */
export function buildPrecacheUrls(manifest) {
  return [...FIXED_PRECACHE_URLS, ...hashedAssetUrlsFromManifest(manifest)];
}

const PRECACHE_URLS_MARKER = /const PRECACHE_URLS = \[.*?\]; \/\/ GENERATED:precacheUrls/s;
const CACHE_NAME_MARKER = /const CACHE_NAME = '([^']+)';/;

/** Rewrites `public/sw.js`'s own two placeholder lines (`PRECACHE_URLS`, `CACHE_NAME`) with the
 * real, build-time-computed precache list and a content-hash-suffixed cache name -- see
 * `public/sw.js`'s own header for why the cache name needs a per-build-changing suffix (unlike
 * legacy's real manual-bump convention, `web/`'s hashed filenames change on every single build,
 * so `activate()` needs a name that actually changes too, or the previous deploy's now-orphaned
 * cached assets are never evicted). Throws if either marker line is missing -- a template shape
 * change in `public/sw.js` that this function hasn't been updated for is a real bug, not
 * something to silently no-op past. */
export function templateServiceWorker(swSource, precacheUrls, listHash) {
  if (!PRECACHE_URLS_MARKER.test(swSource)) {
    throw new Error('could not find the PRECACHE_URLS marker line -- did public/sw.js change shape?');
  }
  if (!CACHE_NAME_MARKER.test(swSource)) {
    throw new Error('could not find the CACHE_NAME line -- did public/sw.js change shape?');
  }
  let sw = swSource.replace(PRECACHE_URLS_MARKER, `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)}; // GENERATED:precacheUrls`);
  sw = sw.replace(CACHE_NAME_MARKER, (_match, base) => `const CACHE_NAME = '${base}-${listHash}';`);
  return sw;
}
