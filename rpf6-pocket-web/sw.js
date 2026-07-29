const CACHE_PREFIX = 'rpf6-enhanced-';
const CACHE = `${CACHE_PREFIX}__CACHE_VERSION__`;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './modules/constants.js',
  './modules/format.js',
  './modules/hash.js',
  './modules/rpf6.js',
  './modules/diagnostics.js',
  './modules/profiles.js',
  './modules/project.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      const requestURL = new URL(event.request.url);
      if (response.ok && requestURL.origin === self.location.origin) {
        event.waitUntil(
          caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())),
        );
      }
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        return (await caches.match('./index.html')) || Response.error();
      }
      throw error;
    }
  })());
});
