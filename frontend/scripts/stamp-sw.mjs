// Stamps the built service worker's cache version with the app version and
// commit.
//
// The service worker lives in static/, which Vite copies verbatim, so it cannot
// pick up build-time defines the way the app bundle does. Without this the
// version is a hand-edited constant — and a deploy that forgets to bump it ships
// a byte-identical worker, which the browser treats as "no update": the old
// worker stays active, keeps serving its cached shell, and clients never get the
// update banner.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = '__BUILD_VERSION__';
const swPath = fileURLToPath(new URL('../build/client/service-worker.js', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function commit() {
	if (process.env.GIT_COMMIT) {
		return process.env.GIT_COMMIT.trim();
	}
	try {
		return execSync('git rev-parse --short HEAD', {
			cwd: fileURLToPath(new URL('../..', import.meta.url)),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return 'unknown';
	}
}

const source = readFileSync(swPath, 'utf8');

if (!source.includes(PLACEHOLDER)) {
	// Fail loudly: silently shipping an unstamped worker is the exact bug this
	// script exists to prevent.
	console.error(`stamp-sw: ${PLACEHOLDER} not found in ${swPath} — was it already stamped?`);
	process.exit(1);
}

const version = `${pkg.version}-${commit()}`;
writeFileSync(swPath, source.replaceAll(PLACEHOLDER, version));
console.log(`stamp-sw: cache version ${version}`);
