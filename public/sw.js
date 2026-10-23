const CACHE = 'focus-dev';
const FILES = ['/', '/index.html', '/app.html', '/core.js', '/app.js', '/cloud.js', '/install.js', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/favicon.ico', '/manifest.webmanifest'];
const key = u => (u.pathname === '/' ? '/index.html' : u.pathname);
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const old = (await caches.keys()).filter(k => k.startsWith('focus-') && k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    if (old.length) (await self.clients.matchAll()).forEach(c => c.postMessage({ type: 'updated' }));
  })());
});
// Cache first for instant opens, refreshed in the background. Offline always falls back to the app.
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  const k = key(u), nav = r.mode === 'navigate';
  if (!FILES.includes(k) && !nav) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE), hit = await c.match(k);
    const net = fetch(r).then(res => { if (res.ok && FILES.includes(k)) c.put(k, res.clone()); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    try { return await net; } catch { return (nav && await c.match('/app.html')) || Response.error(); }
  })());
});
