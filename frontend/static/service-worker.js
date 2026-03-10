// Increment this version to trigger an update on connected clients
const CACHE_VERSION = 'v1';
const CACHE_NAME = `clearlight-${CACHE_VERSION}`;

// Static assets to pre-cache on install
const PRECACHE_URLS = ['/', '/manifest.json'];

// Patterns that should always go to the network (never cached)
const NETWORK_ONLY_PATTERNS = [
	'/device/',
	'/health',
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

// Fetch: network-first for pages, cache-first for static assets
self.addEventListener('fetch', (event) => {
	const url = event.request.url;

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
