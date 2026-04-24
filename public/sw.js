const CACHE_NAME = 'lyyve-app-shell-v1'
const APP_SHELL_URL = new URL('./index.html', self.location.href).pathname

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(new Request(APP_SHELL_URL, { cache: 'reload' })))
      .catch(() => {
        // Install should not fail hard when offline.
      })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const isNavigationRequest = request.mode === 'navigate'
  if (!isNavigationRequest) return

  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then((response) => {
        const responseClone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL_URL, responseClone))
        return response
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME)
        const cachedResponse = await cache.match(APP_SHELL_URL)
        return cachedResponse || Response.error()
      })
  )
})
