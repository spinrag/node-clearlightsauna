const { describe, it, before, after, beforeEach } = require('mocha')
const { expect } = require('chai')
const http = require('http')
const express = require('express')
const { db, stmts } = require('../db')

const TOKEN = 'test-push-token'

function createPushApp() {
	const app = express()
	const server = http.createServer(app)
	app.use(express.json())

	function requireAuth(req, res, next) {
		const header = req.headers.authorization
		if (!header || !header.startsWith('Bearer ') || header.slice(7) !== TOKEN) {
			return res.status(401).json({ error: 'Unauthorized' })
		}
		next()
	}

	app.get('/push/vapid-public-key', (req, res) => {
		res.json({ publicKey: 'test-vapid-key' })
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
		res.json({ status: 'threshold updated', threshold_temp })
	})

	app.post('/push/unsubscribe', requireAuth, (req, res) => {
		const { endpoint } = req.body || {}
		if (!endpoint) {
			return res.status(400).json({ error: 'endpoint required' })
		}
		stmts.deleteSubscription.run(endpoint)
		res.json({ status: 'unsubscribed' })
	})

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
				resolve({ status: res.statusCode, body: JSON.parse(data || '{}') })
			})
		})
		req.on('error', reject)
		if (body) req.write(JSON.stringify(body))
		req.end()
	})
}

const auth = { Authorization: `Bearer ${TOKEN}` }

