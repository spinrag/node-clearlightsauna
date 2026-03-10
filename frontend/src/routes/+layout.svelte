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

		navigator.serviceWorker
			.register('/service-worker.js')
			.then((registration) => {
				// Check for updates periodically
				setInterval(() => registration.update(), 60 * 1000);
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
	});
</script>

{#if updateAvailable}
	<div class="fixed top-0 left-0 right-0 bg-blue-600 text-white text-center py-2 px-4 z-50">
		<span>A new version is available.</span>
		<button type="button" class="ml-2 underline font-semibold" onclick={reloadApp}> Reload </button>
	</div>
{/if}

{@render children()}
