// Service worker: caches the app shell (including the built-in example cycle)
// so the app opens offline. Your own cycle is stored on the phone, not fetched.
// Bump VERSION whenever app code changes so phones pick up the new files.
const VERSION = 'dash-shell-v2';
const FONT_CACHE = 'dash-fonts';
const SHELL = [
  './', 'index.html', 'manifest.json', 'css/app.css', 'data/cycle.example.json',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/data.js', 'js/model.js', 'js/ui.js', 'js/cook.js',
  'js/views/common.js', 'js/views/today.js', 'js/views/week.js', 'js/views/training.js', 'js/views/pantry.js',
  'js/views/log.js', 'js/views/settings.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }
  if (url.origin === location.origin) e.respondWith(shellCacheFirst(req));
});

async function shellCacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === 'navigate') {
    const index = await cache.match('index.html');
    if (index) return index;
  }
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) return hit;
  const res = await net;
  return res || new Response('', { status: 504 });
}
