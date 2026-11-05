// Service worker: caches the whole app shell, the built-in example cycle and the fonts,
// so the app opens offline. Your cycle and history live in IndexedDB on the phone and are
// never fetched or sent. Bump VERSION whenever app code changes (and APP_VERSION in js/app.js)
// so installed copies pick up the new files.
const VERSION = 'dash-shell-v9';
const SHELL = [
  './', 'index.html', 'manifest.json', 'css/app.css', 'data/cycle.example.json',
  'fonts/hanken-grotesk-latin-wght-normal.woff2',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/data.js', 'js/model.js', 'js/ui.js', 'js/charts.js', 'js/cook.js', 'js/rest.js', 'js/backup.js',
  'js/views/common.js', 'js/views/today.js', 'js/views/train.js', 'js/views/fuel.js', 'js/views/insights.js', 'js/views/log.js', 'js/views/settings.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // the app makes no cross-origin requests
  e.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === 'navigate') {
    const index = await cache.match('index.html');
    if (index) return index;
  }
  const res = await fetch(req);
  if (res.ok && new URL(req.url).pathname.indexOf('/data/cycle.json') === -1) cache.put(req, res.clone());
  return res;
}
