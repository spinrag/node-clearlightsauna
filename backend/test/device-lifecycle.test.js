const { describe, it, before, after, beforeEach } = require('mocha')
const { expect } = require('chai')
const http = require('http')
const express = require('express')
const EventEmitter = require('events')
const { validateControlPayload } = require('../validation')

const TOKEN = 'test-device-token'

function createDeviceApp() {
	const app = express()
	const server = http.createServer(app)
	app.use(express.json())

	const device = new EventEmitter()
	device.setMaxListeners(20)
	device.setAttributeCalls = []
	device.setAttribute = async (attrs) => {
		device.setAttributeCalls.push(attrs)
	}

	let connected = false
	let commandInFlight = false

	function requireAuth(req, res, next) {
		const header = req.headers.authorization
		if (!header || header.slice(7) !== TOKEN) {
			return res.status(401).json({ error: 'Unauthorized' })
		}
		next()
	}

	app.use('/device', requireAuth)

	app.get('/health', (req, res) => {
		res.json({
			status: connected ? 'ok' : 'degraded',
			device: connected ? 'connected' : 'disconnected',
			uptime: process.uptime()
		})
	})

	function requireDevice(res) {
		if (!connected) {
			res.status(503).json({ error: 'Device not connected' })
			return false
		}
		return true
	}

	async function handleControl(settings) {
		if (commandInFlight) {
			return { dropped: true }
		}
		commandInFlight = true
		try {
			for (const [key, value] of Object.entries(settings)) {
				await device.setAttribute({ [key]: value })
			}
		} finally {
			commandInFlight = false
		}
		return { dropped: false }
	}

	app.post('/device/control', async (req, res) => {
		if (!requireDevice(res)) return
		const { valid, errors, payload } = validateControlPayload(req.body)
		if (!valid) {
			return res.status(400).json({ error: 'Invalid control payload', details: errors })
		}
		const result = await handleControl(payload)
		if (result.dropped) {
			return res.status(429).json({ error: 'Device busy, try again' })
		}
		res.json({ status: 'Device controlled', settings: payload })
	})

	return {
		app, server, device,
		setConnected: (val) => { connected = val },
		setCommandInFlight: (val) => { commandInFlight = val },
	}
}

function request(port, method, path, { headers = {}, body } = {}) {
	return new Promise((resolve, reject) => {
		const opts = {
			hostname: '127.0.0.1',
			port,
			path,
			method,
			headers: { 'Content-Type': 'application/json', ...headers },
		}
		const req = http.request(opts, (res) => {
			let data = ''
			res.on('data', (chunk) => { data += chunk })
			res.on('end', () => {
				resolve({ status: res.statusCode, body: JSON.parse(data || '{}') })
			})
		})
		req.on('error', reject)
		if (body) req.write(JSON.stringify(body))
		req.end()
	})
}

const auth = { Authorization: `Bearer ${TOKEN}` }

describe('Device lifecycle and control', () => {
	let testServer, ctx, port

	before((done) => {
		ctx = createDeviceApp()
		testServer = ctx.server
		testServer.listen(0, () => {
			port = testServer.address().port
			done()
		})
	})

	after((done) => {
		testServer.close(done)
	})

	beforeEach(() => {
		ctx.setConnected(true)
		ctx.setCommandInFlight(false)
		ctx.device.setAttributeCalls = []
	})

	describe('GET /health', () => {
		it('returns ok when device is connected', async () => {
			ctx.setConnected(true)
			const res = await request(port, 'GET', '/health')
			expect(res.status).to.equal(200)
			expect(res.body.status).to.equal('ok')
			expect(res.body.device).to.equal('connected')
			expect(res.body.uptime).to.be.a('number')
		})

		it('returns degraded when device is disconnected', async () => {
			ctx.setConnected(false)
			const res = await request(port, 'GET', '/health')
			expect(res.status).to.equal(200)
			expect(res.body.status).to.equal('degraded')
			expect(res.body.device).to.equal('disconnected')
		})

		it('does not require auth', async () => {
			const res = await request(port, 'GET', '/health')
			expect(res.status).to.equal(200)
		})
	})

	describe('POST /device/control — requireDevice guard', () => {
		it('returns 503 when device is disconnected', async () => {
			ctx.setConnected(false)
			const res = await request(port, 'POST', '/device/control', {
				headers: auth,
				body: { SET_TEMP: 120 },
			})
			expect(res.status).to.equal(503)
			expect(res.body.error).to.match(/not connected/)
		})

		it('passes through when device is connected', async () => {
			ctx.setConnected(true)
			const res = await request(port, 'POST', '/device/control', {
				headers: auth,
				body: { SET_TEMP: 120 },
			})
			expect(res.status).to.equal(200)
			expect(res.body.status).to.equal('Device controlled')
		})
	})

	describe('POST /device/control — validation', () => {
		it('rejects invalid payload with 400', async () => {
			const res = await request(port, 'POST', '/device/control', {
				headers: auth,
				body: { FAKE: true },
			})
			expect(res.status).to.equal(400)
			expect(res.body.error).to.match(/Invalid/)
		})

		it('rejects out-of-range values', async () => {
			const res = await request(port, 'POST', '/device/control', {
				headers: auth,
				body: { SET_TEMP: 999 },
			})
			expect(res.status).to.equal(400)
		})
	})

	describe('POST /device/control — handleControl', () => {
		it('calls setAttribute for each key in payload', async () => {
			const res = await request(port, 'POST', '/device/control', {
				headers: auth,
				body: { SET_TEMP: 150, EXTERNAL_LIGHT: true },
			})
			expect(res.status).to.equal(200)
			expect(ctx.device.setAttributeCalls).to.deep.include({ SET_TEMP: 150 })
			expect(ctx.device.setAttributeCalls).to.deep.include({ EXTERNAL_LIGHT: true })
		})

		it('returns 429 when command is in-flight', async () => {
			ctx.setCommandInFlight(true)
			const res = await request(port, 'POST', '/device/control', {
				headers: auth,
				body: { SET_TEMP: 100 },
			})
			expect(res.status).to.equal(429)
			expect(res.body.error).to.match(/busy/)
			expect(ctx.device.setAttributeCalls).to.have.length(0)
		})
	})
})
