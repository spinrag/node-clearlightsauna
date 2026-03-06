const { describe, it, before, after } = require('mocha')
const { expect } = require('chai')
const http = require('http')
const express = require('express')

// Build a minimal app that mirrors the auth setup from server.js
// without requiring a real device connection.

function createTestApp(apiToken) {
	const app = express()
	const server = http.createServer(app)
	app.use(express.json())

	function requireAuth(req, res, next) {
		if (!apiToken) {
			return res.status(503).json({ error: 'Server not configured for authentication' })
		}
		const header = req.headers.authorization
		if (!header || !header.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'Missing or malformed Authorization header' })
		}
		const token = header.slice(7)
		if (token !== apiToken) {
			return res.status(403).json({ error: 'Invalid token' })
		}
		next()
	}

	app.use('/device', requireAuth)

	app.post('/device/start', (req, res) => res.json({ status: 'ok' }))
	app.post('/device/control', (req, res) => res.json({ status: 'ok' }))

	return { app, server }
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
				resolve({ status: res.statusCode, body: JSON.parse(data) })
			})
		})
		req.on('error', reject)
		if (body) req.write(JSON.stringify(body))
		req.end()
	})
}

describe('HTTP authentication', () => {
	const TOKEN = 'test-secret-token'
	let testServer
	let port

	before((done) => {
		const { server } = createTestApp(TOKEN)
		testServer = server
		testServer.listen(0, () => {
			port = testServer.address().port
			done()
		})
	})

	after((done) => {
		testServer.close(done)
	})

	it('rejects request with no Authorization header (401)', async () => {
		const res = await request(port, 'POST', '/device/start')
		expect(res.status).to.equal(401)
		expect(res.body.error).to.match(/Missing/)
	})

	it('rejects request with wrong token (403)', async () => {
		const res = await request(port, 'POST', '/device/start', {
			headers: { Authorization: 'Bearer wrong-token' },
		})
		expect(res.status).to.equal(403)
		expect(res.body.error).to.match(/Invalid/)
	})

	it('rejects request with malformed header (401)', async () => {
		const res = await request(port, 'POST', '/device/start', {
			headers: { Authorization: 'Basic abc123' },
		})
		expect(res.status).to.equal(401)
	})

	it('accepts request with correct token (200)', async () => {
		const res = await request(port, 'POST', '/device/start', {
			headers: { Authorization: `Bearer ${TOKEN}` },
		})
		expect(res.status).to.equal(200)
		expect(res.body.status).to.equal('ok')
	})
})

describe('HTTP auth when API_TOKEN is not set', () => {
	let testServer
	let port

	before((done) => {
		const { server } = createTestApp(undefined)
		testServer = server
		testServer.listen(0, () => {
			port = testServer.address().port
			done()
		})
	})

	after((done) => {
		testServer.close(done)
	})

	it('rejects all requests with 503', async () => {
		const res = await request(port, 'POST', '/device/start', {
			headers: { Authorization: 'Bearer anything' },
		})
		expect(res.status).to.equal(503)
	})
})
