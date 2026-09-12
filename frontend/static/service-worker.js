// Stamped at build time by scripts/stamp-sw.mjs with the app version and commit,
// so every deploy changes this file and clients pick the update up. Bumping it by
// hand was forgotten once, which left installed PWAs running a stale bundle
// against the old API origin.
const CACHE_VERSION = '__BUILD_VERSION__';
const CACHE_NAME = `clearlight-${CACHE_VERSION}`;

// Static assets to pre-cache on install
const PRECACHE_URLS = ['/', '/manifest.json'];

// Patterns that should always go to the network (never cached)
const NETWORK_ONLY_PATTERNS = [
	'/api/', // the backend, now same-origin — must never be served from cache
	'/device/',
	'/health',
	'/push/',
	'/socket.io/',
	'.hot-update.' // Vite HMR
];

function isNetworkOnly(url) {
	return NETWORK_ONLY_PATTERNS.some((pattern) => url.includes(pattern));
}

// Install: pre-cache the app shell, then take over immediately.
//
// skipWaiting() is load-bearing. Without it a newly installed worker sits in
// "waiting" until every client closes, so activate never runs — and activate is
// what claims clients and posts SW_UPDATED, the only thing that raises the
// "new version available" banner. An installed PWA is never really closed (it
// lives in the app switcher), so on iOS the old worker kept serving its cached
// shell indefinitely and the update was never offered.
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.then(() => self.skipWaiting())
	);
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
					// Cloudflare Access answers an expired session with a redirect to its
					// login page. That is an auth challenge, not content: pass it back so
					// the browser can run the login. A navigation may not be answered with
					// an already-redirected response, so hand over a fresh redirect to the
					// same place and let the browser follow it.
					if (response.redirected) {
						return Response.redirect(response.url, 302);
					}
					// Only cache real content. Caching an error (or the login page) would
					// serve it as the app shell on the next launch.
					if (!response.ok) {
						return response;
					}
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					return response;
				})
				// Offline only. Auth challenges return above, so a live session is never
				// masked by a stale shell pointing at old asset hashes.
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
