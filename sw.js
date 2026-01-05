const CACHE_NAME = 'argentores-v5';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache).catch((err) => {
          console.log('Cache addAll failed:', err);
          // Continuar aunque falle el caché
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Para index.html, siempre buscar primero en la red para obtener la versión más reciente
  if (event.request.url.includes('index.html') || event.request.url === self.location.origin + '/') {
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
