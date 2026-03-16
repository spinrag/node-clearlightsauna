const { describe, it, beforeEach } = require('mocha')
const { expect } = require('chai')
const proxyquire = require('proxyquire')
const { db, stmts } = require('../db')

// Track calls to sendNotification
let sendResult = true
let sendCalls = []

const { checkThresholds } = proxyquire('../notifications', {
	'./push': {
		sendNotification: async (sub, payload) => {
			sendCalls.push({ sub, payload })
			return sendResult
		},
	},
})

// Minimal logger mock
const logs = []
const logger = {
	debug: (msg, meta) => logs.push({ level: 'debug', msg, meta }),
	info: (msg, meta) => logs.push({ level: 'info', msg, meta }),
	error: (msg, meta) => logs.push({ level: 'error', msg, meta }),
}

function insertSub({ endpoint = 'https://push.example.com/test', threshold = 150, notified = 0 } = {}) {
	stmts.upsertSubscription.run({
		endpoint,
		keys_p256dh: 'test-p256dh',
		keys_auth: 'test-auth',
	})
	if (threshold != null) {
		stmts.setThreshold.run({ endpoint, threshold_temp: threshold })
	}
	if (notified) {
		const sub = stmts.getSubscriptionByEndpoint.get(endpoint)
		stmts.markNotified.run(sub.id)
	}
	return stmts.getSubscriptionByEndpoint.get(endpoint)
}

describe('checkThresholds', () => {
	beforeEach(() => {
		db.exec('DELETE FROM push_subscriptions')
		sendCalls = []
		sendResult = true
		logs.length = 0
	})

	it('sends notification when temp reaches threshold', async () => {
		insertSub({ threshold: 150 })
		await checkThresholds(150, {}, logger)
		expect(sendCalls).to.have.length(1)
		expect(sendCalls[0].payload.title).to.equal('Sauna Ready')
		const sub = stmts.getSubscriptionByEndpoint.get('https://push.example.com/test')
		expect(sub.notified).to.equal(1)
	})

	it('sends notification when temp exceeds threshold', async () => {
		insertSub({ threshold: 150 })
		await checkThresholds(155, {}, logger)
		expect(sendCalls).to.have.length(1)
	})

	it('does not notify when temp is below threshold', async () => {
		insertSub({ threshold: 150 })
		await checkThresholds(149, {}, logger)
		expect(sendCalls).to.have.length(0)
	})

	it('does not re-notify when already notified', async () => {
		insertSub({ threshold: 150, notified: 1 })
		await checkThresholds(155, {}, logger)
		expect(sendCalls).to.have.length(0)
	})

	it('re-arms when temp drops below threshold minus hysteresis', async () => {
		insertSub({ threshold: 150, notified: 1 })
		await checkThresholds(144, {}, logger) // 150 - 5 = 145, 144 <= 145
		const sub = stmts.getSubscriptionByEndpoint.get('https://push.example.com/test')
		expect(sub.notified).to.equal(0)
	})

	it('does not re-arm within hysteresis band', async () => {
		insertSub({ threshold: 150, notified: 1 })
		await checkThresholds(147, {}, logger) // 150 - 5 = 145, 147 > 145
		const sub = stmts.getSubscriptionByEndpoint.get('https://push.example.com/test')
		expect(sub.notified).to.equal(1)
	})

	it('re-arms at exact hysteresis boundary', async () => {
		insertSub({ threshold: 150, notified: 1 })
		await checkThresholds(145, {}, logger) // 150 - 5 = 145, 145 <= 145
		const sub = stmts.getSubscriptionByEndpoint.get('https://push.example.com/test')
		expect(sub.notified).to.equal(0)
	})

	it('power off re-arms all subscriptions', async () => {
		insertSub({ endpoint: 'https://push.example.com/a', threshold: 150, notified: 1 })
		insertSub({ endpoint: 'https://push.example.com/b', threshold: 160, notified: 1 })
		await checkThresholds(155, { powerOff: true }, logger)
		const a = stmts.getSubscriptionByEndpoint.get('https://push.example.com/a')
		const b = stmts.getSubscriptionByEndpoint.get('https://push.example.com/b')
		expect(a.notified).to.equal(0)
		expect(b.notified).to.equal(0)
		expect(sendCalls).to.have.length(0)
	})

	it('removes expired subscription when send returns false', async () => {
		sendResult = false
		insertSub({ threshold: 150 })
		await checkThresholds(150, {}, logger)
		const sub = stmts.getSubscriptionByEndpoint.get('https://push.example.com/test')
		expect(sub).to.be.undefined
	})

	it('handles multiple subscriptions independently', async () => {
		insertSub({ endpoint: 'https://push.example.com/low', threshold: 100 })
		insertSub({ endpoint: 'https://push.example.com/high', threshold: 160 })
		await checkThresholds(120, {}, logger)
		expect(sendCalls).to.have.length(1) // only the 100 threshold
		const low = stmts.getSubscriptionByEndpoint.get('https://push.example.com/low')
		const high = stmts.getSubscriptionByEndpoint.get('https://push.example.com/high')
		expect(low.notified).to.equal(1)
		expect(high.notified).to.equal(0)
	})

	it('does not notify subscriptions without a threshold', async () => {
		stmts.upsertSubscription.run({
			endpoint: 'https://push.example.com/nothreshold',
			keys_p256dh: 'test',
			keys_auth: 'test',
		})
		// threshold_temp is NULL by default — getActiveSubscriptions excludes these
		await checkThresholds(180, {}, logger)
		expect(sendCalls).to.have.length(0)
	})
})
