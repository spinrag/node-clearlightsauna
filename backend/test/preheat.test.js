const { describe, it, before, after, beforeEach } = require('mocha')
const { expect } = require('chai')
const http = require('http')
const express = require('express')
const EventEmitter = require('events')

const { restoreAction, fallbackAction, withPowerOnSession, buildArmPayload } = require('../preheat-decisions')

const BEARER_TOKEN = 'test-bearer-token'
const API_KEY = 'test-api-key'

// Mirror of the server's pre-heat arm/cancel contract over a mock device, in the
// same style as start-stop.test.js. Records setAttribute call ORDER so we can
// assert the hardware-critical sequencing (power last on arm, power first on
// cancel).
function createApp() {
	const app = express()
	const server = http.createServer(app)
	app.use(express.json())

	const device = new EventEmitter()
	device.setAttributeCalls = []
	device.failKeys = new Set() // keys whose ack "times out" (device still applies the value)
	device.setAttribute = async (attrs) => {
		device.setAttributeCalls.push(attrs)
		if (device.failKeys.has(Object.keys(attrs)[0])) throw new Error('Response timeout for type 148')
	}

	let connected = true
	let commandInFlight = false
	let schedule = null

	function requireAuth(req, res, next) {
		const header = req.headers.authorization
		if (header && header.startsWith('Bearer ')) {
			if (header.slice(7) !== BEARER_TOKEN) return res.status(403).json({ error: 'Invalid token' })
		} else if (req.query.token) {
			if (req.query.token !== API_KEY) return res.status(403).json({ error: 'Invalid API key' })
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
		settings = withPowerOnSession(settings)
		try {
			for (const [key, value] of Object.entries(settings)) {
				try {
					await device.setAttribute({ [key]: value })
				} catch (e) {
					// continue on lost ack — the device applies the value anyway
				}
			}
		} finally {
			commandInFlight = false
		}
		return { dropped: false }
	}

	const PREHEAT_SESSION_MINUTES = 60

	async function armPreheat({ hours, minutes, temp }) {
		const h = Number(hours), m = Number(minutes), t = Number(temp)
		const errors = []
		if (!Number.isInteger(h) || h < 0 || h > 23) errors.push('hours must be an integer 0-23')
		if (!Number.isInteger(m) || m < 0 || m > 59) errors.push('minutes must be an integer 0-59')
		if (h * 60 + m <= 0) errors.push('delay must be greater than zero')
		if (!Number.isInteger(t) || t < 60 || t > 180) errors.push('temp must be an integer 60-180')
		if (errors.length) return { ok: false, errors }

		const s = PREHEAT_SESSION_MINUTES
		// Empty device state -> full payload, exercising the HTTP contract.
		const result = await handleControl(buildArmPayload({ hours: h, minutes: m, temp: t }, {}, s))
		if (result.dropped) return { ok: false, errors: ['Device busy, try again'] }

		const targetAt = 1_000_000 + (h * 60 + m) * 60 * 1000 // fixed base; no Date.now in tests
		schedule = { target_at: targetAt, set_temp: t, set_minute: s }
		return { ok: true, targetAt }
	}

	async function cancelPreheat() {
		const result = await handleControl({ power_flag: false, PRE_TIME_FLAG: false })
		schedule = null
		return { ok: !result.dropped }
	}

	app.all('/device/preheat', async (req, res) => {
		if (!requireDevice(res)) return
		const r = await armPreheat({
			hours: req.query.hours ?? req.body?.hours ?? 0,
			minutes: req.query.minutes ?? req.body?.minutes,
			temp: req.query.temp ?? req.body?.temp,
		})
		if (!r.ok) return res.status(400).json({ error: 'Could not arm pre-heat', details: r.errors })
		res.json({ status: 'Pre-heat armed', targetAt: r.targetAt })
	})

	app.all('/device/preheat/cancel', async (req, res) => {
		if (!requireDevice(res)) return
		await cancelPreheat()
		res.json({ status: 'Pre-heat cancelled' })
	})

	app.get('/device/preheat/status', (req, res) => {
		res.json(schedule
			? { active: true, targetAt: schedule.target_at, setTemp: schedule.set_temp, setMinute: schedule.set_minute }
			: { active: false })
	})

	return {
		server, device,
		setConnected: (val) => { connected = val },
		setCommandInFlight: (val) => { commandInFlight = val },
		getSchedule: () => schedule,
	}
}

function request(port, method, path, { headers = {}, body } = {}) {
	return new Promise((resolve, reject) => {
		const opts = {
			hostname: '127.0.0.1', port, path, method,
			headers: { 'Content-Type': 'application/json', ...headers },
		}
		const req = http.request(opts, (res) => {
			let data = ''
			res.on('data', (chunk) => { data += chunk })
			res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }))
		})
		req.on('error', reject)
		if (body) req.write(JSON.stringify(body))
		req.end()
	})
}

