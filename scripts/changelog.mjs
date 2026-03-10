#!/usr/bin/env node

/**
 * Update CHANGELOG.md automatically using commit-and-tag-version
 * (fork of standard-version — https://github.com/absolute-version/commit-and-tag-version)
 *
 * Groups commits by git tags and commit types to generate a changelog.
 *
 * Usage:
 *   node scripts/changelog.js
 *   node scripts/changelog.js --dry-run
 *   node scripts/changelog.js --first-release
 *   node scripts/changelog.js --release-as major
 *   node scripts/changelog.js --pre-release alpha
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import standardVersion from 'commit-and-tag-version'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
const preMajor = parseInt(pkg.version.split('.')[0], 10) < 1

const { values: args } = parseArgs({
	options: {
		'dry-run': { type: 'boolean', default: false },
		'skip-bump': { type: 'boolean', default: false },
		'skip-commit': { type: 'boolean', default: false },
		'skip-tag': { type: 'boolean', default: false },
		'first-release': { type: 'boolean', default: false },
		'pre-release': { type: 'string', default: '' },
		'release-as': { type: 'string', default: '' },
		'no-verify': { type: 'boolean', default: false },
		sign: { type: 'boolean', default: false }
	},
	strict: false
})

const commitTypes = [
	{ type: 'feat', section: '🚀🚀 Features' },
	{ type: 'feature', section: '🚀🚀 Features' },
	{ type: 'fix', section: '👽 Bug Fixes' },
	{ type: 'hotfix', section: '👽👽 Hot Fixes' },
	{ type: 'improvement', section: '🚀 Improvements' },
	{ type: 'improve', section: '🚀 Improvements' },
	{ type: 'test', section: '🌠 Tests' },
	{ type: 'build', section: '🌠 Build System' },
	{ type: 'ci', section: '🌠 CICD' },
	{ type: 'chore', section: '🛰️ Chore' },
	{ type: 'perf', section: '🛰️ Performance' },
	{ type: 'refactor', section: '🛰️ Refactor' },
	{ type: 'revert', section: '🛰️ Revert' },
	{ type: 'style', section: '🛰️ Style' },
	{ type: 'docs', section: '📝 Docs' },
	{ type: 'release', hidden: true }
]

const packageFiles = [
	{ filename: 'package.json', type: 'json' },
	{ filename: 'frontend/package.json', type: 'json' },
	{ filename: 'backend/package.json', type: 'json' }
]

const options = {
	dryRun: args['dry-run'],
	firstRelease: args['first-release'],
	noVerify: args['no-verify'],
	preRelease: args['pre-release'],
	releaseAs: args['release-as'],
	sign: args['sign'],
	skip: {
		bump: args['skip-bump'],
		commit: args['skip-commit'],
		tag: args['skip-tag']
	},
	header: '# Changelog\n',
	types: commitTypes,
	preMajor,
	packageFiles,
	bumpFiles: packageFiles,
	commitUrlFormat: '{{host}}/{{owner}}/{{repository}}/commit/{{hash}}',
	compareUrlFormat: '{{host}}/{{owner}}/{{repository}}/compare/{{previousTag}}...{{currentTag}}',
	issueUrlFormat: '{{host}}/{{owner}}/{{repository}}/issues/{{id}}',
	userUrlFormat: '{{host}}/{{user}}',
	releaseCommitMessageFormat: 'release(RELEASE): v{{currentTag}}',
	issuePrefixes: ['#']
}

standardVersion(options)
	.then(() => {
		console.log('Finished updating CHANGELOG.md')
	})
	.catch((err) => {
		console.error(`Update CHANGELOG.md failed with message: ${err.message}`)
		process.exit(1)
	})
