// ─── SWR Standort Dashboard — Service Worker ─────────────────────────────────
// App shell → cache-first | /api/* → network-first | CDN → network-only

const CACHE_NAME = 'swr-standorte-v3';

const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/standorte.js',
    '/manifest.json',
    '/res/icons/app-icon.svg',
    '/res/icons/app-icon-192.png',
    '/res/icons/app-icon-512.png',
    '/res/mdi/css/materialdesignicons.min.css',
    '/themes/carbon.css',
    '/themes/dracula.css',
    '/themes/dracula-laser.css',
    '/themes/kirschbluete.css',
    '/themes/swr-ms.css',
    '/js/sync.js',
    '/js/app.js',
    '/js/utils.js',
    '/js/favorites.js',
    '/js/filters.js',
    '/js/location.js',
    '/js/weather.js',
    '/js/map.js',
    '/js/list.js',
    '/js/dashboard.js',
    '/js/overlays.js',
    '/js/planner.js',
    '/js/tutorial.js',
    '/js/init.js',
];

// API routes that are cached with network-first strategy
const NETWORK_FIRST_API = [
    '/api/standorte',
    '/api/fahrtanweisungen',
    '/api/overlays',
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // ── Network-first for API data routes ────────────────────────────────────
    const isApiData = NETWORK_FIRST_API.some(path => url.pathname.startsWith(path));
    if (isApiData && url.origin === self.location.origin) {
        event.respondWith(networkFirstWithCache(request));
        return;
    }

    // ── Skip non-GET or cross-origin tile/widget requests ────────────────────
    // Weather APIs, OSRM, map tiles, Windy — let these fail naturally offline.
    const skipDomains = [
        'api.open-meteo.com', 'geocoding-api.open-meteo.com',
        'api.brightsky.dev',
        'router.project-osrm.org',
        'api.rainviewer.com', 'tilecache.rainviewer.com',
        'embed.windy.com',
        'maps.dwd.de',
        'map.blitzortung.org',
        'server.arcgisonline.com',
        'tile.opentopomap.org',
        'tile.openstreetmap.org',
    ];
    if (skipDomains.some(d => url.hostname.includes(d))) {
        return; // let browser handle these normally
    }

    // ── Network-first for app shell (same-origin HTML/CSS/JS/fonts) ────────────
    // Always fetch latest code so deployments show immediately on normal refresh (F5).
    // Falls back to cached versions if offline.
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirstWithCache(request));
        return;
    }

    // ── Stale-while-revalidate for CDN assets (Leaflet, Tailwind, MDI) ───────
    event.respondWith(staleWhileRevalidate(request));
});

// ─── STRATEGIES ──────────────────────────────────────────────────────────────

async function cacheFirstWithNetwork(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline — Seite nicht zwischengespeichert.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

async function networkFirstWithCache(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.headers.get('accept')?.includes('text/html')) {
            return new Response('<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;color:#fff;background:#09090b;padding:2rem;"><h2>Sie sind offline</h2><p>Leider ist diese Seite nicht im Cache gespeichert. Bitte prüfen Sie Ihre Verbindung.</p></body></html>', {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
        return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    }).catch(() => null);
    return cached || fetchPromise;
}

// ── Notification click: focus or open the app ────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});
