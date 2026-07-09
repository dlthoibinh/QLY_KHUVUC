'use strict';

const CACHE_PREFIX = 'qlkv-pwa-';
const CACHE_NAME = CACHE_PREFIX + 'v12';
const LEGACY_PREFIXES = ['crew-pwa-', 'qlkv-shell-'];

const BASE_URL = new URL('./', self.location.href);
const STATIC_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './evn_logo.png',
  './icon-192-any.png',
  './icon-512-any.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
].map(path => new URL(path, BASE_URL).toString());

async function precacheSafely() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.allSettled(
    STATIC_FILES.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) {
          await cache.put(url, response.clone());
        }
      } catch (error) {
        console.warn('[SW] Không cache được:', url, error);
      }
    })
  );
}

self.addEventListener('install', event => {
  event.waitUntil(precacheSafely());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys.map(key => {
        const isOurOldCache =
          (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) ||
          LEGACY_PREFIXES.some(prefix => key.startsWith(prefix));

        return isOurOldCache ? caches.delete(key) : Promise.resolve(false);
      })
    );

    await self.clients.claim();
  })());
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const fresh = await fetch(request, { cache: 'no-store' });

    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone());
      return fresh;
    }

    throw new Error('HTTP ' + (fresh ? fresh.status : 'NO_RESPONSE'));
  } catch (error) {
    return (
      await cache.match(request) ||
      await cache.match(new URL('./index.html', BASE_URL).toString()) ||
      await cache.match(new URL('./', BASE_URL).toString()) ||
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreVary: true });

  const networkPromise = fetch(request)
    .then(async response => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Chỉ quản lý tài nguyên GitHub Pages cùng origin.
  // Không chặn và không cache Google Apps Script trong iframe.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE_URL.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // sw.js luôn lấy mới để tránh mắc kẹt ở phiên bản cũ.
  if (url.pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
