// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Injected at build time by `define` in vite.config.js.
	const __APP_VERSION__: string;
	const __GIT_COMMIT__: string;
}

export {};
