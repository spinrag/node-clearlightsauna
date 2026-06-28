// server.js
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const winston = require('winston')
require('dotenv').config()

const { ClearlightDevice } = require('../lib/node-gizwits/index')
const { validateControlPayload } = require('./validation')
const { stmts } = require('./db')
const { restoreAction, fallbackAction, withPowerOnSession, buildArmPayload } = require('./preheat-decisions')
const { VAPID_PUBLIC_KEY, configured: pushConfigured } = require('./push')
const { checkThresholds } = require('./notifications')
const { logSaunaPoint, closeInflux, configured: influxConfigured } = require('./influx')

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
const API_KEY = process.env.API_KEY

function requireAuth(req, res, next) {
	if (!API_TOKEN) {
		logger.warn('API_TOKEN not set — all requests are rejected')
		return res.status(503).json({ error: 'Server not configured for authentication' })
	}

	// Accept token from Authorization header or ?token= query param (API_KEY)
	const header = req.headers.authorization
	const queryToken = req.query.token

	if (header && header.startsWith('Bearer ')) {
		if (header.slice(7) !== API_TOKEN) {
			return res.status(403).json({ error: 'Invalid token' })
		}
	} else if (queryToken) {
		if (!API_KEY) {
			return res.status(503).json({ error: 'API_KEY not configured for URL-based auth' })
		}
		if (queryToken !== API_KEY) {
			return res.status(403).json({ error: 'Invalid API key' })
		}
	} else {
		return res.status(401).json({ error: 'Missing authentication — use Authorization header or ?token= query param' })
	}

	next()
}

// Socket.IO authentication middleware
io.use((socket, next) => {
	if (!API_TOKEN) {
		logger.warn('Socket auth rejected: API_TOKEN not configured')
		return next(new Error('Server not configured for authentication'))
	}

	const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address
	const token = socket.handshake.auth?.token
	if (!token) {
		logger.warn('Socket auth rejected: no token provided', { socketId: socket.id, clientIp })
		return next(new Error('Authentication token required'))
	}
	if (token !== API_TOKEN) {
		logger.warn('Socket auth rejected: token mismatch', { socketId: socket.id, clientIp })
		return next(new Error('Invalid authentication token'))
	}

	logger.debug('Socket auth accepted', { socketId: socket.id })
	next()
})

// Apply auth to all /device/* routes
app.use('/device', requireAuth)

