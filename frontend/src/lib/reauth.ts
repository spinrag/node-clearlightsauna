// reauth.ts — recovering from an expired Cloudflare Access session.
//
// Access answers an expired session with a 302 to its login page. A WebSocket
// upgrade cannot follow a redirect, and a fetch that follows one lands on the
// login page — which sends no CORS headers, so it surfaces as an indistinguish-
// able network error. Neither can re-authenticate on its own: only a top-level
// navigation completes the flow and returns via Access's redirect_url. An
// installed PWA has no address bar, so without this the app just stays broken.
import { browser } from '$app/environment';
import { apiUrl } from './endpoints';

const GUARD_KEY = 'sauna:last-reauth';

// A failing login would otherwise reload in a loop.
const MIN_RELOAD_INTERVAL_MS = 30_000;

function readGuard(): number {
	try {
		return Number(sessionStorage.getItem(GUARD_KEY)) || 0;
	} catch {
		// sessionStorage throws when site data is blocked; treat as never reloaded.
		return 0;
	}
}

function writeGuard(at: number): void {
	try {
		sessionStorage.setItem(GUARD_KEY, String(at));
	} catch {
		// Non-fatal: we lose loop protection but can still recover the session.
	}
}

/**
 * Whether the backend is answering with an Access redirect rather than data.
 *
 * `redirect: 'manual'` is what makes this readable: it turns the 302 into an
 * opaqueredirect response instead of following it cross-origin into a response
 * we would not be allowed to inspect. /health needs no auth, so a redirect there
 * means Access intercepted the request, not that the backend rejected it.
 */
export async function accessSessionExpired(): Promise<boolean> {
	if (!browser) return false;
	try {
		const res = await fetch(apiUrl('/health'), { redirect: 'manual', cache: 'no-store' });
		return res.type === 'opaqueredirect';
	} catch {
		// A genuine network failure (backend down, offline) is not an auth problem.
		return false;
	}
}

/**
 * Reloads the page so Access can run its login flow, returning whether the
 * reload was actually started — a caller can surface a manual prompt when the
 * rate limit suppressed it.
 */
export function reauthenticate(): boolean {
	if (!browser) return false;
	const now = Date.now();
	if (now - readGuard() < MIN_RELOAD_INTERVAL_MS) return false;
	writeGuard(now);
	location.reload();
	return true;
}

/** Probes for an expired session and recovers if that is what went wrong. */
export async function recoverIfSessionExpired(): Promise<boolean> {
	if (!(await accessSessionExpired())) return false;
	reauthenticate();
	return true;
}
