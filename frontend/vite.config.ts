import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Baked in at build time: the built bundle is the artifact that ships, so it has
// to carry the commit it was built from rather than read git when it runs.
function gitCommit(): string {
	if (process.env.GIT_COMMIT) {
		return process.env.GIT_COMMIT.trim();
	}
	try {
		return execSync('git rev-parse --short HEAD', {
			cwd: fileURLToPath(new URL('..', import.meta.url)),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return 'unknown';
	}
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__GIT_COMMIT__: JSON.stringify(gitCommit())
	},
	preview: {
		host: '0.0.0.0',
		port: Number(process.env.PORT) || 8099
	},
	server: {
		host: '0.0.0.0',
		port: Number(process.env.PORT) || 8099,
		proxy: {
			'/api': {
				target: 'http://localhost:3000', // Express server URL
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, '')
			},
			// Mirrors the production nginx route so dev is same-origin too.
			'/socket.io': {
				target: 'http://localhost:3000',
				changeOrigin: true,
				ws: true
			}
		}
	}
});
