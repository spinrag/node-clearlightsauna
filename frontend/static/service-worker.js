// Stamped at build time by scripts/stamp-sw.mjs with the app version and commit,
// so every deploy changes this file and clients pick the update up. Bumping it by
// hand was forgotten once, which left installed PWAs running a stale bundle
// against the old API origin.
const CACHE_VERSION = '__BUILD_VERSION__';
const CACHE_NAME = `clearlight-${CACHE_VERSION}`;

// Static assets to pre-cache on install. '/' is deliberately absent: navigations
// are not intercepted, so a cached shell would never be served.
const PRECACHE_URLS = ['/manifest.json'];

// Patterns that should always go to the network (never cached)
const NETWORK_ONLY_PATTERNS = [
	// Cloudflare's own namespace, including the Access login callback. Its code is
	// single-use, so a cached or replayed response breaks the login outright.
	'/cdn-cgi/',
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

	// Navigations are deliberately NOT intercepted — the browser handles them.
	//
	// Cloudflare Access answers an expired session with a redirect to a login URL
	// carrying a SINGLE-USE token. Any fetch() here follows that chain and spends
	// the token, so handing the browser a redirect to the same URL afterwards
	// fails with "token has already been used" and the login can never complete.
	// Intercepting navigations also previously served a stale cached shell when
	// the network call failed, booting an old bundle against an old API origin.
	//
	// Both bugs come from touching navigations at all. The browser already
	// performs them correctly, including redirects and auth flows. The only thing
	// given up is an offline app shell, which is worth nothing here: this app
	// cannot do anything without the backend, so an offline shell would render a
	// dead UI rather than an honest failure.
	if (event.request.mode === 'navigate') {
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
