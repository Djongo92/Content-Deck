const CACHE_VERSION = 'content-desk-shell-v1';
const RUNTIME_CACHE = 'content-desk-runtime-v1';
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const shellUrl = new URL(SCOPE_PATH, self.location.origin).toString();
const shellAssets = [
  shellUrl,
  new URL('manifest.webmanifest', shellUrl).toString(),
  new URL('favicon.svg', shellUrl).toString(),
  new URL('icons/icon-192.png', shellUrl).toString(),
  new URL('icons/icon-512.png', shellUrl).toString(),
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(shellAssets))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_VERSION).then(cache => cache.put(shellUrl, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(shellUrl)) || Response.error())
    );
    return;
  }

  const cacheable = url.origin === self.location.origin
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          void caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    })
  );
});