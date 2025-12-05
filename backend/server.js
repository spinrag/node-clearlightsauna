// server.js
const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const { Server } = require('socket.io')
const winston = require('winston')
require('dotenv').config()

const { ClearlightDevice } = require('../../node-gizwits/index')

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

logger.info('Allowed origins configured', { allowedOrigins: allowedOrigins.map(o => o.toString()) })

const io = new Server(server, {
	cors: {
		origin: allowedOrigins,
		methods: ['GET', 'POST']
	}
})

app.use(express.json())
app.use(express.static('public'))

// Async function to initialize the server
async function startServer() {
	const device = new ClearlightDevice(process.env.CLEARLIGHT_IP)
	let connected = false
	let deviceSettings = {}

	// Set max listeners to prevent memory leak warnings
	device.setMaxListeners(20);

	device.on('error', err => {
		const errorMessage = err instanceof Error ? err.message : (err ? String(err) : 'Unknown error');
		const errorStack = err instanceof Error ? err.stack : undefined;
		logger.error('Device error', { error: errorMessage, stack: errorStack })
	})

	device.on('connected', async () => {
		logger.info('Device connected successfully')
		try {
			await device.login()
			await device.retrieveData()
			connected = true
			logger.info('Device login and data retrieval completed')
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : (error ? String(error) : 'Unknown error');
			logger.error('Failed to login or retrieve data', { error: errorMessage })
		}
	})

	device.on('data', data => {
		logger.debug('Device data received', { 
			data: Object.entries(data).reduce((acc, [key, value]) => {
				acc[key] = value
				return acc
			}, {})
		})
		deviceSettings = data
    })

	async function handleControl(settings) {
		logger.info('Handling device control', { settings })
		// Process each setting one at a time
		for (const [key, value] of Object.entries(settings)) {
			logger.debug(`Setting attribute: ${key} = ${value}`)
			if (key === 'SET_HOUR') {
				logger.warn('SET_HOUR attribute is known to be problematic')
			}
			try {
				await device.setAttribute({ [key]: value })
				logger.debug(`Successfully set ${key}`)
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : (error ? String(error) : 'Unknown error');
				logger.error(`Failed to set ${key}`, { error: errorMessage, key, value })
				throw error // Re-throw to handle in the calling function
			}
		}
	}

	// HTTP endpoints for device actions
	app.post('/device/start', (req, res) => {
		logger.info('Device start requested')
		device.start()
		res.send({ status: 'Device started' })
	})

	app.post('/device/stop', (req, res) => {
		logger.info('Device stop requested')
		device.stop()
		res.send({ status: 'Device stopped' })
	})

	app.post('/device/reset', (req, res) => {
		logger.info('Device reset requested')
		device.reset()
		res.send({ status: 'Device resetting' })
	})

	app.post('/device/control', (req, res) => {
		const options = req.body
		logger.info('Device control requested', { options })
		device.control(options)
		res.send({ status: 'Device controlled', settings: options })
	})

	// Socket.IO events for device actions
	io.on('connection', async (socket) => {
		logger.info('Client connected', { socketId: socket.id, deviceSettings })

		// Send the initial device status and attributes to the client
		socket.emit('attributes', deviceSettings)

		socket.on('connected', (data) => {
			logger.debug('Client connected event received', { socketId: socket.id, data })
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
			logger.info('Device start requested via socket', { socketId: socket.id })
			device.start()
		})

		socket.on('stop', () => {
			logger.info('Device stop requested via socket', { socketId: socket.id })
			device.stop()
		})

		socket.on('reset', () => {
			logger.info('Device reset requested via socket', { socketId: socket.id })
			device.reset()
		})

		socket.on('control', (options) => {
			logger.info('Device control requested via socket', { socketId: socket.id, options })
			handleControl(options).catch((error) => {
				const errorMessage = error instanceof Error ? error.message : (error ? String(error) : 'Unknown error');
				logger.error('Error handling control via socket', { error: errorMessage, socketId: socket.id, options })
			})
		})

		socket.on('disconnect', () => {
			logger.info('Client disconnected', { socketId: socket.id })
			// Remove listeners to prevent memory leaks
			device.removeListener('data', dataListener)
			device.removeListener('control', controlListener)
		})
	})

	logger.info('Attempting to connect to device...')
	console.time('Connect')
	await device.connect()
	console.timeEnd('Connect')

	const PORT = process.env.PORT || 3000
	server.listen(PORT, () => {
		logger.info(`Server listening on port ${PORT}`)
	})

}

// Start the server
startServer().catch((error) => {
	const errorMessage = error instanceof Error ? error.message : (error ? String(error) : 'Unknown error');
	const errorStack = error instanceof Error ? error.stack : undefined;
	logger.error('Error starting server', { error: errorMessage, stack: errorStack })
	process.exit(1);
})
