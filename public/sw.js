// RING SATOE SALES - Service Worker (PWA installable)
const CACHE = 'ring-satoe-v5';
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

// API: network only (data harus fresh). Navigasi (app shell): network-first
// supaya fitur terbaru langsung kepakai tanpa hapus cache manual; fallback ke
// cache hanya saat offline. Aset statis lain: cache-first.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) {
    // API: network only (data harus fresh)
    return;
  }
  if (e.request.mode === 'navigate') {
    // cache:'reload' = lewati HTTP cache browser, selalu ambil terbaru dari server
    e.respondWith(
      fetch(e.request, { cache: 'reload' }).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() =>
        caches.match(e.request).then((hit) => hit || caches.match('/'))
      )
    );
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
