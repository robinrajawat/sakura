// Sakura (web rewrite) service worker -- direct port of legacy's real public/sw.js strategy (see
// that file's own header for the full reasoning): install-time precache of a known asset list,
// network-first for navigation requests (an online visit always sees whatever was most recently
// deployed -- cache-first there would mean a shipped fix stays invisible indefinitely, a worse
// failure mode than no offline support), cache-first for static asset destinations, everything
// else (Firestore, AI provider calls, auth) passes straight through untouched.
//
// Unlike legacy's own hand-written PRECACHE_URLS (safe to hardcode -- legacy/index.html is one
// unhashed file, and its CDN library URLs are pinned to an exact version in their own path),
// `web/`'s Vite build emits content-hashed filenames that change every build, so there's no fixed
// list to write by hand here. The array below is a placeholder: `scripts/generate-sw-precache.mjs`
// runs after `vite build`, reads Vite's own build manifest (`dist/.vite/manifest.json`), and
// rewrites this exact line (matched by the trailing `GENERATED:precacheUrls` marker comment) in
// `dist/sw.js` with the real, build-time-computed list -- this file (`public/sw.js`) is the
// checked-in template, never served to a browser as-is.
//
// CACHE_NAME's base string only needs bumping when this file's own caching *behavior* changes.
// Unlike legacy's real convention (a developer bumps the version by hand whenever a precached
// asset's *content* changes, since legacy's own assets change rarely), that same generator script
// appends a content hash of the real precache list onto CACHE_NAME automatically, every build --
// necessary here since the list's contents genuinely do change on every single build (new content
// hashes), so `activate()`'s cache-name-mismatch cleanup needs a name that actually changes too,
// or the previous deploy's now-orphaned hashed assets would never get evicted.
const CACHE_NAME = 'sakura-web-shell-v2';

const PRECACHE_URLS = ['./', './index.html', './manifest.json']; // GENERATED:precacheUrls

// Request destinations treated as static assets (cache-first, opportunistically cached on first
// fetch even when not in PRECACHE_URLS) -- matches legacy's own real STATIC_DESTINATIONS set
// exactly. Deliberately narrow: must never include plain fetch()/XHR calls (destination ''),
// since those are how Firestore sync and AI providers talk to their APIs -- serving those from a
// stale cache would be a correctness bug, not a convenience.
const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image', 'manifest']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[sakura sw] precache failed:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POSTs etc. (API calls, sync writes)

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((res) => res || caches.match(req)))
    );
    return;
  }

  if (STATIC_DESTINATIONS.has(req.destination)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // Everything else -- Firestore, AI provider calls, auth -- always goes to the network untouched.
});
