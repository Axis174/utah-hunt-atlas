/* Offline-first service worker.
   Shell is cache-first (it changes rarely). Data is network-first with a cache
   fallback, so a fresh refresh wins when there's signal and the last good copy
   is there when you're in a canyon with none. */
const VERSION = 'hunt-atlas-v2';
const SHELL = [
  './', './index.html', './app.js', './styles.css',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './data/bird_access.json', './data/seasons.json', './data/config.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req).then(r => r || new Response(
        JSON.stringify({offline: true}), {headers: {'Content-Type': 'application/json'}})))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      const copy = r.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});
