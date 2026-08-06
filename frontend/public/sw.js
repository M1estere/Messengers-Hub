const CACHE_NAME = 'messengers-hub-v1'
const APP_SHELL = [
  '/connect-hub/',
  '/connect-hub/manifest.webmanifest',
  '/connect-hub/icons/icon-192.png',
  '/connect-hub/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.pathname.startsWith('/connect-hub/api/')) return
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/connect-hub/')))
  )
})

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Новое сообщение', {
      body: data.body || 'Откройте чат для просмотра',
      icon: '/connect-hub/icons/icon-192.png',
      badge: '/connect-hub/icons/icon-192.png',
      tag: data.chatId ? `chat-${data.chatId}` : 'new-message',
      renotify: true,
      data: { url: data.url || '/connect-hub/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/connect-hub/', self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const windowClient of windows) {
        if ('navigate' in windowClient) {
          windowClient.navigate(targetUrl)
          return windowClient.focus()
        }
      }
      return clients.openWindow(targetUrl)
    })
  )
})
