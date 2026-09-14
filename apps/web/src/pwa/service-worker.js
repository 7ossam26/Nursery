/* global self, caches, fetch, Response, URL */
// Nursery application-shell service worker. `vite build` fills the precache list and version placeholders
// (see apps/web/vite.config.ts). Only the versioned shell listed at build time is ever stored:
// nothing under /api/ (authenticated data, SSE, private downloads) is intercepted or cached, and
// no response is written to a cache at runtime, so revoked sessions leave nothing behind.
const VERSION = '__VERSION__';
const CACHE = `nursery-shell-${VERSION}`;
// eslint-disable-next-line no-undef -- replaced by the build with the JSON precache list
const PRECACHE = __PRECACHE__;
const SHELL_DOCUMENT = '/index.html';

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page asks explicitly after the user chooses to update (message below).
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key.startsWith('nursery-shell-')) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// 'network': untouched browser request. 'asset': versioned shell file. 'shell': app navigation.
function classify(request) {
  if (request.method !== 'GET') return 'network';
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return 'network';
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return 'network';
  if (request.mode === 'navigate') return 'shell';
  return PRECACHE.includes(url.pathname) ? 'asset' : 'network';
}

self.addEventListener('fetch', (event) => {
  const kind = classify(event.request);
  if (kind === 'network') return;
  if (kind === 'asset') {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match(event.request.url)).then((hit) => hit || fetch(event.request)));
    return;
  }
  // Navigations go to the network first so a new deployment is picked up; offline opens the cached
  // shell document, whose scripts then show the connection state without any stored private data.
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(SHELL_DOCUMENT)) || Response.error();
  }));
});
