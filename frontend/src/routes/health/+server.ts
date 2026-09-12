import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Mirrors the backend's GET /health so a deployed frontend can be identified
// without shell access — the built bundle carries its own version and commit.
export const prerender = false;

export const GET: RequestHandler = () => {
	return json({
		status: 'ok',
		version: __APP_VERSION__,
		commit: __GIT_COMMIT__,
		uptime: process.uptime()
	});
};
