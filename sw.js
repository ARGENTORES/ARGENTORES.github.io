const CACHE_NAME = 'argentores-v13';
// Cachear todos los recursos necesarios para funcionar offline
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './icon-192.png',
  './icon-512.png',
  // Recursos externos críticos (se cachearán si están disponibles)
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Russo+One&display=swap'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker (offline first)...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching essential files for offline use...');
        // Cachear recursos locales primero (siempre deben funcionar)
        const localUrls = urlsToCache.filter(url => url.startsWith('./'));
        return cache.addAll(localUrls)
          .then(() => {
            console.log('[SW] Local files cached, now caching external resources...');
            // Cachear recursos externos uno por uno (pueden fallar si no hay conexión)
            const externalUrls = urlsToCache.filter(url => !url.startsWith('./'));
            return Promise.allSettled(
              externalUrls.map(url => 
                fetch(url)
                  .then(response => {
                    if (response.ok) {
                      return cache.put(url, response);
                    }
                  })
                  .catch(e => {
                    console.warn(`[SW] Failed to cache ${url}:`, e);
                    // No es crítico, se intentará cachear cuando se use
                  })
              )
            );
          })
          .catch((err) => {
            console.error('[SW] Cache failed:', err);
            // Continuar aunque falle
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
    // Estrategia especial para manifest.json e index.html: Network First para asegurar actualizaciones
    if (pathname.includes('manifest.json') || pathname.includes('index.html') || pathname === '/' || pathname.endsWith('/') || pathname === '') {
      event.respondWith(
        fetch(event.request, { cache: 'no-cache' })
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Si falla la red, usar cache como fallback
            return caches.match(event.request).then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Para index.html, intentar obtener cualquier versión cacheada
              if (pathname.includes('index.html') || pathname === '/' || pathname.endsWith('/') || pathname === '') {
                return caches.match('./index.html');
              }
              return new Response('Resource unavailable offline', { 
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
              });
            });
          })
      );
      return;
    }
    
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          // Si está en cache, devolverlo inmediatamente (offline first)
          if (cachedResponse) {
            // En segundo plano, intentar actualizar el cache si hay conexión
            // NO bloquear la respuesta, usar cache inmediatamente
            event.waitUntil(
              fetch(event.request)
                .then((networkResponse) => {
                  if (networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    return caches.open(CACHE_NAME).then((cache) => {
                      return cache.put(event.request, responseToCache);
                    });
                  }
                })
                .catch(() => {
                  // Sin conexión, no hacer nada, ya tenemos la versión cacheada
                })
            );
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
            // Intentar actualizar en segundo plano (no bloquear)
            event.waitUntil(
              fetch(event.request)
                .then((networkResponse) => {
                  if (networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    return caches.open(CACHE_NAME).then((cache) => {
                      return cache.put(event.request, responseToCache);
                    });
                  }
                })
                .catch(() => {
                  // Sin conexión, usar cache
                })
            );
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
