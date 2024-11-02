import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import dotenv from 'dotenv'

export default defineConfig({
	plugins: [sveltekit()],
	preview: {
		host: '0.0.0.0',
		port: process.env.PORT || 8099
	},
	server: {
		host: '0.0.0.0',
		port: process.env.PORT || 8099,
		proxy: {
			'/api': {
				target: 'http://localhost:3000', // Express server URL
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, '')
			}
		}
	}
})
