// Increment this version to trigger an update on connected clients
const CACHE_VERSION = 'v1';
const CACHE_NAME = `clearlight-${CACHE_VERSION}`;

// Static assets to pre-cache on install
const PRECACHE_URLS = ['/', '/manifest.json'];

// Patterns that should always go to the network (never cached)
const NETWORK_ONLY_PATTERNS = [
	'/device/',
	'/health',
	'/push/',
	'/socket.io/',
	'.hot-update.' // Vite HMR
];

function isNetworkOnly(url) {
	return NETWORK_ONLY_PATTERNS.some((pattern) => url.includes(pattern));
}

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

// Activate: clean up old caches and notify clients of the update
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
			.then(() =>
				self.clients.matchAll().then((clients) => {
					clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
				})
			)
	);
});

// Push: display notification from backend
self.addEventListener('push', (event) => {
	const data = event.data ? event.data.json() : {};
	const title = data.title || 'Sauna Notification';
	const options = {
		body: data.body || '',
		tag: data.tag || 'sauna-default',
		icon: '/favicon.png',
		badge: '/favicon.png',
		vibrate: [200, 100, 200],
		renotify: false
	};
	event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: focus or open the app
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			// Focus existing window if available
			for (const client of clients) {
				if ('focus' in client) {
					return client.focus();
				}
			}
			// Otherwise open a new window
			return self.clients.openWindow('/');
		})
	);
});

// Fetch: network-first for pages, cache-first for static assets
self.addEventListener('fetch', (event) => {
	const url = event.request.url;

	// Skip cross-origin requests entirely (Socket.IO, backend API, etc.)
	if (!url.startsWith(self.location.origin)) {
		return;
	}

	// Always go to network for API, Socket.IO, and HMR
	if (isNetworkOnly(url)) {
		return;
	}

	// For navigation requests (HTML pages): network-first, fall back to cache
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					return response;
				})
				.catch(() => caches.match(event.request))
		);
		return;
	}

	// For static assets: cache-first, fall back to network and cache the result
	event.respondWith(
		caches.match(event.request).then(
			(cached) =>
				cached ||
				fetch(event.request).then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					}
					return response;
				})
		)
	);
});
