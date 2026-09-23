'use strict';

const VERSION = 'scuse-v2.2';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=2.2',
  './app.js?v=2.2',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const OFFLINE_URLS = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }).catch(() => {
      const offlineUrl = OFFLINE_URLS.find((u) => req.url.includes(u));
      if (offlineUrl) return caches.match(offlineUrl);
      return caches.match('./index.html');
    })
  );
});