'use strict';

const CACHE_PREFIX = 'qlkv-pwa-';
const CACHE_NAME = CACHE_PREFIX + 'v13';
const OLD_PREFIXES = ['crew-pwa-', 'qlkv-shell-', 'qlkv-pwa-v10', 'qlkv-pwa-v11', 'qlkv-pwa-v12'];

const BASE_URL = new URL('./', self.location.href);
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './evn_logo.png',
  './icon-192-any.png',
  './icon-512-any.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
].map(path => new URL(path, BASE_URL).toString());

async function cacheOne(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response && response.ok) await cache.put(url, response.clone());
  } catch (error) {
    console.warn('[SW] Bỏ qua file chưa cache được:', url, error);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(url => cacheOne(cache, url)));
  })());

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(keys.map(key => {
      const remove =
        (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) ||
        OLD_PREFIXES.some(prefix => key.startsWith(prefix));

      return remove ? caches.delete(key) : Promise.resolve(false);
    }));

    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: 'no-store' });

    if (response && response.ok) {
      await cache.put(request, response.clone());
      return response;
    }

    throw new Error('HTTP_' + (response ? response.status : 'NO_RESPONSE'));
  } catch (_) {
    return (
      await cache.match(request, { ignoreSearch: true }) ||
      await cache.match(new URL('./index.html', BASE_URL).toString(), { ignoreSearch: true }) ||
      await cache.match(new URL('./', BASE_URL).toString(), { ignoreSearch: true }) ||
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreVary: true, ignoreSearch: true });

  const network = fetch(request)
    .then(async response => {
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Không can thiệp tài nguyên Google Apps Script trong iframe.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE_URL.pathname)) return;

  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/manifest.webmanifest') ||
    url.pathname.endsWith('/sw.js')
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
