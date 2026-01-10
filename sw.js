const CACHE_NAME = 'argentores-v11';
// Cachear todos los recursos necesarios para funcionar offline
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker (offline first)...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching essential files for offline use...');
        // Cachear todos los recursos esenciales
        return cache.addAll(urlsToCache).catch((err) => {
          console.error('[SW] Cache addAll failed:', err);
          // Intentar cachear uno por uno si falla addAll
          return Promise.allSettled(
            urlsToCache.map(url => 
              cache.add(url).catch(e => {
                console.warn(`[SW] Failed to cache ${url}:`, e);
              })
            )
          );
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
  const isSameOrigin = url.origin === location.origin;
  
  // ESTRATEGIA OFFLINE FIRST: Cache First para todos los recursos locales
  // Esto permite que la app funcione completamente sin internet
  
  // Para recursos del mismo origen (index.html, iconos, manifest, etc)
  if (isSameOrigin) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          // Si está en cache, devolverlo inmediatamente (offline first)
          if (cachedResponse) {
            // En segundo plano, intentar actualizar el cache si hay conexión
            fetch(event.request)
              .then((networkResponse) => {
                if (networkResponse.status === 200) {
                  const responseToCache = networkResponse.clone();
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                  });
                }
              })
              .catch(() => {
                // Sin conexión, no hacer nada, ya tenemos la versión cacheada
              });
            return cachedResponse;
          }
          
          // Si no está en cache, intentar obtenerlo de la red
          return fetch(event.request)
            .then((networkResponse) => {
              // Solo cachear respuestas exitosas
              if (networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, responseToCache);
                });
              }
              return networkResponse;
            })
            .catch(() => {
              // Si falla la red y no hay cache, devolver una respuesta básica
              if (pathname.includes('index.html') || pathname === '/' || pathname.endsWith('/') || pathname === '') {
                return caches.match('./index.html');
              }
              return new Response('Offline', { 
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
              });
            });
        })
    );
  }
  // Para recursos externos (CDNs como React, Tailwind, etc)
  else {
    // Cache First también para recursos externos (si ya están cacheados)
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Intentar actualizar en segundo plano
            fetch(event.request)
              .then((networkResponse) => {
                if (networkResponse.status === 200) {
                  const responseToCache = networkResponse.clone();
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                  });
                }
              })
              .catch(() => {
                // Sin conexión, usar cache
              });
            return cachedResponse;
          }
          
          // Si no está cacheado, intentar obtenerlo de la red
          return fetch(event.request)
            .then((networkResponse) => {
              // Cachear recursos externos exitosos para uso offline
              if (networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, responseToCache);
                });
              }
              return networkResponse;
            })
            .catch(() => {
              // Si falla y no hay cache, devolver error
              return new Response('Resource unavailable offline', { 
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
              });
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
