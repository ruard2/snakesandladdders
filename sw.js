// Slow Dating — Service Worker
// Strategie: Network First → cache als fallback bij offline
// Zo blijft ontwikkelen normaal werken: elke refresh haalt verse code op.

const CACHE = 'slow-dating-v1';

// Bestanden die gecached worden voor offline gebruik
const PRECACHE = [
  '/world.html',
  '/comm.js',
  '/koppel.js',
  '/config.js',
  '/manifest.json',
  '/images/kaart1.webp',
  '/images/nabijheid_balk2.webp',
  '/images/figuur_t.webp',
  '/images/figuur2_t.webp',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Verwijder oude cache-versies
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Alleen GET-verzoeken cachen
  if (e.request.method !== 'GET') return;
  // API-calls en socket.io nooit cachen
  if (e.request.url.includes('/api/') || e.request.url.includes('socket.io')) return;

  e.respondWith(
    // Network first: probeer netwerk, val terug op cache
    fetch(e.request)
      .then(res => {
        // Sla verse versie op in cache
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
