// Sakura service worker.
//
// The previous version of this file registered successfully (so the browser treated the app
// as a PWA) but never actually cached anything -- install() didn't precache, and the fetch
// handler's cache-fallback had nothing to fall back to. That combination gives the appearance
// of offline support (installable, has a service worker) without the substance of it: a first
// visit needs the network regardless, and every visit after that needed it too, since nothing
// was ever stored. This version actually precaches the app shell and its external dependencies,
// so a document opened after at least one successful online visit keeps working without a
// connection -- editing, exporting, everything that doesn't itself require a network call
// (AI actions, cloud sync, Feedback Inbox) stays available.
//
// CACHE_NAME must be bumped any time a precached asset's *content* changes (icons, fonts,
// pinned CDN library versions, etc) even though its URL stays the same -- activate() below
// only evicts caches whose *name* differs from the current CACHE_NAME, so a same-name cache
// serves whatever bytes it first stored, forever, regardless of what's actually deployed.
// This bit us concretely: manifest.json/icon-192.png/icon-512.png are cached with
// destination 'manifest'/'image' (cache-first, see STATIC_DESTINATIONS below), so once a
// browser had precached an older icon under this cache name, it kept serving that stale icon
// to Chrome's "Install app" flow indefinitely -- reinstalling the PWA doesn't clear this
// origin's Cache Storage, only the OS-level shortcut, so the newly-redesigned icon on the
// server was never actually seen. Bump the version suffix whenever an asset in
// PRECACHE_URLS (or anything else served under a STATIC_DESTINATIONS type) changes.
const CACHE_NAME = 'sakura-shell-v5';

// Assets whose content is effectively immutable for a given URL -- the CDN libraries are
// pinned to an exact version in their path (xlsx@0.18.5, pptxgenjs@4.0.1), and Google Fonts'
// own CSS is stable enough in practice that unconditional long-term caching is the right
// trade-off here. Precached on install so the very first offline visit already has them,
// rather than waiting for a second online visit to have fetched them once.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-dark.png',
  './icon-512-dark.png',
  './icon-192-pwa.png',
  './icon-512-pwa.png',
  './icon-512-maskable.png',
  './flower-glyph.svg',
  './icon-glyph-192.png',
  'https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Fira+Code:wght@400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.11.0/mammoth.browser.min.js',
  'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js',
];

// Request destinations treated as static assets (cache-first, opportunistically cached on
// first fetch even when not in PRECACHE_URLS -- covers the actual .woff2 files Google Fonts'
// CSS references via @font-face, whose exact URLs aren't knowable ahead of time). Deliberately
// narrow: this must never include plain fetch()/XHR calls (destination ''), since those are
// how Firestore sync, AI providers, and Feedback Inbox talk to their APIs, and serving those
// from a stale cache would be a correctness bug, not a convenience.
const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image', 'manifest']);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => console.warn('[sakura sw] precache failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POSTs etc. (API calls, sync writes)

  // The document itself: network-first, falling back to the last cached copy only once the
  // network actually fails. An online visit always gets whatever was most recently deployed --
  // cache-first here would mean Robin could push a fix and users would keep seeing the old
  // version indefinitely, which is a worse failure mode than "no offline support" was.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(res => res || caches.match(req)))
    );
    return;
  }

  if (STATIC_DESTINATIONS.has(req.destination)) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Everything else -- Firestore, AI provider calls, auth, Feedback Inbox -- always goes to
  // the network untouched.
});
