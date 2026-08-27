/**
 * Service Worker para Problemas de Electrónica Analógica (EAN)
 * Proporciona funcionalidad offline y cacheo de recursos
 * 
 * @author Departamento de Tecnología - IES Virgen de Villadiego
 * @version 1.0.0
 */

const CACHE_NAME = 'ean-cache-v1';
const STATIC_CACHE_NAME = 'ean-static-v1';
const DYNAMIC_CACHE_NAME = 'ean-dynamic-v1';

// Recursos estáticos que se cachearán en la instalación
const STATIC_ASSETS = [
    '/',
    '/problemasean/',
    '/problemasean/index.html',
    '/problemasean/manifest.json',
    '/problemasean/img/icon-72x72.png',
    '/problemasean/img/icon-96x96.png',
    '/problemasean/img/icon-128x128.png',
    '/problemasean/img/icon-144x144.png',
    '/problemasean/img/icon-152x152.png',
    '/problemasean/img/icon-192x192.png',
    '/problemasean/img/icon-384x384.png',
    '/problemasean/img/icon-512x512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Evento de instalación - cachear recursos estáticos
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando Service Worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Cacheando recursos estáticos');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Forzar activación inmediata
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Error durante la instalación:', error);
            })
    );
});

// Evento de activación - limpiar caches antiguas
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activado');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            // Eliminar versiones antiguas del cache
                            return cacheName !== STATIC_CACHE_NAME && 
                                   cacheName !== DYNAMIC_CACHE_NAME &&
                                   cacheName !== CACHE_NAME;
                        })
                        .map((cacheName) => {
                            console.log('[SW] Eliminando cache antigua:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                // Tomar control de todas las páginas inmediatamente
                return self.clients.claim();
            })
    );
});

// Evento fetch - estrategia de red con fallback a cache
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorar peticiones no GET
    if (request.method !== 'GET') {
        return;
    }

    // Ignorar peticiones a otros orígenes (excepto CDN permitidos)
    if (url.origin !== location.origin && 
        !url.hostname.includes('cdnjs.cloudflare.com')) {
        return;
    }

    // Estrategia: Cache First para recursos estáticos
    if (isStaticResource(url)) {
        event.respondWith(cacheFirstStrategy(request));
        return;
    }

    // Estrategia: Network First para páginas HTML
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }

    // Estrategia: Stale While Revalidate para otros recursos
    event.respondWith(staleWhileRevalidateStrategy(request));
});

/**
 * Determina si un recurso es estático (imágenes, fuentes, CSS, JS)
 */
function isStaticResource(url) {
    const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.css', '.js'];
    return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

/**
 * Estrategia Cache First
 * Busca primero en cache, si no existe va a la red
 */
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        
        // Cachear respuesta exitosa
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Error en cacheFirstStrategy:', error);
        
        // Retornar página offline si es una navegación
        if (request.mode === 'navigate') {
            return caches.match('/problemasean/index.html');
        }
        
        throw error;
    }
}

/**
 * Estrategia Network First
 * Intenta obtener de la red, si falla usa el cache
 */
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Actualizar cache con respuesta fresca
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[W] Red no disponible, usando cache:', request.url);
        
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Retornar página principal como fallback
        if (request.mode === 'navigate') {
            return caches.match('/problemasean/index.html');
        }
        
        throw error;
    }
}

/**
 * Estrategia Stale While Revalidate
 * Retorna del cache inmediatamente y actualiza en segundo plano
 */
async function staleWhileRevalidateStrategy(request) {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    // Fetch en segundo plano para actualizar cache
    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch((error) => {
            console.log('[SW] Error en background update:', error);
            return null;
        });
    
    // Retornar respuesta cacheada inmediatamente o esperar a la red
    return cachedResponse || fetchPromise;
}

// Escuchar mensajes desde la aplicación
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            }).then(() => {
                event.source.postMessage({ type: 'CACHE_CLEARED' });
            })
        );
    }
});

// Sincronización en segundo plano (para futuras funcionalidades)
self.addEventListener('sync', (event) => {
    console.log('[SW] Evento de sincronización:', event.tag);
    
    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
});

async function syncData() {
    // Placeholder para futura sincronización de datos
    console.log('[SW] Sincronizando datos...');
}

// Notificaciones push (para futuras funcionalidades)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        
        const options = {
            body: data.body || 'Nueva actividad disponible',
            icon: '/problemasean/img/icon-192x192.png',
            badge: '/problemasean/img/icon-72x72.png',
            vibrate: [100, 50, 100],
            data: {
                url: data.url || '/problemasean/'
            }
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'EAN Problemas', options)
        );
    }
});

// Manejar clic en notificaciones
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then((clientList) => {
                // Si ya hay una ventana abierta, enfocarla
                for (const client of clientList) {
                    if (client.url.includes('/problemasean/') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Si no, abrir una nueva ventana
                if (clients.openWindow) {
                    return clients.openWindow(event.notification.data.url);
                }
            })
    );
});

console.log('[SW] Service Worker cargado correctamente');
