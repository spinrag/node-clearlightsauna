// preheat-decisions.js — pure decision helpers for pre-heat scheduling.
// Kept free of device/db/timer side effects so the subtle, hardware-derived
// rules can be unit-tested directly and shared with server.js.

// Decide what to do with a persisted schedule when the backend (re)connects.
// Per product decision: start late only if still within the would-be session
// window, otherwise discard.
//   'pending'    — target still in the future; (re)arm the watchdog
//   'start-late' — target passed but we are still inside the session window
//   'discard'    — the whole window was missed during downtime
function restoreAction(schedule, now) {
	const windowEnd = schedule.target_at + schedule.set_minute * 60 * 1000
	if (now < schedule.target_at) return 'pending'
	if (now < windowEnd) return 'start-late'
	return 'discard'
}

// Decide how the watchdog should act at fire time, given the device's observed
// flags. The device's native pre-heat clears PRE_TIME_FLAG and powers on itself
// when its countdown completes, so:
//   'noop'             — device already heating; nothing to do
//   'force-on'         — still armed but overdue; force the session on (fallback)
//   'assume-cancelled' — neither on nor armed; user likely cancelled, do nothing
function fallbackAction(deviceState) {
	if (deviceState.power_flag) return 'noop'
	if (deviceState.PRE_TIME_FLAG) return 'force-on'
	return 'assume-cancelled'
}

// Always run a full session whenever power is turned on. Returns settings with
// SET_MINUTE injected (ordered first, so the session length is set before power)
// when power is being turned on and no explicit length was given — e.g. the app
// power button. A caller that specifies its own SET_MINUTE (e.g. /device/start
// automation) is left untouched, as is any command that is not powering on.
// `currentMinutes` is the device's current SET_MINUTE: if it already equals the
// target, no write is injected (each device write is paced ~900ms, so skip no-ops).
function withPowerOnSession(settings, sessionMinutes = 60, currentMinutes = undefined) {
	if (
		settings.power_flag === true &&
		settings.SET_MINUTE === undefined &&
		currentMinutes !== sessionMinutes
	) {
		return { SET_MINUTE: sessionMinutes, ...settings }
	}
	return settings
}

// Build the minimal ordered set of device writes to arm pre-heat. Each attribute
// is a separate write paced ~900ms apart (the hardware drops back-to-back writes),
// so we only write settings that differ from the device's current state — writing
// a value the device already holds is a no-op that just adds latency. The flags
// are always written, last and in order (PRE_TIME_FLAG then power_flag), so the
// timer latches. `device` is the latest known device state; unknown fields
// (undefined) differ from any target and so are written (safe default).
function buildArmPayload({ hours, minutes, temp }, device = {}, sessionMinutes = 60) {
	const payload = {}
	if (Number.isInteger(temp) && device.SET_TEMP !== temp) payload.SET_TEMP = temp
	if (device.SET_MINUTE !== sessionMinutes) payload.SET_MINUTE = sessionMinutes
	if (device.PRE_TIME_HOUR !== hours) payload.PRE_TIME_HOUR = hours
	if (device.PRE_TIME_MINUTE !== minutes) payload.PRE_TIME_MINUTE = minutes
	payload.PRE_TIME_FLAG = true
	payload.power_flag = true
	return payload
}

module.exports = { restoreAction, fallbackAction, withPowerOnSession, buildArmPayload }
