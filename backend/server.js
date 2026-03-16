// server.js
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const winston = require('winston')
require('dotenv').config()

const { ClearlightDevice } = require('../lib/node-gizwits/index')
const { validateControlPayload } = require('./validation')
const { stmts } = require('./db')
const { VAPID_PUBLIC_KEY, configured: pushConfigured } = require('./push')
const { checkThresholds } = require('./notifications')

// Configure Winston logger
const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || 'warn', // Default to warn level (shows ERROR and WARN)
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.errors({ stack: true }),
		winston.format.json()
	),
	defaultMeta: { service: 'clearlight-backend' },
	transports: [
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
				winston.format.colorize(),
				winston.format.printf(({ timestamp, level, message, ...meta }) => {
					return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`
				})
			)
		})
	]
})

// If we're not in production, log to a file as well
if (process.env.NODE_ENV !== 'production') {
	logger.add(new winston.transports.File({ 
		filename: 'logs/error.log', 
		level: 'error' 
	}))
	logger.add(new winston.transports.File({ 
		filename: 'logs/combined.log' 
	}))
}

// Global unhandled rejection handler to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
	logger.error('Unhandled Promise Rejection', { 
		reason: reason instanceof Error ? reason.message : String(reason),
		stack: reason instanceof Error ? reason.stack : undefined
	})
	// Don't exit the process - log and continue
})

const app = express()
const server = http.createServer(app)

// Function to convert wildcard patterns to regex
function convertWildcardToRegex(origin) {
	// Handle localhost with wildcard port
	if (origin === 'http://localhost:*') {
		return /^http:\/\/localhost:\d+$/
	}
	
	// Handle any wildcard subdomain pattern (e.g., https://*.example.com)
	if (origin.includes('*.')) {
		const domain = origin.replace('*.', '')
		// Escape dots and other regex special characters in the domain
		const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		return new RegExp(`^https?:\\/\\/([a-zA-Z0-9-]+\\.)?${escapedDomain}$`)
	}
	
	// Handle any wildcard port pattern (e.g., http://example.com:*)
	if (origin.includes(':*')) {
		const baseUrl = origin.replace(':*', '')
		// Escape dots and other regex special characters
		const escapedBaseUrl = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		return new RegExp(`^${escapedBaseUrl}:\\d+$`)
	}
	
	// Return as string for exact matches
	return origin
}

// Parse ALLOWED_ORIGINS and handle dynamic patterns
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
	.split(',')
	.map(origin => origin.trim())
	.filter(origin => origin.length > 0)
	.map(convertWildcardToRegex)

if (process.env.NODE_ENV === 'production') {
	const raw = (process.env.ALLOWED_ORIGINS || '')
	if (raw.includes(':*') || raw.includes('localhost')) {
		logger.warn('ALLOWED_ORIGINS contains broad wildcards or localhost — tighten for production')
	}
}

logger.info('Allowed origins configured', { allowedOrigins: allowedOrigins.map(o => o.toString()) })

const io = new Server(server, {
	cors: {
		origin: allowedOrigins,
		methods: ['GET', 'POST']
	}
})

// CORS middleware scoped to /push/ routes only (Socket.IO handles its own CORS)
function pushCors(req, res, next) {
	const origin = req.headers.origin
	if (origin) {
		const allowed = allowedOrigins.some(o =>
			o instanceof RegExp ? o.test(origin) : o === origin
		)
		if (allowed) {
			res.setHeader('Access-Control-Allow-Origin', origin)
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
		}
	}
	if (req.method === 'OPTIONS') return res.sendStatus(204)
	next()
}
app.use('/push', pushCors)

app.use(express.json())
app.use(express.static('public'))

// --- Authentication ---

const API_TOKEN = process.env.API_TOKEN

function requireAuth(req, res, next) {
	if (!API_TOKEN) {
		logger.warn('API_TOKEN not set — all requests are rejected')
		return res.status(503).json({ error: 'Server not configured for authentication' })
	}

	const header = req.headers.authorization
	if (!header || !header.startsWith('Bearer ')) {
		return res.status(401).json({ error: 'Missing or malformed Authorization header' })
	}

	const token = header.slice(7)
	if (token !== API_TOKEN) {
		return res.status(403).json({ error: 'Invalid token' })
	}

	next()
}

// Socket.IO authentication middleware
io.use((socket, next) => {
	if (!API_TOKEN) {
		logger.warn('Socket auth rejected: API_TOKEN not configured')
		return next(new Error('Server not configured for authentication'))
	}

	const token = socket.handshake.auth?.token
	if (!token) {
		logger.warn('Socket auth rejected: no token provided', { socketId: socket.id })
		return next(new Error('Authentication token required'))
	}
	if (token !== API_TOKEN) {
		logger.warn('Socket auth rejected: token mismatch', { socketId: socket.id })
		return next(new Error('Invalid authentication token'))
	}

	logger.debug('Socket auth accepted', { socketId: socket.id })
	next()
})

// Apply auth to all /device/* routes
app.use('/device', requireAuth)

// Async function to initialize the server
async function startServer() {
	const device = new ClearlightDevice(process.env.CLEARLIGHT_IP)
	let connected = false

	// Health check — no auth required
	app.get('/health', (req, res) => {
		res.json({
			status: connected ? 'ok' : 'degraded',
			device: connected ? 'connected' : 'disconnected',
			uptime: process.uptime()
		})
	})
	// --- Push notification endpoints ---

	app.get('/push/vapid-public-key', (req, res) => {
		if (!VAPID_PUBLIC_KEY) {
			return res.status(503).json({ error: 'VAPID keys not configured' })
		}
		res.json({ publicKey: VAPID_PUBLIC_KEY })
	})

	app.post('/push/subscribe', requireAuth, (req, res) => {
		const { endpoint, keys } = req.body || {}
		if (!endpoint || !keys?.p256dh || !keys?.auth) {
			return res.status(400).json({ error: 'Invalid subscription: endpoint and keys required' })
		}
		stmts.upsertSubscription.run({
			endpoint,
			keys_p256dh: keys.p256dh,
			keys_auth: keys.auth,
		})
		logger.info('Push subscription registered', { endpoint: endpoint.slice(-20) })
		res.json({ status: 'subscribed' })
	})

	app.put('/push/threshold', requireAuth, (req, res) => {
		const { endpoint, threshold_temp } = req.body || {}
		if (!endpoint) {
			return res.status(400).json({ error: 'endpoint required' })
		}
		if (threshold_temp != null && (typeof threshold_temp !== 'number' || threshold_temp < 80 || threshold_temp > 180)) {
			return res.status(400).json({ error: 'threshold_temp must be 80-180 or null to disable' })
		}
		const result = stmts.setThreshold.run({
			endpoint,
			threshold_temp: threshold_temp ?? null,
		})
		if (result.changes === 0) {
			return res.status(404).json({ error: 'Subscription not found — subscribe first' })
		}
		logger.info('Push threshold updated', { endpoint: endpoint.slice(-20), threshold_temp })
		res.json({ status: 'threshold updated', threshold_temp })
	})

	app.delete('/push/subscribe', requireAuth, (req, res) => {
		const { endpoint } = req.body || {}
		if (!endpoint) {
			return res.status(400).json({ error: 'endpoint required' })
		}
		stmts.deleteSubscription.run(endpoint)
		logger.info('Push subscription removed', { endpoint: endpoint.slice(-20) })
		res.json({ status: 'unsubscribed' })
	})

	let deviceSettings = {}
	let prevPowerFlag = false

	// Set max listeners to prevent memory leak warnings
	device.setMaxListeners(20);

	device.on('error', err => {
		const errorMessage = err instanceof Error ? err.message : (err ? String(err) : 'Unknown error')
		const errorStack = err instanceof Error ? err.stack : undefined
		logger.error('Device error', { error: errorMessage, stack: errorStack })
	})

	device.on('connected', async () => {
		logger.info('Device connected successfully')
		try {
			await device.login()
			await device.retrieveData()
			connected = true
			io.emit('deviceStatus', { connected: true })
			logger.info('Device login and data retrieval completed')
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : (error ? String(error) : 'Unknown error')
			logger.error('Failed to login or retrieve data', { error: errorMessage })
		}
	})

	device.on('disconnected', () => {
		logger.warn('Device disconnected')
		connected = false
		io.emit('deviceStatus', { connected: false })
	})

	device.on('data', data => {
		logger.debug('Device data received', {
			data: Object.entries(data).reduce((acc, [key, value]) => {
				acc[key] = value
				return acc
			}, {})
		})

		// Detect power-off transition for notification re-arm
		const powerOff = prevPowerFlag && !data.power_flag
		prevPowerFlag = !!data.power_flag

		deviceSettings = data

		// Check push notification thresholds
		if (pushConfigured && data.CURRENT_TEMP != null) {
			checkThresholds(data.CURRENT_TEMP, { powerOff }, logger).catch(err => {
				logger.error('Threshold check failed', { error: err.message })
			})
		}
    })

	function requireDevice(res) {
		if (!connected) {
			logger.warn('Command rejected: device not connected')
			res.status(503).json({ error: 'Device not connected' })
			return false
		}
		return true
	}

	// All control commands share device response type 0x94. Sending overlapping
	// commands can lock up the physical device, so we drop commands while one
	// is in-flight rather than queuing them. The user can retry manually.
	let commandInFlight = false

	async function handleControl(settings) {
		if (commandInFlight) {
			logger.warn('Command dropped: device is still processing a previous command', { settings })
			return { dropped: true }
		}

		commandInFlight = true
		logger.info('Handling device control', { settings })

		try {
			for (const [key, value] of Object.entries(settings)) {
				// The physical sauna only supports a 0–60 minute timer with no hour
				// component. SET_HOUR is accepted by validation but has no practical
				// effect on the device and may behave unpredictably.
				if (key === 'SET_HOUR') {
					logger.warn('SET_HOUR sent but physical controls have no hour component')
				}
				logger.debug(`Setting attribute: ${key} = ${value}`)
				await device.setAttribute({ [key]: value })
				logger.debug(`Successfully set ${key}`)
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : (error ? String(error) : 'Unknown error')
			logger.error('Device control failed', { error: errorMessage, settings })
		} finally {
			commandInFlight = false
		}

		return { dropped: false }
	}

	// HTTP endpoints for device actions
	app.post('/device/start', (req, res) => {
		if (!requireDevice(res)) return
		logger.info('Device start requested')
		device.start()
		res.json({ status: 'Device started' })
	})

	app.post('/device/stop', (req, res) => {
		if (!requireDevice(res)) return
		logger.info('Device stop requested')
		device.stop()
		res.json({ status: 'Device stopped' })
	})

	app.post('/device/reset', (req, res) => {
		if (!requireDevice(res)) return
		logger.info('Device reset requested')
		device.reset()
		res.json({ status: 'Device resetting' })
	})

	app.post('/device/control', async (req, res) => {
		if (!requireDevice(res)) return
		const { valid, errors, payload } = validateControlPayload(req.body)
		if (!valid) {
			logger.warn('Invalid control payload via HTTP', { errors, body: req.body })
			return res.status(400).json({ error: 'Invalid control payload', details: errors })
		}
		const result = await handleControl(payload)
		if (result.dropped) {
			return res.status(429).json({ error: 'Device busy, try again' })
		}
		res.json({ status: 'Device controlled', settings: payload })
	})

	// Socket.IO events for device actions
	io.on('connection', async (socket) => {
		logger.info('Client connected', { socketId: socket.id, deviceSettings })

		// Send the initial device and connection status to the client
		socket.emit('deviceStatus', { connected })
		socket.emit('attributes', deviceSettings)

		socket.on('connected', (data) => {
			logger.debug('Client connected event received', { socketId: socket.id, data })
		})

		socket.on('requestStatus', () => {
			socket.emit('deviceStatus', { connected })
			socket.emit('attributes', deviceSettings)
		})

		// Create listener functions that can be removed later
		const dataListener = (status) => {
			deviceSettings = { ...deviceSettings, ...status }
			socket.emit('attributes', deviceSettings)
		}

		const controlListener = (settings) => {
			logger.debug('Device control event', { settings })
			socket.emit('attributes', settings)
			(async () => {
				await device.setAttribute(settings)
			})().catch((error) => {
				const errorMessage = error instanceof Error ? error.message : (error ? String(error) : 'Unknown error');
				logger.error('Error setting attribute from control event', { error: errorMessage, settings })
			})
		}

		// Update the client when the device status changes
		device.on('data', dataListener)

		// Update the client when device attributes/settings change
		device.on('control', controlListener)

		socket.on('start', () => {
			if (!connected) return socket.emit('error', { error: 'Device not connected' })
			logger.info('Device start requested via socket', { socketId: socket.id })
			device.start()
		})

		socket.on('stop', () => {
			if (!connected) return socket.emit('error', { error: 'Device not connected' })
			logger.info('Device stop requested via socket', { socketId: socket.id })
			device.stop()
		})

		socket.on('reset', () => {
			if (!connected) return socket.emit('error', { error: 'Device not connected' })
			logger.info('Device reset requested via socket', { socketId: socket.id })
			device.reset()
		})

		socket.on('control', async (options, ack) => {
			if (!connected) return socket.emit('error', { error: 'Device not connected' })
			const { valid, errors, payload } = validateControlPayload(options)
			if (!valid) {
				logger.warn('Invalid control payload via socket', { errors, options, socketId: socket.id })
				socket.emit('error', { error: 'Invalid control payload', details: errors })
				return
			}
			logger.info('Device control requested via socket', { socketId: socket.id, options: payload })
			const result = await handleControl(payload)
			if (result.dropped) {
				socket.emit('error', { error: 'Device busy, try again' })
			} else if (typeof ack === 'function') {
				ack({ status: 'ok', settings: payload })
			}
		})

		socket.on('disconnect', () => {
			logger.info('Client disconnected', { socketId: socket.id })
			// Remove listeners to prevent memory leaks
			device.removeListener('data', dataListener)
			device.removeListener('control', controlListener)
		})
	})

	const PORT = process.env.PORT || 3000
	server.listen(PORT, () => {
		logger.info(`Server listening on port ${PORT}`)
	})

	// Connect to device in the background — server is already accepting requests
	logger.info('Attempting to connect to device...')
	device.connect().catch(err => {
		const errorMessage = err instanceof Error ? err.message : String(err)
		logger.error('Initial device connection failed, will auto-reconnect', { error: errorMessage })
	})
}

// Start the server
startServer().catch((error) => {
	const errorMessage = error instanceof Error ? error.message : (error ? String(error) : 'Unknown error');
	const errorStack = error instanceof Error ? error.stack : undefined;
	logger.error('Error starting server', { error: errorMessage, stack: errorStack })
	process.exit(1);
})
