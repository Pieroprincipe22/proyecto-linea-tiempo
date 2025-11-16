/* Service Worker */

// 1. Definimos un nombre para nuestra "mochila" (caché) y los archivos que guardaremos.
const CACHE_NAME = 'nuestra-historia-cache-v1';
const urlsToCache = [
    '/',                  // La página de login
    '/app',               // La página de la app
    '/style.css',         // Nuestros estilos
    '/app.js',            // Nuestra lógica
    '/manifest.json',     // El manifiesto
    '/icon-192.png',      // El icono
    '/icon-512.png'       // El icono grande
];

// 2. Evento 'install': Se dispara cuando el navegador instala el SW.
//    Aquí es donde guardamos todo en la caché (la "mochila").
self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Abriendo caché y guardando archivos');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        self.skipWaiting(); // Fuerza al SW a activarse
      })
      .catch((err) => {
        console.error('Service Worker: Falló el cacheo de archivos', err);
      })
  );
});

// 3. Evento 'activate': Se dispara cuando el SW se activa.
//    Aquí limpiamos cachés antiguas si las hubiera.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Limpiando caché antigua', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 4. Evento 'fetch': ¡El más importante!
//    Se dispara CADA VEZ que la página pide un recurso (CSS, JS, una imagen, etc.)
self.addEventListener('fetch', (event) => {
  // Ignoramos todas las peticiones a la API (POST, PUT, etc.) y a /logout
  // Solo queremos manejar las peticiones GET de nuestros archivos.
  if (event.request.method !== 'GET' || 
      event.request.url.includes('/api/') || 
      event.request.url.includes('/logout')) {
    return;
  }
  
  // Estrategia "Cache first" (primero caché) para los archivos de la app.
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Si lo encontramos en la caché, lo devolvemos desde allí
        if (response) {
          // console.log('Service Worker: Sirviendo desde caché', event.request.url);
          return response;
        }
        
        // Si no está en caché, vamos a Internet a buscarlo
        // console.log('Service Worker: Sirviendo desde red', event.request.url);
        return fetch(event.request);
      })
  );
});