<script lang="ts">
	import {
		subscribeToPush,
		unsubscribeFromPush,
		setThreshold,
		getExistingSubscription,
		getSubscriptionStatus
	} from '$lib/pushSubscription';
	import { onMount } from 'svelte';
	import StepButton from './stepButton.svelte';

	let {
		currentTemp = 0
	}: {
		currentTemp?: number;
	} = $props();

	const MIN_THRESHOLD = 80;
	const MAX_THRESHOLD = 180;
	const STEP = 5;

	let subscription = $state<PushSubscription | null>(null);
	let thresholdTemp = $state<number | null>(null);
	let expanded = $state(false);
	let permissionDenied = $state(false);
	let busy = $state(false);

	onMount(async () => {
		const existing = await getExistingSubscription();
		if (existing) {
			subscription = existing;
			const status = await getSubscriptionStatus(existing.endpoint);
			if (status) {
				thresholdTemp = status.threshold_temp;
			}
		}
	});

	async function handleBellClick() {
		if (busy) return;

		if (subscription) {
			expanded = !expanded;
			return;
		}

		busy = true;
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				permissionDenied = true;
				return;
			}

			const sub = await subscribeToPush();
			if (sub) {
				subscription = sub;
				expanded = true;
			}
		} finally {
			busy = false;
		}
	}

	async function adjustThreshold(change: number) {
		if (!subscription || busy) return;

		const current = thresholdTemp ?? MIN_THRESHOLD;
		const next = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, current + change));

		busy = true;
		try {
			const ok = await setThreshold(subscription.endpoint, next);
			if (ok) {
				thresholdTemp = next;
			}
		} finally {
			busy = false;
		}
	}

	async function disableNotification() {
		if (!subscription || busy) return;

		busy = true;
		try {
			await setThreshold(subscription.endpoint, null);
			thresholdTemp = null;
		} finally {
			busy = false;
		}
	}

	async function handleUnsubscribe() {
		if (!subscription || busy) return;

		busy = true;
		try {
			await unsubscribeFromPush(subscription);
			subscription = null;
			thresholdTemp = null;
			expanded = false;
		} finally {
			busy = false;
		}
	}

	function bellColor(): string {
		if (!subscription || thresholdTemp == null) return 'text-gray-400';
		if (currentTemp >= thresholdTemp) return 'text-green-400';
		return 'text-yellow-400';
	}
</script>

<!-- Collapsed: bell + inline label -->
{#if !expanded || !subscription}
	<div class="flex items-center gap-2 mt-2 mb-0">
		<button
			class="w-10 h-10 rounded-full flex items-center justify-center bg-gray-700 hover:bg-gray-600 transition-colors {bellColor()}"
			aria-label={thresholdTemp != null
				? `Notification set at ${thresholdTemp}°F`
				: 'Set temperature notification'}
			onclick={handleBellClick}
			disabled={busy}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="w-5 h-5"
				fill="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					d="M12 2C10.9 2 10 2.9 10 4c0 .35.1.67.25.95C7.84 5.88 6 8.17 6 11v5l-2 2v1h16v-1l-2-2v-5c0-2.83-1.84-5.12-4.25-6.05.15-.28.25-.6.25-.95 0-1.1-.9-2-2-2zm0 20c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2z"
				/>
			</svg>
		</button>
		{#if permissionDenied}
			<span class="text-red-400 text-sm">Blocked</span>
		{:else if thresholdTemp != null}
			<span class="text-sm {bellColor()}">Notify at {thresholdTemp}°F</span>
		{:else if subscription}
			<span class="text-sm text-gray-500">Notify: Off</span>
		{/if}
	</div>
{/if}

<!-- Expanded: single row — bell | steppers | threshold °F | action buttons -->
{#if expanded && subscription}
	<div class="flex items-center gap-3 mt-2 mb-0">
		<!-- Bell toggle (collapse) -->
		<button
			class="w-10 h-10 rounded-full flex items-center justify-center bg-gray-700 hover:bg-gray-600 transition-colors {bellColor()}"
			aria-label="Close notification settings"
			onclick={() => (expanded = false)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="w-5 h-5"
				fill="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					d="M12 2C10.9 2 10 2.9 10 4c0 .35.1.67.25.95C7.84 5.88 6 8.17 6 11v5l-2 2v1h16v-1l-2-2v-5c0-2.83-1.84-5.12-4.25-6.05.15-.28.25-.6.25-.95 0-1.1-.9-2-2-2zm0 20c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2z"
				/>
			</svg>
		</button>

		<!-- Step buttons -->
		<div class="flex flex-col space-y-1">
			<StepButton
				direction="up"
				onPress={() => adjustThreshold(STEP)}
				onHold={() => adjustThreshold(STEP)}
			/>
			<StepButton
				direction="down"
				onPress={() => adjustThreshold(-STEP)}
				onHold={() => adjustThreshold(-STEP)}
			/>
		</div>

		<!-- Threshold display -->
		<div
			class="flex items-center justify-center text-white rounded-full w-16 h-16 text-lg font-bold shadow-lg bg-gray-700"
		>
			{#if thresholdTemp != null}
				{thresholdTemp}°F
			{:else}
				Off
			{/if}
		</div>

		<!-- Stacked action buttons -->
		<div class="flex flex-col space-y-1">
			<button
				class="text-xs px-2 py-1 rounded bg-gray-600 hover:bg-gray-500 text-gray-300"
				onclick={disableNotification}
				disabled={busy || thresholdTemp == null}
			>
				Disable
			</button>
			<button
				class="text-xs px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-gray-300"
				onclick={handleUnsubscribe}
				disabled={busy}
			>
				Unsub
			</button>
		</div>
	</div>
{/if}