describe('Push endpoints', () => {
	let testServer
	let port

	before((done) => {
		const { server } = createPushApp()
		testServer = server
		testServer.listen(0, () => {
			port = testServer.address().port
			done()
		})
	})

	after((done) => {
		testServer.close(done)
	})

	beforeEach(() => {
		db.exec('DELETE FROM push_subscriptions')
	})

	describe('GET /push/vapid-public-key', () => {
		it('returns the public key without auth', async () => {
			const res = await request(port, 'GET', '/push/vapid-public-key')
			expect(res.status).to.equal(200)
			expect(res.body.publicKey).to.equal('test-vapid-key')
		})
	})

	describe('POST /push/subscribe', () => {
		it('rejects without auth', async () => {
			const res = await request(port, 'POST', '/push/subscribe', {
				body: { endpoint: 'https://push.example.com/1', keys: { p256dh: 'a', auth: 'b' } },
			})
			expect(res.status).to.equal(401)
		})

		it('rejects missing endpoint', async () => {
			const res = await request(port, 'POST', '/push/subscribe', {
				headers: auth,
				body: { keys: { p256dh: 'a', auth: 'b' } },
			})
			expect(res.status).to.equal(400)
		})

		it('rejects missing keys', async () => {
			const res = await request(port, 'POST', '/push/subscribe', {
				headers: auth,
				body: { endpoint: 'https://push.example.com/1' },
			})
			expect(res.status).to.equal(400)
		})

		it('stores a valid subscription', async () => {
			const res = await request(port, 'POST', '/push/subscribe', {
				headers: auth,
				body: { endpoint: 'https://push.example.com/1', keys: { p256dh: 'key1', auth: 'auth1' } },
			})
			expect(res.status).to.equal(200)
			expect(res.body.status).to.equal('subscribed')

			const sub = stmts.getSubscriptionByEndpoint.get('https://push.example.com/1')
			expect(sub).to.not.be.undefined
			expect(sub.keys_p256dh).to.equal('key1')
		})

		it('upserts on duplicate endpoint', async () => {
			await request(port, 'POST', '/push/subscribe', {
				headers: auth,
				body: { endpoint: 'https://push.example.com/1', keys: { p256dh: 'old', auth: 'old' } },
			})
			const res = await request(port, 'POST', '/push/subscribe', {
				headers: auth,
				body: { endpoint: 'https://push.example.com/1', keys: { p256dh: 'new', auth: 'new' } },
			})
			expect(res.status).to.equal(200)

			const sub = stmts.getSubscriptionByEndpoint.get('https://push.example.com/1')
			expect(sub.keys_p256dh).to.equal('new')
		})
	})

	describe('PUT /push/threshold', () => {
		const endpoint = 'https://push.example.com/thresh'

		beforeEach(() => {
			stmts.upsertSubscription.run({ endpoint, keys_p256dh: 'k', keys_auth: 'a' })
		})

		it('rejects without auth', async () => {
			const res = await request(port, 'PUT', '/push/threshold', {
				body: { endpoint, threshold_temp: 150 },
			})
			expect(res.status).to.equal(401)
		})

		it('rejects missing endpoint', async () => {
			const res = await request(port, 'PUT', '/push/threshold', {
				headers: auth,
				body: { threshold_temp: 150 },
			})
			expect(res.status).to.equal(400)
		})

		it('rejects threshold below 80', async () => {
			const res = await request(port, 'PUT', '/push/threshold', {
				headers: auth,
				body: { endpoint, threshold_temp: 79 },
			})
			expect(res.status).to.equal(400)
		})

		it('rejects threshold above 180', async () => {
			const res = await request(port, 'PUT', '/push/threshold', {
				headers: auth,
				body: { endpoint, threshold_temp: 181 },
			})
			expect(res.status).to.equal(400)
		})

		it('rejects non-numeric threshold', async () => {
			const res = await request(port, 'PUT', '/push/threshold', {
				headers: auth,
				body: { endpoint, threshold_temp: 'hot' },
			})
			expect(res.status).to.equal(400)
		})

		it('sets a valid threshold', async () => {
			const res = await request(port, 'PUT', '/push/threshold', {
				headers: auth,
				body: { endpoint, threshold_temp: 150 },
			})
			expect(res.status).to.equal(200)
			expect(res.body.threshold_temp).to.equal(150)

			const sub = stmts.getSubscriptionByEndpoint.get(endpoint)
			expect(sub.threshold_temp).to.equal(150)
		})

		it('clears threshold with null', async () => {
			stmts.setThreshold.run({ endpoint, threshold_temp: 150 })
			const res = await request(port, 'PUT', '/push/threshold', {
				headers: auth,
				body: { endpoint, threshold_temp: null },
			})
			expect(res.status).to.equal(200)

			const sub = stmts.getSubscriptionByEndpoint.get(endpoint)
			expect(sub.threshold_temp).to.be.null
		})

		it('returns 404 for unknown endpoint', async () => {
			const res = await request(port, 'PUT', '/push/threshold', {
				headers: auth,
				body: { endpoint: 'https://push.example.com/unknown', threshold_temp: 150 },
			})
			expect(res.status).to.equal(404)
		})
	})

	describe('POST /push/status', () => {
		const endpoint = 'https://push.example.com/status'

		it('rejects without auth', async () => {
			const res = await request(port, 'POST', '/push/status', {
				body: { endpoint },
			})
			expect(res.status).to.equal(401)
		})

		it('rejects missing endpoint', async () => {
			const res = await request(port, 'POST', '/push/status', {
				headers: auth,
				body: {},
			})
			expect(res.status).to.equal(400)
		})

		it('returns 404 for unknown subscription', async () => {
			const res = await request(port, 'POST', '/push/status', {
				headers: auth,
				body: { endpoint },
			})
			expect(res.status).to.equal(404)
		})

		it('returns threshold and notified state', async () => {
			stmts.upsertSubscription.run({ endpoint, keys_p256dh: 'k', keys_auth: 'a' })
			stmts.setThreshold.run({ endpoint, threshold_temp: 140 })

			const res = await request(port, 'POST', '/push/status', {
				headers: auth,
				body: { endpoint },
			})
			expect(res.status).to.equal(200)
			expect(res.body.threshold_temp).to.equal(140)
			expect(res.body.notified).to.equal(false)
		})
	})

	describe('POST /push/unsubscribe', () => {
		const endpoint = 'https://push.example.com/del'

		it('rejects without auth', async () => {
			const res = await request(port, 'POST', '/push/unsubscribe', {
				body: { endpoint },
			})
			expect(res.status).to.equal(401)
		})

		it('rejects missing endpoint', async () => {
			const res = await request(port, 'POST', '/push/unsubscribe', {
				headers: auth,
				body: {},
			})
			expect(res.status).to.equal(400)
		})

		it('removes a subscription', async () => {
			stmts.upsertSubscription.run({ endpoint, keys_p256dh: 'k', keys_auth: 'a' })
			const res = await request(port, 'POST', '/push/unsubscribe', {
				headers: auth,
				body: { endpoint },
			})
			expect(res.status).to.equal(200)
			expect(res.body.status).to.equal('unsubscribed')

			const sub = stmts.getSubscriptionByEndpoint.get(endpoint)
			expect(sub).to.be.undefined
		})

		it('succeeds even if endpoint does not exist', async () => {
			const res = await request(port, 'POST', '/push/unsubscribe', {
				headers: auth,
				body: { endpoint: 'https://push.example.com/nonexistent' },
			})
			expect(res.status).to.equal(200)
		})
	})
})
