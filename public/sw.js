const CACHE_NAME = 'crwn-v487';
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

  // Skip audio files, and every API response.
  //
  // Test the PATHNAME, not the whole url. The audio bucket is private now, so
  // audio arrives as a signed url ending in `?token=...` -- against the full url
  // a `\.mp3$` test never matches, which would quietly route all media through
  // this worker instead of leaving it to the browser, and SW-mediated range
  // requests are exactly where iOS Safari breaks seeking.
  //
  // /api/ is skipped outright: those responses are short-lived signed urls marked
  // no-store, and nothing good comes of a service worker holding a credential.
  const url = new URL(event.request.url);
  if (url.pathname.match(/\.(mp3|wav|flac|m4a|ogg|webm)$/i)) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests - network ONLY, and the response is NEVER written to the
  // cache.
  //
  // These are rendered PAGES, and a signed-in page carries that person's data:
  // their admin screens, their fan list, their earnings. The cache was only ever
  // invalidated by a deploy (the activate handler drops every cache whose name is
  // not the current CACHE_NAME), and signing out does not touch it. On a shared
  // device that meant the next person could be handed the previous person's
  // rendered page straight out of the Cache Storage API, with no session and no
  // network request involved.
  //
  // The cost of this is the offline navigation fallback, which was thin anyway:
  // audio is skipped, /api/ is skipped, and JS/CSS are network-only, so an
  // "offline" page was already a shell that could not load its own data. Freshness
  // across deploys is unaffected, because that came from network-first, not from
  // the cache write.
  //
  // Bumping CACHE_NAME above is what purges the authenticated pages earlier
  // versions of this worker already stored on people's devices.
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
