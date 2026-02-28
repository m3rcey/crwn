const CACHE_NAME = 'crwn-v1';
const STATIC_ASSETS = [
  '/favicon.ico',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip audio file requests - let them go to network
  if (event.request.url.match(/\.(mp3|wav|flac|m4a|ogg)$/i)) {
    return;
  }

  // Skip cache entirely for navigation requests - let middleware handle redirects
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response or fetch from network
      if (response) {
        return response;
      }
      return fetch(event.request).then((fetchResponse) => {
        // Cache successful responses for static assets
        if (
          fetchResponse.ok &&
          fetchResponse.url.match(/\.(js|css|png|jpg|jpeg|svg|woff|woff2)$/i)
        ) {
          const responseToCache = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return fetchResponse;
      });
    }).catch(() => {
      // Return offline fallback for non-navigation requests
      return caches.match('/favicon.ico');
    })
  );
});
