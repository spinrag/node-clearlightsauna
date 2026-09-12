import { io } from 'socket.io-client';
import { browser } from '$app/environment';
import { socketHost } from './endpoints';
import { recoverIfSessionExpired } from './reauth';

const token = import.meta.env.VITE_API_TOKEN || '';

const options = {
	auth: { token },
	// Polling is kept as a fallback: a WebSocket upgrade blocked by a proxy or an
	// Access redirect fails opaquely, whereas the polling handshake is an XHR we
	// can reason about.
	transports: ['websocket', 'polling'],
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
