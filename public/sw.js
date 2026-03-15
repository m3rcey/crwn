const CACHE_NAME = 'crwn-v10';
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

// Activate event - clean up ALL old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - network first for everything except static assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Skip audio files
  if (event.request.url.match(/\.(mp3|wav|flac|m4a|ogg)$/i)) return;

  // Navigation requests - always network, never cache
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
    return;
  }

  // JS and CSS - network first, no caching (prevents stale chunk issues)
  if (event.request.url.match(/\.(js|css)$/i)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Only cache static assets (images, fonts)
  event.respondWith(
    fetch(event.request).then((fetchResponse) => {
      if (
        fetchResponse.ok &&
        fetchResponse.url.match(/\.(png|jpg|jpeg|svg|woff|woff2|ico)$/i)
      ) {
        const responseToCache = fetchResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return fetchResponse;
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
