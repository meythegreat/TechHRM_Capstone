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
  let payload = { title: 'WoSPIS', message: 'You have a new notification.', url: '/' };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (error) {}
  event.waitUntil(self.registration.showNotification(payload.title || 'WoSPIS', {
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

function offlineShellHelpers() {
  return `
const RUNTIME = 'wospis-offline';

function offlineDocument() {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WoSPIS</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;padding:24px"><div><p style="margin:0;font-size:12px;letter-spacing:.18em;font-weight:800;color:#93c5fd">WOSPIS</p><p style="margin:12px 0 0;font-size:18px;font-weight:700">This device does not have a saved copy yet.</p><p style="margin:8px 0 0;max-width:28rem;font-size:14px;line-height:1.5;color:#94a3b8">Connect once, open WoSPIS, and wait until the screen finishes loading. After that, the app can open again without Wi-Fi.</p></div></body></html>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function readCached(request, fallback) {
  const runtime = await caches.open(RUNTIME);
  const hit = (await runtime.match(request)) || (await caches.match(request));
  if (hit) return hit;
  if (!fallback) return undefined;
  return (await runtime.match(fallback)) || (await caches.match(fallback)) || undefined;
}
`
}

export function devWorkerSource() {
  return `/* WoSPIS dev worker.
   Online requests are left to the browser: respondWith(fetch()) fails the
   phone's development certificate and replaces the app with "Load failed".
   Offline, serve the copy the page stored in Cache Storage. */
${offlineShellHelpers()}
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/sanctum')) return;
  if (self.navigator.onLine !== false) return;

  event.respondWith((async () => {
    const cached = await readCached(event.request, event.request.mode === 'navigate' ? '/' : '');
    if (cached) return cached;
    if (event.request.mode === 'navigate') {
      const shell = await readCached('/index.html', '/') || await readCached('/', '');
      if (shell) return shell;
      return offlineDocument();
    }
    return new Response('', { status: 504, headers: { 'Content-Type': 'text/plain' } });
  })());
});
${phoneNotificationHandlers()}
`
}

export function productionWorkerSource(precache: string[]) {
  const cacheName = `wospis-shell-${cacheKey(precache)}`
  return `/* WoSPIS app shell. API calls stay on the network. */
const CACHE = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(precache)};
const NETWORK_TIMEOUT_MS = 4000;
${offlineShellHelpers()}

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
    await Promise.all(keys.filter((key) => key.startsWith('wospis-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function storeShell(request, response) {
  if (!response || !response.ok || response.type !== 'basic' || response.status === 206) return;
  const cache = await caches.open(CACHE);
  await cache.put(new Request(request.url), response.clone());
}

async function fromNetwork(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(request, { cache: 'no-store', signal: controller.signal });
    await storeShell(request, response);
    if (response && response.ok) return response;
  } catch (error) {
    // Offline, a hung radio, or the host refused the connection.
  } finally {
    clearTimeout(timer);
  }
  return undefined;
}

async function networkFirst(request, fallback) {
  const stored = await readCached(request, fallback || '');
  if (self.navigator.onLine === false && stored) return stored;

  const fresh = await fromNetwork(request);
  if (fresh) return fresh;
  if (stored) return stored;
  if (request.mode === 'navigate') {
    const shell = await readCached('/index.html', '/') || await readCached('/', '');
    if (shell) return shell;
    return offlineDocument();
  }
  return new Response('', { status: 504, headers: { 'Content-Type': 'text/plain' } });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/sanctum')) return;

  event.respondWith(networkFirst(event.request, event.request.mode === 'navigate' ? '/index.html' : ''));
});
${phoneNotificationHandlers()}
`
}

function isServiceWorker(url: string | undefined) {
  return url?.split('?')[0] === '/sw.js'
}

export function pwaPlugin(): Plugin {
  return {
    name: 'wospis-pwa',
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
