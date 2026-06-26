const { describe, it } = require('mocha')
const { expect } = require('chai')

// Guard the graceful-degradation contract: with no INFLUX_* env set, the module
// must report unconfigured and every entry point must be a safe no-op so the
// backend runs normally for users who don't use InfluxDB.
for (const k of ['INFLUX_URL', 'INFLUX_TOKEN', 'INFLUX_ORG', 'INFLUX_BUCKET']) delete process.env[k]
delete require.cache[require.resolve('../influx')]
const influx = require('../influx')

describe('influx (unconfigured)', () => {
	it('reports not configured when INFLUX_* env is absent', () => {
		expect(influx.configured).to.equal(false)
	})

	it('logSaunaPoint is a no-op and never throws', () => {
		expect(() =>
			influx.logSaunaPoint({ CURRENT_TEMP: 100, SET_TEMP: 150, power_flag: true, PRE_TIME_FLAG: false })
		).to.not.throw()
		expect(() => influx.logSaunaPoint({}, { force: true })).to.not.throw()
		expect(() => influx.logSaunaPoint(null)).to.not.throw()
	})

	it('closeInflux resolves without error', async () => {
		await influx.closeInflux()
	})
})
