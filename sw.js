'use strict';

/* ============================================================
   Service Worker: офлайн-кэш сайта.
   Страницы отдаём по принципу «сначала сеть» — так обновления
   кода подхватываются сразу. Статику — из кэша с фоновым
   обновлением.
   ============================================================ */

const CACHE = 'loviritm-v75';
const ASSETS = [
  '/',
  '/records.html',
  '/manifest.json',
  '/scores.json',
  '/static/css/app.css',
  '/static/js/online.js',
  '/static/js/site.js',
  '/static/js/feedback.js',
  '/static/js/voice-gate.js',
  '/static/js/mic.js',
  '/static/js/test.js',
  '/static/img/favicon.svg',
  '/static/img/favicon-32.png',
  '/static/img/apple-touch-icon.png',
  '/static/img/icon-192.png',
  '/static/img/icon-512.png',
  '/static/img/note.svg',
  '/static/img/staff.svg',
  '/static/img/bg-geometry.svg',
  '/static/fonts/montserrat-cyrillic.woff2',
  '/static/fonts/montserrat-latin.woff2',
  '/static/img/mode-tap.jpg',
  '/static/img/mode-voice.jpg',
  '/static/img/panel-geometry.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Кладём по одному: если один файл временно недоступен,
    // остальные всё равно попадут в офлайн-кэш.
    await Promise.all(
      ASSETS.map((url) => cache.add(url).catch(() => undefined))
    );
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // API-запросы не кэшируем: сайт сам решает, к серверу или в localStorage.
  if (req.url.includes('/api/')) return;

  // Страницы: сеть → кэш.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Статика: кэш → сеть, с обновлением копии в фоне.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
