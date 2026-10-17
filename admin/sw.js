/* ============================================================
   RISE AXIS — MINIMAL SERVICE WORKER
   Only handles version detection + update prompts.
   Does NOT cache app files (avoiding stale-code issues).
   ============================================================ */

const VERSION = 'v1.0.0-' + Date.now();   // bumped each deploy if you want
const CACHE_NAME = 'rax-admin-' + VERSION;

// Install — activate immediately, don't wait for old SW to die
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate — clean up any old caches we or a previous SW might have left
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete all caches from this scope except our current one
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('rax-admin-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
      // Take over all clients immediately
      await self.clients.claim();
    })()
  );
});

// On message — respond to a page asking "is there a new version?"
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

// Fetch — pass everything straight through the network (no caching)
self.addEventListener('fetch', (event) => {
  // We're online-only. Do nothing — let the browser handle it.
  // (An empty handler means "network, always".)
});