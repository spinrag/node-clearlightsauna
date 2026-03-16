import { io } from 'socket.io-client';
import { browser } from '$app/environment';

const hostname = import.meta.env.VITE_SOCKET_HOST || 'http://localhost:3000';
const token = import.meta.env.VITE_API_TOKEN || '';

export const socket = io(hostname, {
	auth: { token },
	transports: ['websocket'],
	autoConnect: browser
});

if (browser) {
	socket.on('connect_error', (err) => {
		console.error('Socket connection error:', err.message);
	});
}