const auth = { Authorization: `Bearer ${BEARER_TOKEN}` }
const lastKey = (call) => Object.keys(call)[0]

describe('preheat decision helpers', () => {
	describe('restoreAction', () => {
		const sched = { target_at: 10_000, set_minute: 30 } // window ends at 10_000 + 30*60_000

		it('returns pending before the target time', () => {
			expect(restoreAction(sched, 5_000)).to.equal('pending')
		})
		it('returns start-late after target but within the session window', () => {
			expect(restoreAction(sched, 10_000 + 5 * 60_000)).to.equal('start-late')
		})
		it('returns discard once the whole window has passed', () => {
			expect(restoreAction(sched, 10_000 + 31 * 60_000)).to.equal('discard')
		})
		it('treats the exact target instant as start-late', () => {
			expect(restoreAction(sched, 10_000)).to.equal('start-late')
		})
	})

	describe('fallbackAction', () => {
		it('noop when the device is already heating', () => {
			expect(fallbackAction({ power_flag: true, PRE_TIME_FLAG: true })).to.equal('noop')
		})
		it('force-on when armed but not yet powered', () => {
			expect(fallbackAction({ power_flag: false, PRE_TIME_FLAG: true })).to.equal('force-on')
		})
		it('assume-cancelled when neither powered nor armed', () => {
			expect(fallbackAction({ power_flag: false, PRE_TIME_FLAG: false })).to.equal('assume-cancelled')
		})
	})

	describe('withPowerOnSession', () => {
		it('injects SET_MINUTE:60 (ordered first) when powering on without a length', () => {
			const out = withPowerOnSession({ power_flag: true }, 60, 30)
			expect(out).to.deep.equal({ SET_MINUTE: 60, power_flag: true })
			expect(Object.keys(out)[0]).to.equal('SET_MINUTE')
		})
		it('skips the write when the device is already at the target length', () => {
			expect(withPowerOnSession({ power_flag: true }, 60, 60)).to.deep.equal({ power_flag: true })
		})
		it('preserves an explicitly provided session length', () => {
			expect(withPowerOnSession({ power_flag: true, SET_MINUTE: 30 }, 60, 60))
				.to.deep.equal({ power_flag: true, SET_MINUTE: 30 })
		})
		it('leaves power-off commands untouched', () => {
			expect(withPowerOnSession({ power_flag: false }, 60, 30)).to.deep.equal({ power_flag: false })
		})
		it('leaves non-power commands untouched', () => {
			expect(withPowerOnSession({ SET_TEMP: 150 }, 60, 30)).to.deep.equal({ SET_TEMP: 150 })
		})
	})

	describe('buildArmPayload', () => {
		const target = { hours: 1, minutes: 30, temp: 140 }

		it('writes everything when the device state is unknown', () => {
			const p = buildArmPayload(target, {}, 60)
			expect(p).to.deep.equal({
				SET_TEMP: 140, SET_MINUTE: 60, PRE_TIME_HOUR: 1, PRE_TIME_MINUTE: 30,
				PRE_TIME_FLAG: true, power_flag: true
			})
		})
		it('skips settings the device is already at (only flags + diffs written)', () => {
			const device = { SET_TEMP: 140, SET_MINUTE: 60, PRE_TIME_HOUR: 0, PRE_TIME_MINUTE: 0 }
			const p = buildArmPayload(target, device, 60)
			// temp + session already correct -> skipped; pre-time differs -> written
			expect(p).to.deep.equal({
				PRE_TIME_HOUR: 1, PRE_TIME_MINUTE: 30, PRE_TIME_FLAG: true, power_flag: true
			})
		})
		it('always writes the flags last, power_flag final', () => {
			const device = { SET_TEMP: 140, SET_MINUTE: 60, PRE_TIME_HOUR: 1, PRE_TIME_MINUTE: 30 }
			const keys = Object.keys(buildArmPayload(target, device, 60))
			// everything already set -> only the two flags remain
			expect(keys).to.deep.equal(['PRE_TIME_FLAG', 'power_flag'])
			expect(keys[keys.length - 1]).to.equal('power_flag')
		})
		it('writes SET_MINUTE when the device session length differs', () => {
			const device = { SET_TEMP: 140, SET_MINUTE: 30, PRE_TIME_HOUR: 1, PRE_TIME_MINUTE: 30 }
			expect(buildArmPayload(target, device, 60)).to.have.property('SET_MINUTE', 60)
		})
	})
})

