import type { Plugin } from 'vite'

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/logo.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

function cacheKey(files: string[]) {
  let hash = 0
  const text = files.join('\n')
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

function phoneNotificationHandlers() {
  return `
self.addEventListener('push', (event) => {
  let payload = { title: 'TechHRM', message: 'You have a new notification.', url: '/' };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (error) {}
  event.waitUntil(self.registration.showNotification(payload.title || 'TechHRM', {
    body: payload.message || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
`
}

function devWorkerSource() {
  return `/* TechHRM dev worker: makes the site installable without caching Vite modules. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request));
});
${phoneNotificationHandlers()}
`
}

function productionWorkerSource(precache: string[]) {
  const cacheName = `techhrm-shell-${cacheKey(precache)}`
  return `/* TechHRM app shell. API calls stay on the network. */
const CACHE = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(precache)};
const SHELL = new Set(PRECACHE);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(url);
      } catch (error) {
        // One missing file must not block installation.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('techhrm-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    if (response && response.ok) return response;
  } catch (error) {
    // Offline or the host refused the connection.
  }
  const cached = (await caches.match(request)) || (fallback ? await caches.match(fallback) : undefined);
  if (cached) return cached;
  return new Response('TechHRM is offline. Reconnect and open it again.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/sanctum')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, '/index.html'));
    return;
  }

  if (SHELL.has(url.pathname)) {
    event.respondWith(networkFirst(event.request));
  }
});
${phoneNotificationHandlers()}
`
}

function isServiceWorker(url: string | undefined) {
  return url?.split('?')[0] === '/sw.js'
}

export function pwaPlugin(): Plugin {
  return {
    name: 'techhrm-pwa',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!isServiceWorker(req.url)) {
          next()
          return
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(devWorkerSource())
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (isServiceWorker(req.url)) {
          res.setHeader('Cache-Control', 'no-cache')
        }
        next()
      })
    },
    generateBundle(_options, bundle) {
      const precache = new Set(SHELL_FILES)
      for (const fileName of Object.keys(bundle)) {
        if (fileName.endsWith('.map') || fileName === 'sw.js') continue
        precache.add(`/${fileName}`)
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: productionWorkerSource([...precache]),
      })
    },
  }
}
