import { io } from 'socket.io-client'

// Read hostname from environment variable
const hostname = import.meta.env.VITE_SOCKET_HOST || 'http://localhost:3000'

export const socket = io(hostname)
