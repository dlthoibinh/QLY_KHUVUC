'use strict';

/*
 * Service Worker tự dọn và tự hủy.
 * QLKV v14 chuyển thẳng tới Google Apps Script, không dùng iframe.
 */

const OLD_CACHE_PREFIXES = [
  'crew-pwa-',
  'qlkv-pwa-',
  'qlkv-shell-'
];

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      try {
        const cacheNames = await caches.keys();

        await Promise.all(
          cacheNames
            .filter(function (cacheName) {
              return OLD_CACHE_PREFIXES.some(function (prefix) {
                return cacheName.startsWith(prefix);
              });
            })
            .map(function (cacheName) {
              return caches.delete(cacheName);
            })
        );

        await self.registration.unregister();

        const clientList = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

        clientList.forEach(function (client) {
          client.navigate(client.url);
        });
      } catch (error) {
        console.error('Không thể dọn Service Worker cũ:', error);
      }
    })()
  );
});

/*
 * Không chặn request.
 * Không dùng event.respondWith().
 */
self.addEventListener('fetch', function () {});
