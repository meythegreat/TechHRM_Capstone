const CACHE = 'wospis-offline';
const seen = new Set<string>();
const stored = new Set<string>();

function remember(raw: string) {
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return;
    const path = url.pathname;
    if (path === '/sw.js') return;
    if (path === '/api' || path.startsWith('/api/') || path.startsWith('/sanctum')) return;
    seen.add(`${path}${url.search}`);
  } catch {
    // Ignore malformed resource URLs.
  }
}

let pending: Promise<void> | null = null;
let queued = false;

function isShellDocument(url: string) {
  return url === '/' || url === '/index.html' || url === `${window.location.pathname}${window.location.search}`;
}

async function storeSeen() {
  if (navigator.onLine === false) return;
  const cache = await caches.open(CACHE);
  const urls = [...seen].filter((url) => !stored.has(url));
  const queue = urls.slice();
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) return;
      try {
        if (!isShellDocument(url) && (await cache.match(url))) {
          stored.add(url);
          continue;
        }
        const response = await fetch(url, {
          cache: isShellDocument(url) ? 'reload' : 'default',
          credentials: 'same-origin',
        });
        if (!response.ok || response.status === 206) continue;
        await cache.put(url, response);
        stored.add(url);
      } catch {
        // The next online visit tries again.
      }
    }
  });
  await Promise.all(workers);
}

function scheduleStore() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (pending) {
    queued = true;
    return;
  }
  pending = storeSeen()
    .finally(() => {
      pending = null;
      if (!queued) return;
      queued = false;
      scheduleStore();
    });
}

/** Keep a device copy of the pages and files opened while online. */
export function startOfflineCacheWarming() {
  if (typeof window === 'undefined' || !('caches' in window)) return;

  try {
    performance.setResourceTimingBufferSize(800);
  } catch {
    // Older browsers ignore the buffer size.
  }

  for (const entry of performance.getEntriesByType('resource')) {
    remember(entry.name);
  }
  remember('/');
  remember('/index.html');
  remember('/manifest.webmanifest');
  remember(window.location.href);

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) remember(entry.name);
      scheduleStore();
    });
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    // Resource timing is enough when PerformanceObserver is unavailable.
  }

  window.addEventListener('load', () => {
    window.setTimeout(scheduleStore, 500);
  });
  window.addEventListener('online', scheduleStore);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') scheduleStore();
  });
  scheduleStore();
}
