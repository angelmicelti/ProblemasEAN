const CACHE_NAME = 'ean01-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Instalación y almacenamiento en caché de archivos base
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Estrategia: Buscar en caché, si no está, ir a la red
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});