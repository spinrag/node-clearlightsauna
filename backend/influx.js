// influx.js — optional time-series logging of sauna stats to InfluxDB 2.x.
// Used to measure heat-up time (how long to reach SET_TEMP from a known start).
// No-ops gracefully when not configured, so the backend runs without InfluxDB.
const { InfluxDB, Point } = require('@influxdata/influxdb-client')

const URL = process.env.INFLUX_URL
const TOKEN = process.env.INFLUX_TOKEN
const ORG = process.env.INFLUX_ORG
const BUCKET = process.env.INFLUX_BUCKET
const DEVICE = process.env.INFLUX_DEVICE || 'clearlight'
const MEASUREMENT = process.env.INFLUX_MEASUREMENT || 'sauna'
const SAMPLE_INTERVAL_MS = Number(process.env.INFLUX_SAMPLE_INTERVAL_MS) || 15000

const configured = Boolean(URL && TOKEN && ORG && BUCKET)

let writeApi = null
if (configured) {
	const client = new InfluxDB({ url: URL, token: TOKEN })
	// Batch writes; flush at least every sample interval so points land promptly.
	writeApi = client.getWriteApi(ORG, BUCKET, 'ms', {
		flushInterval: SAMPLE_INTERVAL_MS,
		batchSize: 20,
		maxRetries: 3
	})
	writeApi.useDefaultTags({ device: DEVICE })
}

let lastWrite = 0

// Record one sample of device state. Throttled to SAMPLE_INTERVAL_MS, except
// when force=true (e.g. power_flag / pre-heat toggled) so session starts and
// stops are always captured for accurate heat-up timing.
function logSaunaPoint(data, { force = false } = {}) {
	if (!writeApi || data == null) return
	const now = Date.now()
	if (!force && now - lastWrite < SAMPLE_INTERVAL_MS) return
	lastWrite = now

	const point = new Point(MEASUREMENT)
	if (Number.isFinite(data.CURRENT_TEMP)) point.intField('current_temp', data.CURRENT_TEMP)
	if (Number.isFinite(data.SET_TEMP)) point.intField('set_temp', data.SET_TEMP)
	point.booleanField('power_flag', Boolean(data.power_flag))
	point.booleanField('pre_time_flag', Boolean(data.PRE_TIME_FLAG))

	try {
		writeApi.writePoint(point)
	} catch (err) {
		// Never let logging disrupt device control.
	}
}

// Flush any buffered points (call on shutdown).
async function closeInflux() {
	if (!writeApi) return
	try {
		await writeApi.flush()
	} catch (err) {
		// best effort
	}
}

module.exports = { logSaunaPoint, closeInflux, configured }
