// --- Service Worker Logic ---
const APP_CACHE_NAME = 'SUITEWASTE_CACHE_v1';
const OFFLINE_URL = '/offline.html';

// The essential files that constitute the "app shell"
const CORE_ASSETS = [
    '/',
    '/index.html',
    OFFLINE_URL,
    '/manifest.json',
    '/pwa-register.js',
    // We intentionally omit external CDNs (React, Babel, Tailwind) from
    // pre-caching, as they are large and usually cached by the browser already.
];

// 1. INSTALLATION: Pre-cache core app shell assets
self.addEventListener('install', (event) => {
    console.log('[SW] Install Event: Caching core assets...');
    event.waitUntil(
        caches.open(APP_CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting()) // Activates the new SW immediately
            .catch(error => console.error('[SW] Pre-caching failed:', error))
    );
});

// 2. ACTIVATION: Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activate Event: Cleaning old caches...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== APP_CACHE_NAME) {
                        console.log(`[SW] Deleting old cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});


// 3. FETCH HANDLING: Hybrid caching strategies
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);
    const destination = event.request.destination;

    // A. Navigation Requests (HTML) -> Network First with Offline Fallback
    if (destination === 'document' || requestUrl.pathname.endsWith('/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache the new response (optional: useful for dynamic content)
                    const responseClone = response.clone();
                    caches.open(APP_CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                    return response;
                })
                .catch(() => {
                    // Fallback to offline page if network fails
                    return caches.match(OFFLINE_URL);
                })
        );
        return;
    }

    // B. Static Assets (CSS, JS, Images, Fonts) -> Stale-While-Revalidate
    if (destination === 'style' || destination === 'script' || destination === 'image' || destination === 'font') {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    // Put a copy of the network response in the cache
                    caches.open(APP_CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                }).catch(error => {
                    // This catch handles network errors during the refresh fetch, 
                    // but the initial match is still served.
                    console.warn(`[SW] Fetch failed for: ${requestUrl.pathname}`, error);
                    // If both cache and network fail, just return the cached response (or undefined)
                    return cachedResponse; 
                });
                
                // Return cached response immediately, or fetch if no cache hit
                return cachedResponse || fetchPromise; 
            })
        );
        return;
    }

    // C. API/Data Requests (General Fetch) -> Network First
    // For general APIs, we prioritize fresh data and let them fail if offline.
    // If you need cache fallback for specific APIs, adjust this logic.
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
