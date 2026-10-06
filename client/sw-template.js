/* global self, caches, fetch, URL, __ASSETS__ */
/* TECHNOVA POS service worker: keeps the app shell available offline so the POS can open
 * without the server. API calls are never cached (sales go through the IndexedDB outbox). */
const VERSION = '__VERSION__';
const CACHE = `technova-shell-${VERSION}`;
const PRECACHE = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/logo.svg', ...PRECACHE])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('technova-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: network first, cached shell when the server is unreachable
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/', { cacheName: CACHE })));
    return;
  }
  // Hashed build assets: cache first
  event.respondWith(
    caches.match(req, { cacheName: CACHE }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && url.pathname.startsWith('/assets/')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
