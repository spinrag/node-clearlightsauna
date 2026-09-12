const { describe, it } = require('mocha')
const { expect } = require('chai')

const { version, commit, resolveCommit } = require('../build-info')

describe('build-info', () => {
	it('exposes the package version', () => {
		expect(version).to.equal(require('../package.json').version)
	})

	it('resolves a non-empty commit', () => {
		expect(commit).to.be.a('string').and.not.be.empty
	})

	it('prefers an explicit GIT_COMMIT over reading the repo', () => {
		expect(resolveCommit({ GIT_COMMIT: 'deadbee' })).to.equal('deadbee')
	})

	it('trims whitespace from GIT_COMMIT', () => {
		expect(resolveCommit({ GIT_COMMIT: '  deadbee\n' })).to.equal('deadbee')
	})

	it('falls back to the repo commit when GIT_COMMIT is unset', () => {
		// No env override — either a real short SHA, or 'unknown' off a git deploy.
		expect(resolveCommit({})).to.match(/^[0-9a-f]{7,40}$|^unknown$/)
	})
})