// Async function to initialize the server
async function startServer() {
	// responseTimeout 2500ms (down from the 5s default): the device occasionally
	// never acks a write, and we don't want one lost ack to stall a control batch
	// for 5s. Plenty for a LAN device that normally responds in well under 1s.
	const device = new ClearlightDevice(process.env.CLEARLIGHT_IP, { responseTimeout: 2500 })
	let connected = false

	// Health check — no auth required
	app.get('/health', (req, res) => {
		res.json({
			status: connected ? 'ok' : 'degraded',
			device: connected ? 'connected' : 'disconnected',
			logging: influxConfigured ? 'influx' : 'off',
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

	app.post('/push/status', requireAuth, (req, res) => {
		const { endpoint } = req.body || {}
		if (!endpoint) {
			return res.status(400).json({ error: 'endpoint required' })
		}
		const sub = stmts.getSubscriptionByEndpoint.get(endpoint)
		if (!sub) {
			return res.status(404).json({ error: 'Subscription not found' })
		}
		res.json({ threshold_temp: sub.threshold_temp, notified: !!sub.notified })
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

	app.post('/push/unsubscribe', requireAuth, (req, res) => {
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
	let prevPreFlag = false

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
			restorePreheat()
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
		// Force a stats sample on any power / pre-heat transition so session
		// starts and stops are captured for accurate heat-up timing.
		const stateChanged = prevPowerFlag !== !!data.power_flag || prevPreFlag !== !!data.PRE_TIME_FLAG
		prevPowerFlag = !!data.power_flag
		prevPreFlag = !!data.PRE_TIME_FLAG

		deviceSettings = data

		// Log a sample to InfluxDB (throttled inside, forced on state change)
		if (influxConfigured) {
			logSaunaPoint(data, { force: stateChanged })
		}

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

	// Each attribute is its own device write. A short settle between writes keeps
	// the device from coalescing rapid back-to-back writes; ~150ms is well above
	// the tested floor (all writes latched down to 80ms on hardware). The gap only
	// applies between keys, so single-key commands stay instant.
	const INTER_COMMAND_DELAY_MS = 150

	async function handleControl(settings) {
		if (commandInFlight) {
			logger.warn('Command dropped: device is still processing a previous command', { settings })
			return { dropped: true }
		}

		commandInFlight = true
		// Turning power on always runs a full 60-minute session unless a length was
		// explicitly provided (e.g. /device/start automation) or the device is
		// already at 60 (no redundant write).
		settings = withPowerOnSession(settings, 60, deviceSettings.SET_MINUTE)
		logger.info('Handling device control', { settings })

		try {
			const entries = Object.entries(settings)
			let lostAcks = 0
			for (let i = 0; i < entries.length; i++) {
				const [key, value] = entries[i]
				// The physical sauna only supports a 0–60 minute timer with no hour
				// component. SET_HOUR is accepted by validation but has no practical
				// effect on the device and may behave unpredictably.
				if (key === 'SET_HOUR') {
					logger.warn('SET_HOUR sent but physical controls have no hour component')
				}
				logger.debug(`Setting attribute: ${key} = ${value}`)
				try {
					await device.setAttribute({ [key]: value })
				} catch (error) {
					// The device frequently applies the value even when its ack is lost
					// or late (verified against hardware). Do NOT abort the batch — the
					// remaining writes, notably the final power_flag, must still be sent.
					lostAcks++
					const msg = error instanceof Error ? error.message : String(error)
					logger.warn('Device write ack failed; continuing', { key, error: msg })
				}
				if (i < entries.length - 1) {
					await new Promise(r => setTimeout(r, INTER_COMMAND_DELAY_MS))
				}
			}
			if (lostAcks) logger.info('Device control finished with lost acks', { lostAcks, total: entries.length })
		} finally {
			commandInFlight = false
		}

		return { dropped: false }
	}

	// handleControl drops a command if one is already in flight. For unattended
	// pre-heat actions, retry once after a short pause before giving up.
	async function handleControlWithRetry(payload, attempts = 2) {
		for (let i = 0; i < attempts; i++) {
			const result = await handleControl(payload)
			if (!result.dropped) return result
			await new Promise(r => setTimeout(r, 1500))
		}
		logger.warn('handleControl still dropped after retries', { payload })
		return { dropped: true }
	}

	// --- Pre-heat scheduling -------------------------------------------------
	// The sauna's native pre-heat is a delayed-start timer that only fires if
	// power_flag is set true at arming time (verified against hardware): the
	// device counts the delay down and then engages the heater itself. We arm it
	// that way as the primary mechanism and run a backend watchdog as a fallback —
	// if the device has not powered on shortly past the target time, we force it.
	// The device rounds its countdown up by up to ~1 min, so the watchdog waits
	// past that before intervening.
	const PREHEAT_GRACE_MS = 150 * 1000

	// Pre-heat always runs a full 60-minute session once it fires.
	const PREHEAT_SESSION_MINUTES = 60

	let preheatTimer = null

	function schedulePayload() {
		const row = stmts.getPreheatSchedule.get()
		return row ? { targetAt: row.target_at, setTemp: row.set_temp, setMinute: row.set_minute } : null
	}

	function broadcastSchedule() {
		io.emit('preheatSchedule', schedulePayload())
	}

	function clearSchedule() {
		if (preheatTimer) {
			clearTimeout(preheatTimer)
			preheatTimer = null
		}
		stmts.clearPreheatSchedule.run()
		broadcastSchedule()
	}

	function scheduleWatchdog(targetAt) {
		if (preheatTimer) clearTimeout(preheatTimer)
		const delay = Math.max(0, targetAt + PREHEAT_GRACE_MS - Date.now())
		preheatTimer = setTimeout(() => {
			fireFallback('watchdog').catch(err => logger.error('Pre-heat fallback failed', { error: err.message }))
		}, delay)
	}

	async function fireFallback(reason) {
		const row = stmts.getPreheatSchedule.get()
		if (!row) return
		const action = fallbackAction(deviceSettings)
		if (action === 'noop') {
			logger.info('Pre-heat fallback: device already heating, nothing to do', { reason })
		} else if (action === 'force-on') {
			// Device still shows the timer armed but is overdue — force the session on.
			logger.warn('Pre-heat fallback: device did not start, forcing power on', { reason })
			await handleControlWithRetry({ SET_TEMP: row.set_temp, SET_MINUTE: row.set_minute, power_flag: true })
		} else {
			// Neither powered nor armed → user likely cancelled at the panel. Do not start.
			logger.info('Pre-heat fallback: device not armed and not on, assuming cancelled', { reason })
		}
		clearSchedule()
	}

	async function armPreheat({ hours, minutes, temp }) {
		const h = Number(hours), m = Number(minutes), t = Number(temp)
		const errors = []
		if (!Number.isInteger(h) || h < 0 || h > 23) errors.push('hours must be an integer 0-23')
		if (!Number.isInteger(m) || m < 0 || m > 59) errors.push('minutes must be an integer 0-59')
		if (h * 60 + m <= 0) errors.push('delay must be greater than zero')
		if (!Number.isInteger(t) || t < 60 || t > 180) errors.push('temp must be an integer 60-180')
		if (errors.length) return { ok: false, errors }

		const s = PREHEAT_SESSION_MINUTES
		// Arm the proven way (targets, delay, flag, then power) but only write
		// settings the device isn't already at — each write is paced ~900ms.
		const payload = buildArmPayload({ hours: h, minutes: m, temp: t }, deviceSettings, s)
		const result = await handleControlWithRetry(payload)
		if (result.dropped) return { ok: false, errors: ['Device busy, try again'] }

		const targetAt = Date.now() + (h * 60 + m) * 60 * 1000
		stmts.setPreheatSchedule.run({ target_at: targetAt, set_temp: t, set_minute: s })
		scheduleWatchdog(targetAt)
		broadcastSchedule()
		logger.info('Pre-heat armed', { hours: h, minutes: m, temp: t, sessionMinutes: s, targetAt, writes: Object.keys(payload).length })
		return { ok: true, targetAt }
	}

	async function cancelPreheat() {
		// Order matters: power off FIRST. Clearing PRE_TIME_FLAG while the device is
		// counting down makes it commit to a running session and latch power on, so a
		// later power_flag:false loses the race (verified against hardware).
		const result = await handleControlWithRetry({ power_flag: false, PRE_TIME_FLAG: false })
		clearSchedule()
		logger.info('Pre-heat cancelled')
		return { ok: !result.dropped }
	}

	// On startup / reconnect, recover a persisted schedule. Per product decision:
	// start late if still within the would-be session window, otherwise discard.
	function restorePreheat() {
		const row = stmts.getPreheatSchedule.get()
		if (!row) return
		const action = restoreAction(row, Date.now())
		if (action === 'pending') {
			logger.info('Restoring pending pre-heat schedule', { targetAt: row.target_at })
			scheduleWatchdog(row.target_at)
			broadcastSchedule()
		} else if (action === 'start-late') {
			logger.warn('Pre-heat target passed during downtime, starting late', { targetAt: row.target_at })
			handleControlWithRetry({ SET_TEMP: row.set_temp, SET_MINUTE: row.set_minute, power_flag: true })
				.catch(err => logger.error('Late pre-heat start failed', { error: err.message }))
			clearSchedule()
		} else {
			logger.info('Pre-heat window fully missed during downtime, discarding', { targetAt: row.target_at })
			clearSchedule()
		}
	}

	// Convenience endpoints for automation (curl, Home Assistant, webhooks)
	// Support both GET with query params and POST with JSON body.

	app.all('/device/start', async (req, res) => {
		if (!requireDevice(res)) return

		const time = Number(req.query.time ?? req.body?.time)
		const temp = Number(req.query.temp ?? req.body?.temp)

		if (!time || !Number.isInteger(time) || time < 1 || time > 60) {
			return res.status(400).json({ error: 'time is required (1-60 minutes)' })
		}
		if (!temp || !Number.isInteger(temp) || temp < 60 || temp > 180) {
			return res.status(400).json({ error: 'temp is required (60-180°F)' })
		}

		const payload = { power_flag: true, SET_MINUTE: time, SET_TEMP: temp }
		const result = await handleControl(payload)
		if (result.dropped) {
			return res.status(429).json({ error: 'Device busy, try again' })
		}
		logger.info('Device started via HTTP', { time, temp })
		res.json({ status: 'Sauna started', time, temp })
	})

	app.all('/device/stop', async (req, res) => {
		if (!requireDevice(res)) return

		const result = await handleControl({ power_flag: false })
		if (result.dropped) {
			return res.status(429).json({ error: 'Device busy, try again' })
		}
		logger.info('Device stopped via HTTP')
		res.json({ status: 'Sauna stopped' })
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

	// Arm the delayed-start pre-heat. hours+minutes = delay from now; temp = target
	// temperature; time = session length in minutes (matches /device/start).
	app.all('/device/preheat', async (req, res) => {
		if (!requireDevice(res)) return
		const r = await armPreheat({
			hours: req.query.hours ?? req.body?.hours ?? 0,
			minutes: req.query.minutes ?? req.body?.minutes,
			temp: req.query.temp ?? req.body?.temp,
		})
		if (!r.ok) return res.status(400).json({ error: 'Could not arm pre-heat', details: r.errors })
		logger.info('Pre-heat armed via HTTP', { targetAt: r.targetAt })
		res.json({ status: 'Pre-heat armed', targetAt: r.targetAt })
	})

	app.all('/device/preheat/cancel', async (req, res) => {
		if (!requireDevice(res)) return
		await cancelPreheat()
		res.json({ status: 'Pre-heat cancelled' })
	})

	app.get('/device/preheat/status', (req, res) => {
		const payload = schedulePayload()
		res.json(payload ? { active: true, ...payload } : { active: false })
	})

	// Socket.IO events for device actions
	io.on('connection', async (socket) => {
		const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address
		logger.info('Client connected', { socketId: socket.id, clientIp })

		// Send the initial device and connection status to the client
		socket.emit('deviceStatus', { connected })
		socket.emit('attributes', deviceSettings)
		socket.emit('preheatSchedule', schedulePayload())

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

		// Update the client when the device status changes
		device.on('data', dataListener)

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

		socket.on('armPreheat', async (opts, ack) => {
			if (!connected) return socket.emit('error', { error: 'Device not connected' })
			logger.info('Pre-heat arm requested via socket', { socketId: socket.id, opts })
			const r = await armPreheat({
				hours: opts?.hours,
				minutes: opts?.minutes,
				temp: opts?.temp,
			})
			if (!r.ok) socket.emit('error', { error: 'Could not arm pre-heat', details: r.errors })
			if (typeof ack === 'function') ack(r.ok ? { status: 'ok', targetAt: r.targetAt } : { status: 'error', errors: r.errors })
		})

		socket.on('cancelPreheat', async (ack) => {
			if (!connected) return socket.emit('error', { error: 'Device not connected' })
			logger.info('Pre-heat cancel requested via socket', { socketId: socket.id })
			await cancelPreheat()
			if (typeof ack === 'function') ack({ status: 'ok' })
		})

		socket.on('disconnect', (reason) => {
			logger.info('Client disconnected', { socketId: socket.id, clientIp, reason })
			// Remove listeners to prevent memory leaks
			device.removeListener('data', dataListener)
		})
	})

	const PORT = process.env.PORT || 3000
	server.listen(PORT, () => {
		logger.info(`Server listening on port ${PORT}`)
		logger.info(`Stats logging: ${influxConfigured ? 'InfluxDB enabled' : 'disabled (INFLUX_* not set)'}`)
	})

	// Flush buffered stats on shutdown so the last samples are not lost.
	let shuttingDown = false
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => {
			if (shuttingDown) return
			shuttingDown = true
			logger.info(`Received ${signal}, flushing and exiting`)
			closeInflux().finally(() => process.exit(0))
		})
	}

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
