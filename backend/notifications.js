// notifications.js — Threshold check logic with hysteresis
const { stmts } = require('./db')
const { sendNotification } = require('./push')

const HYSTERESIS_DEGREES = 5

/**
 * Check all active subscriptions against current temperature.
 * Called on every device data event.
 *
 * @param {number} currentTemp - Current sauna temperature
 * @param {object} opts
 * @param {boolean} opts.powerOff - True if power just turned off (re-arms all)
 * @param {object} logger - Winston logger instance
 */
async function checkThresholds(currentTemp, { powerOff = false } = {}, logger) {
	// Re-arm all subscriptions when power turns off
	if (powerOff) {
		stmts.rearmAll.run()
		logger.debug('Notifications re-armed: power off')
		return
	}

	// Re-arm subscriptions where temp has dropped enough below threshold (hysteresis)
	stmts.rearmByHysteresis.run(currentTemp)

	// Check subscriptions that haven't been notified yet
	const subscriptions = stmts.getActiveSubscriptions.all()

	for (const sub of subscriptions) {
		if (sub.notified) continue
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
