const CACHE_VERSION = 'webdocsach-shell-v3';
const BASE_URL = new URL('./', self.location.href);

const SHELL_FILES = [
  './',
  './index.html',
  './book.html',
  './reader.html',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/css/theme.css',
  './assets/css/home.css',
  './assets/css/book.css',
  './assets/css/reader.css',
  './assets/js/theme.js',
  './assets/js/data-source.js',
  './assets/js/script.js',
  './assets/js/book.js',
  './assets/js/home-effects.js',
  './assets/js/home-app.js',
  './assets/images/Logo.png',
  './assets/images/app-icon-192.png',
  './assets/images/app-icon-512.png'
];

function toAbsoluteUrl(path) {
  return new URL(path, BASE_URL).href;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(
      SHELL_FILES.map(path => cache.add(new Request(toAbsoluteUrl(path), {
        cache: 'reload'
      })))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith('webdocsach-shell-') && name !== CACHE_VERSION)
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (
      await cache.match(request, { ignoreSearch: true }) ||
      await cache.match(toAbsoluteUrl('./index.html'), { ignoreSearch: true }) ||
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });

  const networkRequest = fetch(request)
    .then(async response => {
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || await networkRequest || Response.error();
}

async function dataNetworkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return await cache.match(request, { ignoreSearch: true }) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  const isBookDataRequest =
    url.hostname === 'webdocsach-data-api.huydd12401.workers.dev' &&
    url.pathname.startsWith('/data/');

  if (isBookDataRequest) {
    event.respondWith(dataNetworkFirst(request));
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (['style', 'script', 'image', 'font', 'manifest'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
