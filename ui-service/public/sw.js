// UML Images Service - Service Worker
// Provides offline capabilities, caching, and performance optimizations

const CACHE_NAME = 'uml-service-v2.0.0';
const STATIC_CACHE = 'uml-static-v2.0.0';
const RUNTIME_CACHE = 'uml-runtime-v2.0.0';

// Resources to cache on install
const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static resources');
        return cache.addAll(STATIC_RESOURCES);
      })
      .then(() => {
        console.log('[SW] Static resources cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static resources:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip external requests (except fonts)
  if (!url.origin.includes(self.location.origin) && !url.hostname.includes('fonts.googleapis.com') && !url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // Handle different types of requests
  if (isStaticResource(request)) {
    event.respondWith(cacheFirst(request));
  } else if (isAPIRequest(request)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Cache strategies
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first failed:', error);
    return getOfflineFallback(request);
  }
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', error);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    return getOfflineFallback(request);
  }
}

async function staleWhileRevalidate(request) {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const cachedResponse = await cache.match(request);

    const fetchPromise = fetch(request).then((networkResponse) => {
      if (networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    });

    return cachedResponse || fetchPromise;
  } catch (error) {
    console.error('[SW] Stale while revalidate failed:', error);
    return getOfflineFallback(request);
  }
}

// Helper functions
function isStaticResource(request) {
  const url = new URL(request.url);
  return (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.json') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

function isAPIRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/config');
}

async function getOfflineFallback(request) {
  const url = new URL(request.url);

  // Return offline page for navigation requests
  if (request.destination === 'document') {
    const cache = await caches.open(STATIC_CACHE);
    return cache.match('/');
  }

  // Return placeholder for images
  if (request.destination === 'image') {
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#f3f4f6"/>
        <text x="200" y="150" text-anchor="middle" font-size="16" fill="#6b7280">
          📱 Offline Mode
        </text>
        <text x="200" y="170" text-anchor="middle" font-size="12" fill="#9ca3af">
          Image unavailable offline
        </text>
      </svg>`,
      {
        headers: {
          'Content-Type': 'image/svg+xml'
        }
      }
    );
  }

  // Return generic offline response
  return new Response(
    JSON.stringify({
      error: 'Offline',
      message: 'This feature requires an internet connection'
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

// Background sync for failed diagram generations
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-diagram-sync') {
    event.waitUntil(syncDiagrams());
  }
});

async function syncDiagrams() {
  try {
    // Get failed diagram requests from IndexedDB
    const failedRequests = await getFailedRequests();

    for (const request of failedRequests) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body
        });

        if (response.ok) {
          // Remove from failed requests
          await removeFailedRequest(request.id);

          // Notify client of successful sync
          await notifyClient('diagram-synced', {
            id: request.id,
            success: true
          });
        }
      } catch (error) {
        console.error('[SW] Failed to sync diagram:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body || 'UML diagram is ready!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'uml-notification',
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'View Diagram'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'UML Service', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handler for client communication
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
  case 'SKIP_WAITING':
    self.skipWaiting();
    break;

  case 'GET_VERSION':
    event.ports[0].postMessage({
      type: 'VERSION',
      version: CACHE_NAME
    });
    break;

  case 'CACHE_DIAGRAM':
    cacheDiagram(payload);
    break;

  default:
    console.log('[SW] Unknown message type:', type);
  }
});

// Helper functions for client communication
async function notifyClient(type, payload) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type, payload });
  });
}

// IndexedDB helpers (simplified)
async function getFailedRequests() {
  // Implementation would use IndexedDB
  return [];
}

async function removeFailedRequest(id) {
  // Implementation would use IndexedDB
}

async function cacheDiagram(payload) {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const response = new Response(payload.blob, {
      headers: {
        'Content-Type': 'image/png'
      }
    });

    await cache.put(`/diagram/${payload.id}`, response);
    console.log('[SW] Diagram cached successfully');
  } catch (error) {
    console.error('[SW] Failed to cache diagram:', error);
  }
}

console.log('[SW] Service worker loaded successfully');