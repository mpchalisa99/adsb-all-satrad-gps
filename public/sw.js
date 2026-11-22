const CACHE_NAME = 'mata-x-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/aistudio/1795351952607_f358a1b3.png',
  '/assets/aistudio/IMG_20261122_194755_891_091df230.jpg',
  '/assets/aistudio/IMG_20261122_194756_745_b3bf089a.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting()).catch((err) => {
      console.error('Service worker install cache failed:', err);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-Only for API requests (never cache live ADS-B data feed)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ success: false, flights: [], error: "Offline mode: ADS-B network unavailable." }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Cache-first for map tiles and images
  if (url.hostname.includes('cartocdn.com') || url.hostname.includes('openstreetmap.org') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // Stale-while-revalidate / Cache with network fallback for other navigation/assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    }).catch(() => caches.match('/index.html'))
  );
});
