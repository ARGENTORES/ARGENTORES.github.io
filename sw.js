const CACHE_NAME = 'argentores-v8';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching files...');
        return cache.addAll(urlsToCache).catch((err) => {
          console.error('[SW] Cache addAll failed:', err);
          // Continuar aunque falle el caché
        });
      })
      .then(() => {
        console.log('[SW] Service worker installed, skipping waiting');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('[SW] Cleaning old caches...');
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service worker activated, claiming clients');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Para index.html, siempre buscar primero en la red para obtener la versión más reciente
  const url = new URL(event.request.url);
  const pathname = url.pathname;
  if (pathname.includes('index.html') || pathname === '/' || pathname.endsWith('/') || pathname === '') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Actualizar el caché con la nueva versión
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Si falla la red, usar el caché como fallback
          return caches.match(event.request);
        })
    );
  } else {
    // Para otros recursos, usar caché primero
    event.respondWith(
      caches.match(event.request)
        .then((response) => response || fetch(event.request))
    );
  }
});
