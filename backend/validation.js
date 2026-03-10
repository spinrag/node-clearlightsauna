// validation.js — control payload allowlist and range enforcement

const BOOLEAN_KEYS = [
	'EXTERNAL_LIGHT',
	'INTERNAL_LIGHT',
	'PRE_TIME_FLAG',
	'power_flag',
	'cf_flag',
	'UVB_FLAG',
	'N_FLAG',
]

const NUMERIC_RANGES = {
	SET_TEMP: [60, 180],
	SET_HOUR: [0, 23], // Physical controls have no hour component; rarely used
	SET_MINUTE: [0, 60], // Physical sauna limits session time to 0–60 minutes
	PRE_TIME_HOUR: [0, 23],
	PRE_TIME_MINUTE: [0, 59],
	LEFT: [0, 255],
	RIGHT: [0, 255],
	LED: [0, 255],
}

const ALLOWED_KEYS = new Set([...BOOLEAN_KEYS, ...Object.keys(NUMERIC_RANGES)])

function validateControlPayload(payload) {
	const errors = []

	if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
		return { valid: false, errors: ['Payload must be a non-null object'] }
	}

	const keys = Object.keys(payload)
	if (keys.length === 0) {
		return { valid: false, errors: ['Payload must contain at least one key'] }
	}

	const cleaned = {}

	for (const key of keys) {
		if (!ALLOWED_KEYS.has(key)) {
			errors.push(`Unknown key: ${key}`)
			continue
		}

		const value = payload[key]

		if (BOOLEAN_KEYS.includes(key)) {
			if (typeof value !== 'boolean') {
				errors.push(`${key} must be a boolean, got ${typeof value}`)
				continue
			}
			cleaned[key] = value
		} else if (key in NUMERIC_RANGES) {
			if (typeof value !== 'number' || !Number.isInteger(value)) {
				errors.push(`${key} must be an integer, got ${typeof value === 'number' ? value : typeof value}`)
				continue
			}
			const [min, max] = NUMERIC_RANGES[key]
			if (value < min || value > max) {
				errors.push(`${key} must be between ${min} and ${max}, got ${value}`)
				continue
			}
			cleaned[key] = value
		}
	}

	if (errors.length > 0) {
		return { valid: false, errors }
	}

	return { valid: true, payload: cleaned }
}

module.exports = { validateControlPayload, ALLOWED_KEYS, BOOLEAN_KEYS, NUMERIC_RANGES }