describe('/device/preheat', () => {
	let testServer, ctx, port

	before((done) => {
		ctx = createApp()
		testServer = ctx.server
		testServer.listen(0, () => { port = testServer.address().port; done() })
	})
	after((done) => { testServer.close(done) })
	beforeEach(() => {
		ctx.setConnected(true)
		ctx.setCommandInFlight(false)
		ctx.device.setAttributeCalls = []
		ctx.device.failKeys.clear()
	})

	it('continues the batch when a write loses its ack (still sends power_flag)', async () => {
		ctx.device.failKeys.add('PRE_TIME_MINUTE')
		const res = await request(port, 'POST', '/device/preheat', {
			headers: auth, body: { hours: 0, minutes: 10, temp: 120 },
		})
		expect(res.status).to.equal(200)
		const keys = ctx.device.setAttributeCalls.map((c) => Object.keys(c)[0])
		expect(keys).to.include('PRE_TIME_MINUTE') // the failing write was attempted
		expect(keys[keys.length - 1]).to.equal('power_flag') // and the batch ran to the end
	})

	it('arms with a valid delay and temp, always using a 60-minute session', async () => {
		const res = await request(port, 'POST', '/device/preheat', {
			headers: auth, body: { hours: 1, minutes: 30, temp: 140 },
		})
		expect(res.status).to.equal(200)
		expect(res.body.status).to.equal('Pre-heat armed')
		expect(res.body.targetAt).to.be.a('number')
		const calls = ctx.device.setAttributeCalls
		expect(calls).to.deep.include({ PRE_TIME_HOUR: 1 })
		expect(calls).to.deep.include({ PRE_TIME_MINUTE: 30 })
		expect(calls).to.deep.include({ PRE_TIME_FLAG: true })
		expect(calls).to.deep.include({ SET_TEMP: 140 })
		expect(calls).to.deep.include({ SET_MINUTE: 60 })
		expect(calls).to.deep.include({ power_flag: true })
	})

	it('sends power_flag:true LAST when arming (device requires power-on to latch the timer)', async () => {
		await request(port, 'POST', '/device/preheat', {
			headers: auth, body: { hours: 0, minutes: 10, temp: 120 },
		})
		const calls = ctx.device.setAttributeCalls
		expect(lastKey(calls[calls.length - 1])).to.equal('power_flag')
		expect(calls[calls.length - 1]).to.deep.equal({ power_flag: true })
	})

	it('rejects a zero delay', async () => {
		const res = await request(port, 'POST', '/device/preheat', {
			headers: auth, body: { hours: 0, minutes: 0, temp: 120, time: 30 },
		})
		expect(res.status).to.equal(400)
		expect(JSON.stringify(res.body.details)).to.match(/delay/)
		expect(ctx.device.setAttributeCalls).to.have.length(0)
	})

	it('rejects an out-of-range temp', async () => {
		const res = await request(port, 'POST', '/device/preheat', {
			headers: auth, body: { hours: 0, minutes: 5, temp: 200 },
		})
		expect(res.status).to.equal(400)
	})

	it('rejects without auth', async () => {
		const res = await request(port, 'POST', '/device/preheat', {
			body: { hours: 0, minutes: 5, temp: 120 },
		})
		expect(res.status).to.equal(401)
	})

	it('returns 503 when the device is disconnected', async () => {
		ctx.setConnected(false)
		const res = await request(port, 'POST', '/device/preheat', {
			headers: auth, body: { hours: 0, minutes: 5, temp: 120 },
		})
		expect(res.status).to.equal(503)
	})

	it('exposes the schedule via the status endpoint (always a 60-minute session)', async () => {
		await request(port, 'POST', '/device/preheat', {
			headers: auth, body: { hours: 0, minutes: 15, temp: 130 },
		})
		const res = await request(port, 'GET', '/device/preheat/status', { headers: auth })
		expect(res.body).to.include({ active: true, setTemp: 130, setMinute: 60 })
	})
})

describe('/device/preheat/cancel', () => {
	let testServer, ctx, port

	before((done) => {
		ctx = createApp()
		testServer = ctx.server
		testServer.listen(0, () => { port = testServer.address().port; done() })
	})
	after((done) => { testServer.close(done) })
	beforeEach(() => {
		ctx.setConnected(true)
		ctx.setCommandInFlight(false)
		ctx.device.setAttributeCalls = []
	})

	it('powers off FIRST then clears the flag (avoids the device latching power on)', async () => {
		const res = await request(port, 'POST', '/device/preheat/cancel', { headers: auth })
		expect(res.status).to.equal(200)
		const calls = ctx.device.setAttributeCalls
		expect(calls[0]).to.deep.equal({ power_flag: false })
		expect(calls).to.deep.include({ PRE_TIME_FLAG: false })
	})

	it('clears the persisted schedule', async () => {
		await request(port, 'POST', '/device/preheat', {
			headers: auth, body: { hours: 0, minutes: 5, temp: 120, time: 30 },
		})
		expect(ctx.getSchedule()).to.not.equal(null)
		await request(port, 'POST', '/device/preheat/cancel', { headers: auth })
		expect(ctx.getSchedule()).to.equal(null)
	})

	it('returns 503 when the device is disconnected', async () => {
		ctx.setConnected(false)
		const res = await request(port, 'POST', '/device/preheat/cancel', { headers: auth })
		expect(res.status).to.equal(503)
	})
})
