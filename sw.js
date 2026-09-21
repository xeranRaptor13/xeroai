/* ============ XeroAI Service Worker ============
   Intentionally does NOT cache anything.
   Its only job right now is to satisfy "installable PWA"
   requirements (a controlling service worker + a manifest).
   Trading data, balances, and dashboard state must always
   come from the network — never served from a cache. */

const SW_VERSION = 'xeroai-sw-v1';

self.addEventListener('install', (event) => {
  // Activate this worker as soon as it's finished installing.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any open clients immediately.
  event.waitUntil(self.clients.claim());
});

// Pass every request straight through to the network.
// No caches.match(), no caches.put() — no offline support by design.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
