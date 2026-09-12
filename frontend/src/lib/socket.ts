import { io } from 'socket.io-client';
import { browser } from '$app/environment';
import { socketHost } from './endpoints';
import { recoverIfSessionExpired } from './reauth';

const token = import.meta.env.VITE_API_TOKEN || '';

const options = {
	auth: { token },
	// Transport order is left at Socket.IO's default (polling, then a silent
	// upgrade to websocket) on purpose. Listing websocket first does NOT give a
	// fallback: the client retries the first transport indefinitely rather than
	// stepping down the array, so wherever a websocket upgrade cannot complete —
	// a proxy or edge without websocket support — the connection fails with
	// `timeout` roughly every 21s and never establishes. Polling first connects
	// immediately and upgrades when it can, degrading to plain polling when it
	// cannot. It also makes an expired Access session visible, since the opening
	// handshake is then an XHR rather than an opaque upgrade.
	autoConnect: browser
};

export const socket = socketHost ? io(socketHost, options) : io(options);

if (browser) {
	socket.on('connect_error', (err) => {
		console.error('Socket connection error:', err.message);
		// An expired Access session looks like a generic connect failure here;
		// probe for it and reload into the login flow when that is the cause.
		void recoverIfSessionExpired();
	});
}
