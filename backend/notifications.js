// notifications.js — Threshold check logic with hysteresis
const { stmts } = require('./db')
const { sendNotification } = require('./push')

const HYSTERESIS_DEGREES = 5

/**
 * Check all active subscriptions against current temperature.
 * Called on every device data event.
 *
 * Notification lifecycle per subscription:
 *   1. notified=0, temp rises to >= threshold → send push, set notified=1
 *   2. notified=1, temp stays near threshold  → do nothing (no spam)
 *   3. notified=1, temp drops to <= threshold-5 → set notified=0 (re-armed)
 *   4. Power off → re-arm all (notified=0) for next heating cycle
 *
 * @param {number} currentTemp - Current sauna temperature
 * @param {object} opts
 * @param {boolean} opts.powerOff - True if power just turned off
 * @param {object} logger - Winston logger instance
 */
async function checkThresholds(currentTemp, { powerOff = false } = {}, logger) {
	// Power off → re-arm all for the next heating cycle
	if (powerOff) {
		stmts.rearmAll.run()
		logger.debug('Notifications re-armed: power off')
		return
	}

	const subscriptions = stmts.getActiveSubscriptions.all()

	for (const sub of subscriptions) {
		if (sub.notified) {
			// Already notified — check if temp dropped enough to re-arm
			if (currentTemp <= sub.threshold_temp - HYSTERESIS_DEGREES) {
				stmts.rearmOne.run(sub.id)
				logger.debug('Notification re-armed by hysteresis', {
					threshold: sub.threshold_temp,
					currentTemp,
				})
			}
			continue
		}

		// Not yet notified — check if threshold reached
		if (currentTemp < sub.threshold_temp) continue

		// Temperature reached — send notification
		try {
			const success = await sendNotification(sub, {
				title: 'Sauna Ready',
				body: `Temperature has reached ${currentTemp}°F (target: ${sub.threshold_temp}°F)`,
				tag: 'sauna-threshold',
			})

			if (success) {
				stmts.markNotified.run(sub.id)
				logger.info('Push notification sent', {
					endpoint: sub.endpoint.slice(-20),
					threshold: sub.threshold_temp,
					currentTemp,
				})
			} else {
				// Subscription expired — clean it up
				stmts.deleteSubscription.run(sub.endpoint)
				logger.info('Removed expired push subscription', {
					endpoint: sub.endpoint.slice(-20),
				})
			}
		} catch (err) {
			logger.error('Failed to send push notification', {
				error: err.message,
				endpoint: sub.endpoint.slice(-20),
			})
		}
	}
}

module.exports = { checkThresholds }
