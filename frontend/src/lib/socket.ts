import { io } from 'socket.io-client';

const hostname = import.meta.env.VITE_SOCKET_HOST || 'http://localhost:3000';
const token = import.meta.env.VITE_API_TOKEN || '';

export const socket = io(hostname, {
	auth: { token }
});
