// RING SATOE SALES - Service Worker (PWA installable)
const CACHE = 'ring-satoe-v2';
const CORE = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first untuk API, cache-first untuk aset statis
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) {
    // API: network only (data harus fresh)
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => {
      return hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match('/'));
    })
  );
});
