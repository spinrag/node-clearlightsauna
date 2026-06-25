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
function withPowerOnSession(settings, sessionMinutes = 60) {
	if (settings.power_flag === true && settings.SET_MINUTE === undefined) {
		return { SET_MINUTE: sessionMinutes, ...settings }
	}
	return settings
}

module.exports = { restoreAction, fallbackAction, withPowerOnSession }
