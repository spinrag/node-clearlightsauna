<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { socket } from '$lib/socket';

	import RoundButton from '$lib/components/toggleButton.svelte';
	import StepButton from '$lib/components/stepButton.svelte';
	import NotificationPanel from '$lib/components/notificationPanel.svelte';
	import { faPowerOff, faLightbulb, faClock } from '@fortawesome/free-solid-svg-icons';

	interface SaunaStatus {
		EXTERNAL_LIGHT: boolean;
		INTERNAL_LIGHT: boolean;
		PRE_TIME_FLAG: boolean;
		power_flag: boolean;
		cf_flag: boolean;
		UVB_FLAG: boolean; // AUX Control
		N_FLAG: boolean;
		LED: number;
		RIGHT: number;
		LEFT: number;
		SET_TEMP: number;
		SET_HOUR: number;
		SET_MINUTE: number;
		PRE_TIME_HOUR: number;
		PRE_TIME_MINUTE: number;
		SN: number;
		CURRENT_TEMP: number;
		heart_pulse: number;
	}

	let status = $state<SaunaStatus>({
		EXTERNAL_LIGHT: false,
		INTERNAL_LIGHT: false,
		PRE_TIME_FLAG: false,
		power_flag: false,
		cf_flag: false,
		UVB_FLAG: false,
		N_FLAG: false,
		LED: 0,
		RIGHT: 0,
		LEFT: 0,
		SET_TEMP: 0,
		SET_HOUR: 0,
		SET_MINUTE: 0,
		PRE_TIME_HOUR: 0,
		PRE_TIME_MINUTE: 0,
		SN: 0,
		CURRENT_TEMP: 0,
		heart_pulse: 0
	});

	const devMode = import.meta.env.VITE_DEV_MODE === 'true';
	if (devMode) console.log('devMode active', devMode);

	// Connection state. 'connecting' is deliberately distinct from 'offline': both
	// used to be `serverConnected === false`, so a first load announced "cannot
	// reach backend" before a connection had even been attempted.
	type Link = 'connecting' | 'online' | 'offline';
	let link = $state<Link>('connecting');
	let deviceConnected = $state(false);

	// Whether a reading has actually arrived. The defaults above are zeroes, and
	// rendering those as "0°F" reports a temperature the sauna never sent.
	let statusReceived = $state(false);

	// How long a first connection may take before it is reported as failed. A
	// blocked websocket falls back to polling, which is slower but still works.
	const CONNECT_GRACE_MS = 6000;
	let graceTimer: ReturnType<typeof setTimeout> | undefined;

	// Pre-heat (delayed start). The delay is composed locally before arming, then
	// sent to the backend which arms the device and runs a fallback watchdog.
	interface PreheatSchedule {
		targetAt: number;
		setTemp: number;
		setMinute: number;
	}
	let preheatSchedule = $state<PreheatSchedule | null>(null);
	let preHour = $state(0);
	let preMinute = $state(0);
	let preheatError = $state('');
	let preheatEditing = $state(false);
	let preheatPending = $state(false);
	const preheatActive = $derived(!!preheatSchedule || status.PRE_TIME_FLAG);

	function toggleAttribute(attribute: keyof SaunaStatus) {
		socket.emit('control', { [attribute]: !status[attribute] });
	}

	function setTemperature(value: number) {
		const MIN_TEMP = 60;
		const MAX_TEMP = 180;
		const newTemp = status.SET_TEMP + value;

		if (newTemp >= MIN_TEMP && newTemp <= MAX_TEMP) {
			socket.emit('control', { SET_TEMP: newTemp });
		}
	}

	function getTemperatureColor(temp: number) {
		if (temp < 80) return 'bg-blue-500';
		if (temp < 100) return 'bg-green-500';
		if (temp < 120) return 'bg-yellow-500';
		return 'bg-red-500';
	}

	// Adjust session time in minutes (0–60). The physical sauna controls only
	// support a single 0–60 minute range with no hour component, so SET_HOUR
	// is intentionally omitted here.
	function adjustTime(change: number) {
		const newMinute = Math.max(0, Math.min(60, status.SET_MINUTE + change));
		socket.emit('control', { SET_MINUTE: newMinute });
	}

	// Adjust the pre-heat delay locally (0:00–23:59) via separate hour/minute
	// controls. Nothing is sent to the device until the user hits Confirm.
	function adjustDelay(deltaMinutes: number) {
		const MAX = 23 * 60 + 59;
		const total = Math.max(0, Math.min(MAX, preHour * 60 + preMinute + deltaMinutes));
		preHour = Math.floor(total / 60);
		preMinute = total % 60;
		preheatError = '';
	}
	const adjustHour = (h: number) => adjustDelay(h * 60);
	const adjustMinute = (m: number) => adjustDelay(m);

	// Projected start time from the locally-composed delay (shown before arming).
	function calculateStartTime() {
		const now = new Date();
		const startTime = new Date(now.getTime() + (preHour * 60 + preMinute) * 60 * 1000);
		return startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	// Confirmed start time once armed (from the backend schedule).
	function scheduledStartTime() {
		if (!preheatSchedule) return '';
		return new Date(preheatSchedule.targetAt).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Tapping the Pre-Heat button: if armed, cancel; otherwise just open/close the
	// editor. Arming only happens when the user hits Confirm.
	function togglePreheat() {
		if (preheatPending) return;
		if (preheatActive) {
			cancelArmedPreheat();
			return;
		}
		preheatEditing = !preheatEditing;
		preheatError = '';
	}

	// Arming sends six settings to the device ~900ms apart (the hardware drops
	// back-to-back writes), so it takes a few seconds. Update the UI immediately
	// ("Arming…") and reconcile when the backend acks / broadcasts the schedule.
	function confirmPreheat() {
		if (preHour * 60 + preMinute <= 0) {
			preheatError = 'Set a delay greater than zero.';
			return;
		}
		preheatError = '';
		preheatEditing = false;
		preheatPending = true;
		socket.emit(
			'armPreheat',
			{ hours: preHour, minutes: preMinute, temp: status.SET_TEMP },
			(resp: { status: string; errors?: string[] }) => {
				preheatPending = false;
				if (resp?.status === 'error') {
					preheatError = (resp.errors || ['Could not arm pre-heat']).join('; ');
					preheatEditing = true;
				}
			}
		);
	}

	function cancelArmedPreheat() {
		preheatPending = false;
		socket.emit('cancelPreheat', () => {});
		preheatEditing = false;
	}

	function padTwo(n: number) {
		return String(n).padStart(2, '0');
	}

	function onConnected() {
		if (devMode) console.log('socket connected');
		clearTimeout(graceTimer);
		link = 'online';
		socket.emit('requestStatus');
	}

	function onDisconnected() {
		if (devMode) console.log('socket disconnected');
		// A drop after we were online is a real failure, so report it immediately
		// rather than waiting out the first-connection grace period again.
		link = 'offline';
		deviceConnected = false;
	}

	function onDeviceStatus(s: { connected: boolean }) {
		deviceConnected = s.connected;
	}

	function onAttributes(incoming: Partial<SaunaStatus>) {
		if (devMode) console.log('status', incoming);
		Object.assign(status, incoming);
		// The backend emits an empty `attributes` payload while the sauna is
		// offline. That carries no reading, so it must not end the loading state —
		// doing so would put the zeroed defaults back on screen as "0°F".
		if (Object.keys(incoming).length > 0) statusReceived = true;
	}

	function onPreheatSchedule(s: PreheatSchedule | null) {
		if (devMode) console.log('preheatSchedule', s);
		preheatSchedule = s;
	}

	onMount(() => {
		socket.on('connect', onConnected);
		socket.on('disconnect', onDisconnected);
		socket.on('deviceStatus', onDeviceStatus);
		socket.on('attributes', onAttributes);
		socket.on('preheatSchedule', onPreheatSchedule);

		// Report failure only once a first connection has had time to complete;
		// until then the honest state is "connecting", not "unreachable".
		graceTimer = setTimeout(() => {
			if (link === 'connecting') link = 'offline';
		}, CONNECT_GRACE_MS);

		// Socket.IO may already be connected by the time onMount fires,
		// meaning we missed the initial connect + deviceStatus events.
		if (socket.connected) {
			clearTimeout(graceTimer);
			link = 'online';
			socket.emit('requestStatus');
		}
	});

	onDestroy(() => {
		clearTimeout(graceTimer);
		socket.off('connect', onConnected);
		socket.off('disconnect', onDisconnected);
		socket.off('deviceStatus', onDeviceStatus);
		socket.off('attributes', onAttributes);
		socket.off('preheatSchedule', onPreheatSchedule);
	});
</script>

<div class="flex flex-col items-center min-h-screen bg-gray-800 text-white p-6">
	<h1 class="text-3xl font-bold mb-6">Clearlight Sauna Control</h1>

	<div class="flex space-x-4">
		<RoundButton
			icon={faPowerOff}
			label="Power"
			onToggle={() => toggleAttribute('power_flag')}
			active={status.power_flag}
		/>
		<RoundButton
			icon={faLightbulb}
			label="External Light"
			onToggle={() => toggleAttribute('EXTERNAL_LIGHT')}
			active={status.EXTERNAL_LIGHT}
		/>
		<RoundButton
			icon={faLightbulb}
			label="Internal Light"
			onToggle={() => toggleAttribute('INTERNAL_LIGHT')}
			active={status.INTERNAL_LIGHT}
		/>
		<RoundButton
			icon={faPowerOff}
			label="AUX"
			onToggle={() => toggleAttribute('UVB_FLAG')}
			active={status.UVB_FLAG}
		/>
	</div>

	<!-- Temperature Displays -->
	<div class="flex space-x-16 mb-8 mt-6">
		<!-- Current Temperature -->
		<div class="flex flex-col items-center">
			<div class="text-lg font-semibold">Current</div>
			<div
				class={`flex items-center justify-center text-white rounded-full w-24 h-24 mt-2 text-2xl font-bold shadow-lg ${
					statusReceived ? getTemperatureColor(status.CURRENT_TEMP) : 'bg-gray-600 animate-pulse'
				}`}
			>
				{statusReceived ? `${status.CURRENT_TEMP}°F` : '—'}
			</div>
		</div>

		<!-- Set Temperature with Up/Down Controls -->
		<div class="flex flex-col items-center">
			<div class="text-lg font-semibold">Set Temperature</div>
			<div class="flex items-center mt-2">
				<div class="flex flex-col space-y-2 mr-4">
					<StepButton
						direction="up"
						onPress={() => setTemperature(1)}
						onHold={() => setTemperature(5)}
					/>
					<StepButton
						direction="down"
						onPress={() => setTemperature(-1)}
						onHold={() => setTemperature(-5)}
					/>
				</div>
				<div
					class={`flex items-center justify-center text-white rounded-full w-24 h-24 text-2xl font-bold shadow-lg ${
						statusReceived ? getTemperatureColor(status.SET_TEMP) : 'bg-gray-600 animate-pulse'
					}`}
				>
					{statusReceived ? `${status.SET_TEMP}°F` : '—'}
				</div>
			</div>
		</div>
	</div>

	<!-- Session Time with Up/Down Controls -->
	<div class="flex flex-col items-center mb-8">
		<div class="text-lg font-semibold">Set Time</div>
		<div class="flex items-center mt-2">
			<div class="flex flex-col space-y-2 mr-4">
				<StepButton direction="up" onPress={() => adjustTime(1)} onHold={() => adjustTime(5)} />
				<StepButton direction="down" onPress={() => adjustTime(-1)} onHold={() => adjustTime(-5)} />
			</div>
			<div
				class="flex items-center justify-center text-white rounded-full w-24 h-24 text-2xl font-bold shadow-lg bg-gray-700"
			>
				{padTwo(status.SET_HOUR)}:{padTwo(status.SET_MINUTE)}
			</div>
		</div>
	</div>

	<!-- Pre-Heat (delayed start): tap to open, set hours/minutes, then Confirm -->
	<div class="flex flex-col items-center mb-8">
		<RoundButton
			icon={faClock}
			label="Pre-Heat"
			onToggle={togglePreheat}
			active={preheatActive || preheatEditing || preheatPending}
		/>

		{#if preheatPending && !preheatActive}
			<div class="mt-4 flex items-center space-x-2 text-gray-300">
				<span
					class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-white"
				></span>
				<span>Arming… sending settings to the sauna</span>
			</div>
		{:else if preheatActive}
			<div class="mt-4 text-center">
				<div class="text-lg font-semibold">Scheduled start: {scheduledStartTime()}</div>
				{#if status.PRE_TIME_FLAG && (status.PRE_TIME_HOUR || status.PRE_TIME_MINUTE)}
					<div class="text-sm text-gray-300">
						Device timer: {padTwo(status.PRE_TIME_HOUR)}:{padTwo(status.PRE_TIME_MINUTE)} remaining
					</div>
				{/if}
				<button
					class="mt-3 rounded-md bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-600"
					onclick={cancelArmedPreheat}
				>
					Cancel Pre-Heat
				</button>
			</div>
		{:else if preheatEditing}
			<div class="mt-4 flex flex-col items-center">
				<div class="mb-2 text-sm text-gray-300">Delay before the sauna turns on</div>
				<div class="flex items-end space-x-6">
					<div class="flex flex-col items-center space-y-2">
						<StepButton
							direction="up"
							onPress={() => adjustHour(1)}
							onHold={() => adjustHour(1)}
							holdInterval={300}
						/>
						<div class="w-16 text-center text-3xl font-bold">{padTwo(preHour)}</div>
						<StepButton
							direction="down"
							onPress={() => adjustHour(-1)}
							onHold={() => adjustHour(-1)}
							holdInterval={300}
						/>
						<div class="text-xs text-gray-400">hours</div>
					</div>
					<div class="pb-10 text-3xl font-bold">:</div>
					<div class="flex flex-col items-center space-y-2">
						<StepButton
							direction="up"
							onPress={() => adjustMinute(1)}
							onHold={() => adjustMinute(15)}
							holdInterval={450}
						/>
						<div class="w-16 text-center text-3xl font-bold">{padTwo(preMinute)}</div>
						<StepButton
							direction="down"
							onPress={() => adjustMinute(-1)}
							onHold={() => adjustMinute(-15)}
							holdInterval={450}
						/>
						<div class="text-xs text-gray-400">min · hold ±15</div>
					</div>
				</div>

				<div class="mt-4 text-lg font-semibold">
					{#if preHour * 60 + preMinute > 0}
						Starts at {calculateStartTime()}
					{:else}
						Set a delay
					{/if}
				</div>

				<div class="mt-4 flex space-x-3">
					<button
						class="rounded-md bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
						onclick={confirmPreheat}
						disabled={preHour * 60 + preMinute <= 0}
					>
						Confirm
					</button>
					<button
						class="rounded-md bg-gray-600 px-5 py-2 text-white hover:bg-gray-500"
						onclick={togglePreheat}
					>
						Cancel
					</button>
				</div>

				{#if preheatError}
					<div class="mt-2 text-sm text-red-400">{preheatError}</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Notification -->
	<NotificationPanel currentTemp={status.CURRENT_TEMP} />

	{#if devMode}
		<pre class="bg-white text-gray-800 p-4 rounded-md shadow-md mt-4">
			{JSON.stringify(status, null, 2)}
		</pre>
	{/if}
</div>

{#if link === 'connecting'}
	<div
		class="fixed bottom-10 left-0 right-0 bg-slate-600 text-white text-center py-2 px-4 flex items-center justify-center gap-2"
		role="status"
		aria-live="polite"
	>
		<span
			class="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin"
			aria-hidden="true"
		></span>
		Connecting to backend…
	</div>
{:else if link === 'offline'}
	<div
		class="fixed bottom-10 left-0 right-0 bg-red-700 text-white text-center py-2 px-4"
		role="status"
		aria-live="polite"
	>
		Cannot reach backend — controls unavailable
	</div>
{:else if !deviceConnected}
	<div
		class="fixed bottom-10 left-0 right-0 bg-yellow-600 text-white text-center py-2 px-4 flex items-center justify-center gap-2"
		role="status"
		aria-live="polite"
	>
		<span
			class="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin"
			aria-hidden="true"
		></span>
		Backend connected — waiting for sauna
	</div>
{/if}

<div
	class="fixed bottom-0 left-0 right-0 bg-gray-900 text-gray-400 text-xs py-1 px-4 flex justify-center gap-4"
>
	<span class="flex items-center gap-1">
		<span
			class="inline-block w-2 h-2 rounded-full {link === 'online'
				? 'bg-green-500'
				: link === 'connecting'
					? 'bg-amber-500 animate-pulse'
					: 'bg-red-500'}"
		></span>
		Backend
	</span>
	<span class="flex items-center gap-1">
		<span
			class="inline-block w-2 h-2 rounded-full {deviceConnected
				? 'bg-green-500'
				: link === 'offline'
					? 'bg-red-500'
					: 'bg-amber-500 animate-pulse'}"
		></span>
		Sauna
	</span>
</div>
