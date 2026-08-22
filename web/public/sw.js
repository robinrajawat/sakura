// Sakura (web rewrite) service worker -- deliberately simpler than legacy/public/sw.js.
//
// legacy's version statically precaches a known list of URLs (its own single-file index.html,
// pinned CDN library versions, etc) because those URLs are stable across deploys. web/'s Vite
// build output has content-hashed filenames that change every build, so there's no fixed list
// to precache ahead of time. Instead: runtime cache-first for same-origin GET requests, caching
// each response the first time it's actually fetched. This gives the same basic value (a repeat
// visit works offline) without needing build-time coordination with Vite's asset manifest.
//
// CACHE_NAME must be bumped whenever this file's own caching *behavior* changes, so stale
// runtime-cached entries under an old strategy get evicted on activate().
const CACHE_NAME = 'sakura-web-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['./', './manifest.json'])).then(() => self.skipWaiting())
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
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
