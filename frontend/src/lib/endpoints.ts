// endpoints.ts — where the browser reaches the backend.
//
// Default is same-origin: nginx routes /api/* and /socket.io/ on the app's own
// hostname through to the backend, so the page and the API share a single
// Cloudflare Access session. Setting VITE_SOCKET_HOST opts into a cross-origin
// backend — local dev against a separate port, or the standalone sauna-api
// hostname — which means a second Access session that expires independently of
// the page's. See docs/CLOUDFLARE-ACCESS.md.

const configuredHost = (import.meta.env.VITE_SOCKET_HOST || '').trim().replace(/\/+$/, '');

/** True when the backend is reached through the page's own origin. */
export const sameOrigin = configuredHost === '';

/** Builds a REST URL. Same-origin calls carry the /api prefix nginx strips. */
export function apiUrl(path: string): string {
	return sameOrigin ? `/api${path}` : `${configuredHost}${path}`;
}

/** Target for socket.io-client; undefined means connect to the page's origin. */
export const socketHost: string | undefined = sameOrigin ? undefined : configuredHost;
