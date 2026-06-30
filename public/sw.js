const CACHE_NAME = 'crwn-v83';
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

  // Navigation requests - network FIRST so a new deploy reaches the client on
  // the next load (no manual cache-clear). Cache the shell only as an offline
  // fallback. Previously this bypassed the SW entirely, which let iOS hold a
  // stale app shell across deploys.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/'))
        )
    );
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
