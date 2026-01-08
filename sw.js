const CACHE_NAME = 'argentores-v10';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './icon-192.png',
  './icon-512.png'
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
  const url = new URL(event.request.url);
  const pathname = url.pathname;
  
  // Para index.html y la raíz, usar estrategia Network First con fallback a cache
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
  } 
  // Para recursos estáticos (iconos, manifest, etc), usar Cache First
  else if (pathname.includes('.png') || pathname.includes('.jpg') || pathname.includes('.svg') || 
           pathname.includes('manifest.json') || pathname.includes('sw.js')) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            return response;
          }
          return fetch(event.request).then((response) => {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            return response;
          });
        })
    );
  }
  // Para recursos externos (CDNs), intentar cachear pero permitir fallback
  else {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            return response;
          }
          return fetch(event.request)
            .then((response) => {
              // Solo cachear respuestas exitosas y del mismo origen o CORS válidas
              if (response.status === 200 && response.type === 'basic') {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, responseToCache);
                });
              }
              return response;
            })
            .catch(() => {
              // Si es un recurso externo y falla, devolver una respuesta vacía o error
              return new Response('Offline', { status: 503 });
            });
        })
    );
  }
});

// Escuchar mensajes para actualización
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
