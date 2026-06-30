import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
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
			}
		}
	}
});
