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

	// Connection state
	let serverConnected = $state(false);
	let deviceConnected = $state(false);

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

	function adjustPreTime(change: number) {
		let newMinute = status.PRE_TIME_MINUTE + change;
		let newHour = status.PRE_TIME_HOUR;

		if (newMinute >= 60) {
			newMinute = 0;
			newHour = (newHour + 1) % 24;
		} else if (newMinute < 0) {
			newMinute = change === -1 ? 59 : 60 + change;
			newHour = (newHour - 1 + 24) % 24;
		}

		socket.emit('control', {
			PRE_TIME_HOUR: newHour,
			PRE_TIME_MINUTE: newMinute
		});
	}

	function calculateStartTime() {
		const now = new Date();
		const startTime = new Date(
			now.getTime() + status.PRE_TIME_HOUR * 60 * 60 * 1000 + status.PRE_TIME_MINUTE * 60 * 1000
		);
		return startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function padTwo(n: number) {
		return String(n).padStart(2, '0');
	}

	function onConnected() {
		if (devMode) console.log('socket connected');
		serverConnected = true;
		socket.emit('requestStatus');
	}

	function onDisconnected() {
		if (devMode) console.log('socket disconnected');
		serverConnected = false;
		deviceConnected = false;
	}

	function onDeviceStatus(s: { connected: boolean }) {
		deviceConnected = s.connected;
	}

	function onAttributes(incoming: Partial<SaunaStatus>) {
		if (devMode) console.log('status', incoming);
		Object.assign(status, incoming);
	}

	onMount(() => {
		socket.on('connect', onConnected);
		socket.on('disconnect', onDisconnected);
		socket.on('deviceStatus', onDeviceStatus);
		socket.on('attributes', onAttributes);

		// Socket.IO may already be connected by the time onMount fires,
		// meaning we missed the initial connect + deviceStatus events.
		if (socket.connected) {
			serverConnected = true;
			socket.emit('requestStatus');
		}
	});

	onDestroy(() => {
		socket.off('connect', onConnected);
		socket.off('disconnect', onDisconnected);
		socket.off('deviceStatus', onDeviceStatus);
		socket.off('attributes', onAttributes);
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
				class={`flex items-center justify-center text-white rounded-full w-24 h-24 mt-2 text-2xl font-bold shadow-lg ${getTemperatureColor(status.CURRENT_TEMP)}`}
			>
				{status.CURRENT_TEMP}°F
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
					class={`flex items-center justify-center text-white rounded-full w-24 h-24 text-2xl font-bold shadow-lg ${getTemperatureColor(status.SET_TEMP)}`}
				>
					{status.SET_TEMP}°F
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

	<!-- Pre-Time Settings -->
	<div class="flex flex-col items-center mb-8">
		<div class="flex items-center space-x-4">
			<RoundButton
				icon={faClock}
				label="Pre-Heat"
				onToggle={() => toggleAttribute('PRE_TIME_FLAG')}
				active={status.PRE_TIME_FLAG}
			/>

			{#if status.PRE_TIME_FLAG}
				<div class="flex items-center ml-4">
					<div class="flex flex-col space-y-2 mr-4">
						<StepButton
							direction="up"
							onPress={() => adjustPreTime(1)}
							onHold={() => adjustPreTime(15)}
							holdInterval={750}
						/>
						<StepButton
							direction="down"
							onPress={() => adjustPreTime(-1)}
							onHold={() => adjustPreTime(-15)}
							holdInterval={750}
						/>
					</div>
					<div
						class="flex items-center justify-center text-white rounded-full w-24 h-24 text-2xl font-bold shadow-lg bg-gray-700"
					>
						{padTwo(status.PRE_TIME_HOUR)}:{padTwo(status.PRE_TIME_MINUTE)}
					</div>
				</div>
			{/if}
		</div>

		{#if status.PRE_TIME_FLAG}
			<div class="text-lg font-semibold mt-4">Start Time: {calculateStartTime()}</div>
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

{#if !serverConnected}
	<div class="fixed bottom-10 left-0 right-0 bg-red-700 text-white text-center py-2 px-4">
		Cannot reach backend — controls unavailable
	</div>
{:else if !deviceConnected}
	<div class="fixed bottom-10 left-0 right-0 bg-yellow-600 text-white text-center py-2 px-4">
		Backend connected — waiting for sauna
	</div>
{/if}

<div
	class="fixed bottom-0 left-0 right-0 bg-gray-900 text-gray-400 text-xs py-1 px-4 flex justify-center gap-4"
>
	<span class="flex items-center gap-1">
		<span
			class="inline-block w-2 h-2 rounded-full {serverConnected ? 'bg-green-500' : 'bg-red-500'}"
		></span>
		Backend
	</span>
	<span class="flex items-center gap-1">
		<span
			class="inline-block w-2 h-2 rounded-full {deviceConnected ? 'bg-green-500' : 'bg-red-500'}"
		></span>
		Sauna
	</span>
</div>
