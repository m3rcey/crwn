const CACHE_NAME = 'crwn-v1';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/signup',
  '/home',
  '/explore',
  '/library',
  '/profile',
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
          (fetchResponse.headers.get('content-type')?.includes('text/html') ||
           fetchResponse.url.match(/\.(js|css|png|jpg|jpeg|svg|woff|woff2)$/i))
        ) {
          const responseToCache = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return fetchResponse;
      });
    }).catch(() => {
      // Return offline fallback for navigation requests
      if (event.request.mode === 'navigate') {
        return caches.match('/');
      }
      throw new Error('Network request failed');
    })
  );
});
