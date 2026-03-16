// push.js — Web Push configuration and send wrapper
const webpush = require('web-push')

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@localhost'

let configured = false

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
	webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
	configured = true
}

/**
 * Send a push notification to a subscription.
 * Returns true on success, false if the subscription is expired/invalid.
 */
async function sendNotification(subscription, payload) {
	if (!configured) {
		throw new Error('VAPID keys not configured — run: node backend/generate-vapid-keys.js')
	}

	const pushSubscription = {
		endpoint: subscription.endpoint,
		keys: {
			p256dh: subscription.keys_p256dh,
			auth: subscription.keys_auth,
		},
	}

	try {
		await webpush.sendNotification(pushSubscription, JSON.stringify(payload))
		return true
	} catch (err) {
		// 404 or 410 = subscription expired/unsubscribed
		if (err.statusCode === 404 || err.statusCode === 410) {
			return false
		}
		throw err
	}
}

module.exports = { sendNotification, configured, VAPID_PUBLIC_KEY }
