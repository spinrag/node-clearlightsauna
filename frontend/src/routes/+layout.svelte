<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	let { children } = $props();

	let updateAvailable = $state(false);

	function reloadApp() {
		window.location.reload();
	}

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;

		let poll: ReturnType<typeof setInterval> | undefined;

		navigator.serviceWorker
			.register('/service-worker.js')
			.then((registration) => {
				// A worker already parked in "waiting" means an update downloaded but
				// never took control. The SW_UPDATED message below cannot arrive in that
				// state, because it is sent from activate — so detect it directly rather
				// than leaving the update silently unoffered.
				if (registration.waiting) updateAvailable = true;

				registration.addEventListener('updatefound', () => {
					const installing = registration.installing;
					if (!installing) return;
					installing.addEventListener('statechange', () => {
						// 'installed' while a controller exists means this page is running
						// the previous version and a newer one is ready.
						if (installing.state === 'installed' && navigator.serviceWorker.controller) {
							updateAvailable = true;
						}
					});
				});

				// Check for updates periodically
				poll = setInterval(() => registration.update(), 60 * 1000);
			})
			.catch((error) => {
				console.error('Service Worker registration failed:', error);
			});

		// Listen for update notifications from the service worker
		navigator.serviceWorker.addEventListener('message', (event) => {
			if (event.data?.type === 'SW_UPDATED') {
				updateAvailable = true;
			}
		});

		return () => clearInterval(poll);
	});
</script>

{#if updateAvailable}
	<div class="fixed top-0 left-0 right-0 bg-blue-600 text-white text-center py-2 px-4 z-50">
		<span>A new version is available.</span>
		<button type="button" class="ml-2 underline font-semibold" onclick={reloadApp}> Reload </button>
	</div>
{/if}

{@render children()}
