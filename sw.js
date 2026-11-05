const CACHE_NAME = 'ghoustory-control-room-v76';
const APP_SHELL = [ './manifest.webmanifest', './image_2.png', './ghoustory-logo.png', './ghoust-ai-avatar.svg', './apple-touch-icon 2.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('ghoustory-control-room-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')))
    );
    return;
  }

  if (['image_2.png', 'ghoustory-logo.png', 'ghoust-ai-avatar.svg', 'apple-touch-icon 2.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'].some((name) => pathname.endsWith('/' + name))) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
  }
});


self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  const title = payload.title || 'Ghoustory Control Room';
  event.waitUntil((async () => {
    let style = 'vibrate';
    try { const cache = await caches.open(CACHE_NAME); const pref = await cache.match('./notification-preferences.json'); if (pref) style = (await pref.json()).style || 'vibrate'; } catch (_) {}
    const options = { body: payload.body || 'Kamu menerima pesan baru.', icon: './icon-192.png', badge: './apple-touch-icon%202.png', tag: payload.tag || 'ghoustory-message', renotify: true, ...(style === 'vibrate' ? { vibrate: [180, 90, 180] } : {}), data: { url: payload.url || './' } };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
