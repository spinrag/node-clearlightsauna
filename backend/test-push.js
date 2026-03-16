#!/usr/bin/env node
// Send a test push notification to all active subscriptions.
// Usage: pnpm --filter backend test:push

require('dotenv').config()
const { stmts } = require('./db')
const { sendNotification } = require('./push')

const subs = stmts.getActiveSubscriptions.all()
console.log(`${subs.length} active subscription(s)`)

if (subs.length === 0) {
	console.log('No subscriptions with a threshold set. Set one via the bell icon first.')
	process.exit(0)
}

Promise.all(
	subs.map(s =>
		sendNotification(s, {
			title: 'Sauna Ready',
			body: `Test push! Threshold: ${s.threshold_temp}°F`,
			tag: 'sauna-threshold',
		})
			.then(ok => console.log(`  sent to ...${s.endpoint.slice(-20)}: ${ok}`))
			.catch(e => console.error(`  failed ...${s.endpoint.slice(-20)}: ${e.message}`))
	)
).then(() => process.exit(0))
