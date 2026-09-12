// build-info.js — identifies the running build for GET /health.
//
// Resolved once, at require time, so /health reports the code that is actually
// running: a later `git pull` without a restart must not change the answer.
const { execSync } = require('child_process')
const path = require('path')

const { version } = require('./package.json')

// Deploys that ship a tarball (or a container) have no .git to read, so an
// explicit GIT_COMMIT wins; reading the repo is the fallback for a git deploy.
function resolveCommit(env = process.env) {
	if (env.GIT_COMMIT) {
		return env.GIT_COMMIT.trim()
	}
	try {
		return execSync('git rev-parse --short HEAD', {
			cwd: path.join(__dirname, '..'),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim()
	} catch {
		return 'unknown'
	}
}

module.exports = { version, commit: resolveCommit(), resolveCommit }
