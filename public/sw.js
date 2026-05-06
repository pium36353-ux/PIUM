const CACHE = 'pium-v2'

const APP_SHELL = [
  '/',
  '/index.html',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {}
  const title = data.title ?? 'PIUM'
  const body  = data.body  ?? ''
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      actions: [{ action: 'complete', title: '✓ Fatto' }],
      data: data.data ?? {},
      tag: data.data?.appointmentId ? `apt-${data.data.appointmentId}` : undefined,
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  if (e.action === 'complete') {
    const { appointmentId } = e.notification.data ?? {}
    if (appointmentId) {
      e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
          const client = list.find(c => c.url.includes('/dashboard'))
          if (client) {
            client.postMessage({ type: 'MARK_COMPLETE', appointmentId })
            return client.focus()
          }
          return self.clients.openWindow('/dashboard')
        })
      )
    }
    return
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus()
      return self.clients.openWindow('/dashboard')
    })
  )
})

self.addEventListener('fetch', (e) => {
  // Solo richieste GET, escludi Supabase e API esterne
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(cache => cache.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request))
  )
})
