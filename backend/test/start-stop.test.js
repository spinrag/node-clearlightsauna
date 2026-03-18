const { describe, it, before, after, beforeEach } = require('mocha')
const { expect } = require('chai')
const http = require('http')
const express = require('express')
const EventEmitter = require('events')

const BEARER_TOKEN = 'test-bearer-token'
const API_KEY = 'test-api-key'

function createApp() {
	const app = express()
	const server = http.createServer(app)
	app.use(express.json())

	const device = new EventEmitter()
	device.setAttributeCalls = []
	device.setAttribute = async (attrs) => {
		device.setAttributeCalls.push(attrs)
	}

	let connected = true
	let commandInFlight = false

	function requireAuth(req, res, next) {
		const header = req.headers.authorization
		const queryToken = req.query.token

		if (header && header.startsWith('Bearer ')) {
			if (header.slice(7) !== BEARER_TOKEN) {
				return res.status(403).json({ error: 'Invalid token' })
			}
		} else if (queryToken) {
			if (queryToken !== API_KEY) {
				return res.status(403).json({ error: 'Invalid API key' })
			}
		} else {
			return res.status(401).json({ error: 'Missing auth' })
		}
		next()
	}

	app.use('/device', requireAuth)

	function requireDevice(res) {
		if (!connected) {
			res.status(503).json({ error: 'Device not connected' })
			return false
		}
		return true
	}

	async function handleControl(settings) {
		if (commandInFlight) return { dropped: true }
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
		if (result.dropped) return res.status(429).json({ error: 'Device busy' })
		res.json({ status: 'Sauna started', time, temp })
	})

	app.all('/device/stop', async (req, res) => {
		if (!requireDevice(res)) return
		const result = await handleControl({ power_flag: false })
		if (result.dropped) return res.status(429).json({ error: 'Device busy' })
		res.json({ status: 'Sauna stopped' })
	})

	return {
		server, device,
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

const auth = { Authorization: `Bearer ${BEARER_TOKEN}` }

describe('/device/start', () => {
	let testServer, ctx, port

	before((done) => {
		ctx = createApp()
		testServer = ctx.server
		testServer.listen(0, () => {
			port = testServer.address().port
			done()
		})
	})

	after((done) => { testServer.close(done) })

	beforeEach(() => {
		ctx.setConnected(true)
		ctx.setCommandInFlight(false)
		ctx.device.setAttributeCalls = []
	})

	describe('GET with query params', () => {
		it('starts sauna with token, time, and temp', async () => {
			const res = await request(port, 'GET', `/device/start?token=${API_KEY}&time=30&temp=150`)
			expect(res.status).to.equal(200)
			expect(res.body.status).to.equal('Sauna started')
			expect(res.body.time).to.equal(30)
			expect(res.body.temp).to.equal(150)
			expect(ctx.device.setAttributeCalls).to.deep.include({ power_flag: true })
			expect(ctx.device.setAttributeCalls).to.deep.include({ SET_MINUTE: 30 })
			expect(ctx.device.setAttributeCalls).to.deep.include({ SET_TEMP: 150 })
		})

		it('rejects without token', async () => {
			const res = await request(port, 'GET', '/device/start?time=30&temp=150')
			expect(res.status).to.equal(401)
		})

		it('rejects missing time', async () => {
			const res = await request(port, 'GET', `/device/start?token=${API_KEY}&temp=150`)
			expect(res.status).to.equal(400)
			expect(res.body.error).to.match(/time/)
		})

		it('rejects missing temp', async () => {
			const res = await request(port, 'GET', `/device/start?token=${API_KEY}&time=30`)
			expect(res.status).to.equal(400)
			expect(res.body.error).to.match(/temp/)
		})

		it('rejects time out of range', async () => {
			const res = await request(port, 'GET', `/device/start?token=${API_KEY}&time=61&temp=150`)
			expect(res.status).to.equal(400)
		})

		it('rejects temp out of range', async () => {
			const res = await request(port, 'GET', `/device/start?token=${API_KEY}&time=30&temp=200`)
			expect(res.status).to.equal(400)
		})
	})

	describe('POST with JSON body', () => {
		it('starts sauna with body params', async () => {
			const res = await request(port, 'POST', '/device/start', {
				headers: auth,
				body: { time: 45, temp: 160 },
			})
			expect(res.status).to.equal(200)
			expect(res.body.time).to.equal(45)
			expect(res.body.temp).to.equal(160)
		})
	})

	describe('guards', () => {
		it('returns 503 when device disconnected', async () => {
			ctx.setConnected(false)
			const res = await request(port, 'GET', `/device/start?token=${API_KEY}&time=30&temp=150`)
			expect(res.status).to.equal(503)
		})

		it('returns 429 when command in-flight', async () => {
			ctx.setCommandInFlight(true)
			const res = await request(port, 'GET', `/device/start?token=${API_KEY}&time=30&temp=150`)
			expect(res.status).to.equal(429)
		})
	})
})

describe('/device/stop', () => {
	let testServer, ctx, port

	before((done) => {
		ctx = createApp()
		testServer = ctx.server
		testServer.listen(0, () => {
			port = testServer.address().port
			done()
		})
	})

	after((done) => { testServer.close(done) })

	beforeEach(() => {
		ctx.setConnected(true)
		ctx.setCommandInFlight(false)
		ctx.device.setAttributeCalls = []
	})

	it('stops sauna via GET with query token', async () => {
		const res = await request(port, 'GET', `/device/stop?token=${API_KEY}`)
		expect(res.status).to.equal(200)
		expect(res.body.status).to.equal('Sauna stopped')
		expect(ctx.device.setAttributeCalls).to.deep.include({ power_flag: false })
	})

	it('stops sauna via POST with Bearer token', async () => {
		const res = await request(port, 'POST', '/device/stop', { headers: auth })
		expect(res.status).to.equal(200)
		expect(res.body.status).to.equal('Sauna stopped')
	})

	it('rejects without auth', async () => {
		const res = await request(port, 'GET', '/device/stop')
		expect(res.status).to.equal(401)
	})

	it('returns 503 when device disconnected', async () => {
		ctx.setConnected(false)
		const res = await request(port, 'GET', `/device/stop?token=${API_KEY}`)
		expect(res.status).to.equal(503)
	})
})

describe('requireAuth query token fallback', () => {
	let testServer, ctx, port

	before((done) => {
		ctx = createApp()
		testServer = ctx.server
		testServer.listen(0, () => {
			port = testServer.address().port
			done()
		})
	})

	after((done) => { testServer.close(done) })

	it('accepts Bearer header', async () => {
		const res = await request(port, 'GET', '/device/stop', { headers: auth })
		expect(res.status).to.equal(200)
	})

	it('accepts query param token', async () => {
		const res = await request(port, 'GET', `/device/stop?token=${API_KEY}`)
		expect(res.status).to.equal(200)
	})

	it('rejects wrong query param token', async () => {
		const res = await request(port, 'GET', '/device/stop?token=wrong')
		expect(res.status).to.equal(403)
	})
})
