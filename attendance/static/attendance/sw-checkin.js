var CACHE_NAME = 'pwa-checkin-v1';
var PRECACHE = [
    '/attendance/pwa-checkin/',
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(PRECACHE);
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(n) { return n !== CACHE_NAME; })
                    .map(function(n) { return caches.delete(n); })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // API calls: network first, no cache fallback (offline handled by IndexedDB in page)
    if (url.pathname.indexOf('/api/') !== -1) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Static assets: cache first
    if (url.pathname.indexOf('/static/') !== -1) {
        event.respondWith(
            caches.match(event.request).then(function(cached) {
                return cached || fetch(event.request).then(function(resp) {
                    var clone = resp.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                    return resp;
                });
            })
        );
        return;
    }

    // HTML pages: network first, fall back to cache
    event.respondWith(
        fetch(event.request).then(function(resp) {
            var clone = resp.clone();
            caches.open(CACHE_NAME).then(function(cache) {
                cache.put(event.request, clone);
            });
            return resp;
        }).catch(function() {
            return caches.match(event.request);
        })
    );
});
