const { describe, it } = require('mocha')
const { expect } = require('chai')
const { validateControlPayload } = require('../validation')

describe('validateControlPayload', () => {

	describe('rejects invalid shapes', () => {
		it('rejects null', () => {
			const result = validateControlPayload(null)
			expect(result.valid).to.equal(false)
			expect(result.errors[0]).to.match(/non-null object/)
		})

		it('rejects arrays', () => {
			const result = validateControlPayload([1, 2])
			expect(result.valid).to.equal(false)
		})

		it('rejects strings', () => {
			const result = validateControlPayload('hello')
			expect(result.valid).to.equal(false)
		})

		it('rejects empty object', () => {
			const result = validateControlPayload({})
			expect(result.valid).to.equal(false)
			expect(result.errors[0]).to.match(/at least one key/)
		})
	})

	describe('rejects unknown keys', () => {
		it('rejects a single unknown key', () => {
			const result = validateControlPayload({ FAKE_KEY: true })
			expect(result.valid).to.equal(false)
			expect(result.errors[0]).to.match(/Unknown key/)
		})

		it('rejects when mix of valid and unknown keys', () => {
			const result = validateControlPayload({ power_flag: true, HACK: 99 })
			expect(result.valid).to.equal(false)
			expect(result.errors).to.have.lengthOf(1)
			expect(result.errors[0]).to.include('HACK')
		})
	})

	describe('boolean flags', () => {
		const boolKeys = ['EXTERNAL_LIGHT', 'INTERNAL_LIGHT', 'PRE_TIME_FLAG', 'power_flag', 'cf_flag', 'UVB_FLAG', 'N_FLAG']

		for (const key of boolKeys) {
			it(`accepts ${key} as true`, () => {
				const result = validateControlPayload({ [key]: true })
				expect(result.valid).to.equal(true)
				expect(result.payload[key]).to.equal(true)
			})

			it(`accepts ${key} as false`, () => {
				const result = validateControlPayload({ [key]: false })
				expect(result.valid).to.equal(true)
				expect(result.payload[key]).to.equal(false)
			})

			it(`rejects ${key} as number`, () => {
				const result = validateControlPayload({ [key]: 1 })
				expect(result.valid).to.equal(false)
				expect(result.errors[0]).to.match(/boolean/)
			})

			it(`rejects ${key} as string`, () => {
				const result = validateControlPayload({ [key]: 'true' })
				expect(result.valid).to.equal(false)
			})
		}
	})

	describe('numeric ranges', () => {
		const ranges = {
			SET_TEMP: [60, 180],
			SET_HOUR: [0, 23],
			SET_MINUTE: [0, 60],
			PRE_TIME_HOUR: [0, 23],
			PRE_TIME_MINUTE: [0, 59],
			LEFT: [0, 255],
			RIGHT: [0, 255],
			LED: [0, 255],
		}

		for (const [key, [min, max]] of Object.entries(ranges)) {
			it(`accepts ${key} at minimum (${min})`, () => {
				const result = validateControlPayload({ [key]: min })
				expect(result.valid).to.equal(true)
				expect(result.payload[key]).to.equal(min)
			})

			it(`accepts ${key} at maximum (${max})`, () => {
				const result = validateControlPayload({ [key]: max })
				expect(result.valid).to.equal(true)
				expect(result.payload[key]).to.equal(max)
			})

			it(`rejects ${key} below minimum (${min - 1})`, () => {
				const result = validateControlPayload({ [key]: min - 1 })
				expect(result.valid).to.equal(false)
				expect(result.errors[0]).to.match(/between/)
			})

			it(`rejects ${key} above maximum (${max + 1})`, () => {
				const result = validateControlPayload({ [key]: max + 1 })
				expect(result.valid).to.equal(false)
			})

			it(`rejects ${key} as float`, () => {
				const result = validateControlPayload({ [key]: min + 0.5 })
				expect(result.valid).to.equal(false)
				expect(result.errors[0]).to.match(/integer/)
			})

			it(`rejects ${key} as string`, () => {
				const result = validateControlPayload({ [key]: '100' })
				expect(result.valid).to.equal(false)
			})

			it(`rejects ${key} as boolean`, () => {
				const result = validateControlPayload({ [key]: true })
				expect(result.valid).to.equal(false)
			})
		}
	})

	describe('mixed payloads', () => {
		it('accepts a valid mixed payload', () => {
			const result = validateControlPayload({
				power_flag: true,
				SET_TEMP: 120,
				EXTERNAL_LIGHT: false,
				LED: 128,
			})
			expect(result.valid).to.equal(true)
			expect(result.payload).to.deep.equal({
				power_flag: true,
				SET_TEMP: 120,
				EXTERNAL_LIGHT: false,
				LED: 128,
			})
		})

		it('collects multiple errors', () => {
			const result = validateControlPayload({
				SET_TEMP: 999,
				FAKE: true,
				power_flag: 'yes',
			})
			expect(result.valid).to.equal(false)
			expect(result.errors).to.have.lengthOf(3)
		})
	})
})
