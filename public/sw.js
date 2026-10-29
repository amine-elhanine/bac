const CACHE_NAME = 'bac-shell-v3'
const SHELL = ['/', '/manifest.webmanifest', '/bac-logo.png', '/bac-icon-192.png', '/bac-icon-512.png', '/bac-icon-maskable-512.png', '/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(SHELL.filter((path) => path !== '/'))
    const response = await fetch('/')
    if (!response.ok) throw new Error('The BAC app shell could not be cached.')
    await cache.put('/', response.clone())
    const html = await response.text()
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
      .map((match) => match[1])
      .filter((path) => path.startsWith('/') && !path.startsWith('//'))
    await cache.addAll(assets)
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  const appResource = request.mode === 'navigate' || ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !appResource) return
  event.respondWith((async () => {
    try {
      const response = await fetch(request)
      const cacheControl = response.headers.get('Cache-Control') ?? ''
      if (response.ok && !/no-store|private/i.test(cacheControl)) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone()).catch(() => undefined)
      }
      return response
    } catch {
      const cached = await caches.match(request)
      if (cached) return cached
      if (request.mode === 'navigate') {
        const shell = await caches.match('/')
        if (shell) return shell
      }
      return new Response('This BAC resource is unavailable offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
  })())
})
