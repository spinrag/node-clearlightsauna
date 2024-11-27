<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { writable } from 'svelte/store'
	import { socket } from '$lib/socket'
	import { pressHold } from '$lib/pressHold'

	import RoundButton from '$lib/components/toggleButton.svelte'
	import { faPowerOff, faLightbulb, faClock } from '@fortawesome/free-solid-svg-icons'

	interface SaunaStatus {
		EXTERNAL_LIGHT: boolean
		INTERNAL_LIGHT: boolean
		PRE_TIME_FLAG: boolean
		power_flag: boolean
		cf_flag: boolean
		UVB_FLAG: boolean // bit 5  // AUX Control
		N_FLAG: boolean
		LED: number
		RIGHT: number
		LEFT: number
		SET_TEMP: number
		SET_HOUR: number
		SET_MINUTE: number
		PRE_TIME_HOUR: number
		PRE_TIME_MINUTE: number
		SN: number
		CURRENT_TEMP: number
		heart_pulse: number
	}

	let saunaStatus = writable<SaunaStatus>({
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
	})

	const devMode = import.meta.env.VITE_DEV_MODE === 'true'
	if (devMode) console.log('devMode active', devMode)

	// Local variables for current and set temperatures
	let CURRENT_TEMP = 60
	let SET_TEMP = 120

	// Local variables for hour and minute
	let SET_HOUR = 0
	let SET_MINUTE = 55

	// Pre-time settings and flag
	let PRE_TIME_HOUR = 0
	let PRE_TIME_MINUTE = 0
	let PRE_TIME_FLAG = false

	function toggleAttribute(attribute: keyof SaunaStatus) {
		socket.emit('control', { [attribute]: !$saunaStatus[attribute] })
	}

	function setTemperature(value: number) {
		const MIN_TEMP = 60
		const MAX_TEMP = 180
		const newTemp = $saunaStatus.SET_TEMP + value
		
		if (newTemp >= MIN_TEMP && newTemp <= MAX_TEMP) {
			socket.emit('control', { SET_TEMP: newTemp })
		}
	}

	// Function to get the temperature color based on the current temperature
	function getTemperatureColor(temp: number) {
		if (temp < 80) return 'bg-blue-500' // Cold temperatures, blue
		if (temp < 100) return 'bg-green-500' // Moderate temperatures, green
		if (temp < 120) return 'bg-yellow-500' // Warm temperatures, yellow
		return 'bg-red-500' // Hot temperatures, red
	}

	// Function to adjust the time
	function adjustTime(change: number) {
		// Update the minute value, and adjust the hour as needed
		SET_MINUTE += change

		if (SET_MINUTE >= 60) {
			SET_MINUTE = 60
			SET_HOUR = (SET_HOUR + 1) % 24 // Keep hour within 24-hour range
		} else if ($saunaStatus.SET_MINUTE < 0) {
			SET_MINUTE = 59
			SET_HOUR = (SET_HOUR - 1 + 24) % 24 // Handle negative hour wrapping
		}

		// Emit the updated time to the server
		socket.emit('control', {
			SET_HOUR: 0,
			SET_MINUTE
		})
	}

	function adjustPreTime(change: number) {
		saunaStatus.update((status) => {
			let newMinute = status.PRE_TIME_MINUTE + change
			let newHour = status.PRE_TIME_HOUR

			if (newMinute >= 60) {
				newMinute = 0
				newHour = (newHour + 1) % 24
			} else if (newMinute < 0) {
				newMinute = (change === -1) ? 59 : 60 + change
				newHour = (newHour - 1 + 24) % 24
			}

			// Emit the updated time to the server
			socket.emit('control', {
				PRE_TIME_HOUR: newHour,
				PRE_TIME_MINUTE: newMinute
			})

			return {
				...status,
				PRE_TIME_HOUR: newHour,
				PRE_TIME_MINUTE: newMinute
			}
		})
	}

	// Calculate start time based on current time plus PRE_TIME_HOUR and PRE_TIME_MINUTE
	function calculateStartTime() {
		const now = new Date()
		const startTime = new Date(
			now.getTime() + PRE_TIME_HOUR * 60 * 60 * 1000 + PRE_TIME_MINUTE * 60 * 1000
		)
		return startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	}

	onMount(() => {
		socket.on('connected', (data) => {
			console.log('socket connected')
		})

		socket.on('attributes', (status) => {
			if (devMode) console.log('status', status)
			saunaStatus.update((currentStatus) => ({
				...currentStatus,
				...status // Assume status includes an object with CURRENT_TEMP
			}))

			if (status.CURRENT_TEMP !== undefined) CURRENT_TEMP = status.CURRENT_TEMP
			if (status.SET_TEMP !== undefined) SET_TEMP = status.SET_TEMP
			if (status.SET_HOUR !== undefined) SET_HOUR = status.SET_HOUR
			if (status.SET_MINUTE !== undefined) SET_MINUTE = status.SET_MINUTE

			if (status.PRE_TIME_HOUR !== undefined) PRE_TIME_HOUR = status.PRE_TIME_HOUR
			if (status.PRE_TIME_MINUTE !== undefined) PRE_TIME_MINUTE = status.PRE_TIME_MINUTE
			if (status.PRE_TIME_FLAG !== undefined) PRE_TIME_FLAG = status.PRE_TIME_FLAG
		})
	})

	let isActive = false
</script>

<div class="flex flex-col items-center min-h-screen bg-gray-800 text-white p-6">
	<h1 class="text-3xl font-bold mb-6">Clearlight Sauna Control</h1>

	<div class="flex space-x-4">
		<RoundButton
			icon={faPowerOff}
			label="Power"
			onToggle={() => toggleAttribute('power_flag')}
			active={$saunaStatus.power_flag}
		/>
		<RoundButton
			icon={faLightbulb}
			label="External Light"
			onToggle={() => toggleAttribute('EXTERNAL_LIGHT')}
			active={$saunaStatus.EXTERNAL_LIGHT}
		/>
		<RoundButton
			icon={faLightbulb}
			label="Internal Light"
			onToggle={() => toggleAttribute('INTERNAL_LIGHT')}
			active={$saunaStatus.INTERNAL_LIGHT}
		/>
		<RoundButton
			icon={faPowerOff}
			label="AUX"
			onToggle={() => toggleAttribute('UVB_FLAG')}
			active={$saunaStatus.UVB_FLAG}
		/>
	</div>

	<!-- Temperature Displays in a Horizontal Row with Vertical Alignment -->
	<div class="flex space-x-16 mb-8 mt-6">
		<!-- Current Temperature Column -->
		<div class="flex flex-col items-center">
			<div class="text-lg font-semibold">Current</div>
			<div
				class={`flex items-center justify-center text-white rounded-full w-24 h-24 mt-2 text-2xl font-bold shadow-lg ${getTemperatureColor($saunaStatus.CURRENT_TEMP)}`}
			>
				{$saunaStatus.CURRENT_TEMP}°F
			</div>
		</div>

		<!-- Set Temperature Column with Up/Down Controls -->
		<div class="flex flex-col items-center">
			<div class="text-lg font-semibold">Set Temperature</div>
			<div class="flex items-center mt-2">
				<!-- Up/Down Buttons Vertically Aligned with Set Temperature Circle -->
				<div class="flex flex-col space-y-2 mr-4">
					<button
						class="bg-gray-600 hover:bg-gray-500 text-white w-10 h-10 rounded-full flex items-center justify-center select-none"
						on:touchstart|preventDefault
						use:pressHold={{ onPress: () => setTemperature(1), onHold: () => setTemperature(5), holdDuration: 500 }}
					>
						▲
					</button>
					<button
						class="bg-gray-600 hover:bg-gray-500 text-white w-10 h-10 rounded-full flex items-center justify-center select-none"
						on:touchstart|preventDefault
						use:pressHold={{ onPress: () => setTemperature(-1), onHold: () => setTemperature(-5), holdDuration: 500 }}
					>
						▼
					</button>
				</div>

				<!-- Set Temperature Circle -->
				<div
					class={`flex items-center justify-center text-white rounded-full w-24 h-24 text-2xl font-bold shadow-lg ${getTemperatureColor($saunaStatus.SET_TEMP)}`}
				>
					{$saunaStatus.SET_TEMP}°F
				</div>
			</div>
		</div>
	</div>

	<!-- Hour-Minute Clock with Up/Down Controls -->
	<div class="flex flex-col items-center mb-8">
		<div class="text-lg font-semibold">Set Time</div>
		<div class="flex items-center mt-2">
			<!-- Up/Down Buttons for Time -->
			<div class="flex flex-col space-y-2 mr-4">
				<button
					class="bg-gray-600 hover:bg-gray-500 text-white w-10 h-10 rounded-full flex items-center justify-center select-none"
					on:touchstart|preventDefault
					use:pressHold={{ onPress: () => adjustTime(1), onHold: () => adjustTime(5), holdDuration: 500 }}
				>
					▲
				</button>
				<button
					class="bg-gray-600 hover:bg-gray-500 text-white w-10 h-10 rounded-full flex items-center justify-center select-none"
					on:touchstart|preventDefault
					use:pressHold={{ onPress: () => adjustTime(-1), onHold: () => adjustTime(-5), holdDuration: 500 }}
				>
					▼
				</button>
			</div>

			<!-- Display for Set Time -->
			<div
				class="flex items-center justify-center text-white rounded-full w-24 h-24 text-2xl font-bold shadow-lg bg-gray-700"
			>
				{String($saunaStatus.SET_HOUR).padStart(2, '0')}:{String($saunaStatus.SET_MINUTE).padStart(
					2,
					'0'
				)}
			</div>
		</div>
	</div>

	<!-- Pre-Time Settings with Toggle and Conditional Controls -->
	<div class="flex flex-col items-center mb-8">
		<div class="flex items-center space-x-4">
		  <!-- Pre-Heat Toggle and Pre-Time Controls in Same Row -->
		  <RoundButton icon={faClock} label="Pre-Heat" onToggle={() => toggleAttribute('PRE_TIME_FLAG')} active={PRE_TIME_FLAG} />
	
		  {#if PRE_TIME_FLAG || true}
			<div class="flex items-center ml-4">
			  <!-- Up/Down Buttons and Time Display for Pre-Time -->
			  <div class="flex flex-col space-y-2 mr-4">
				<button 
					class="bg-gray-600 hover:bg-gray-500 text-white w-10 h-10 rounded-full flex items-center justify-center select-none"
					on:touchstart|preventDefault
					use:pressHold={{ onPress: () => adjustPreTime(1), onHold: () => adjustPreTime(15), holdDuration: 500, holdInterval: 750 }}
				>
				  ▲
				</button>
				<button 
					class="bg-gray-600 hover:bg-gray-500 text-white w-10 h-10 rounded-full flex items-center justify-center select-none"
					on:touchstart|preventDefault
					use:pressHold={{ onPress: () => adjustPreTime(-1), onHold: () => adjustPreTime(-15), holdDuration: 500, holdInterval: 750 }}
				>
				  ▼
				</button>
			  </div>
			  <div class="flex items-center justify-center text-white rounded-full w-24 h-24 text-2xl font-bold shadow-lg bg-gray-700">
				{String(PRE_TIME_HOUR).padStart(2, '0')}:{String(PRE_TIME_MINUTE).padStart(2, '0')}
			  </div>
			</div>
		  {/if}
		</div>
	
		<!-- Start Time Display below Pre-Time Controls -->
		{#if PRE_TIME_FLAG}
		  <div class="text-lg font-semibold mt-4">Start Time: {calculateStartTime()}</div>
		{/if}
	  </div>

	{#if devMode}
		<!-- Display status or temperature details in a preformatted box -->
		<pre class="bg-white text-gray-800 p-4 rounded-md shadow-md mt-4">
			{JSON.stringify($saunaStatus, null, 2)}
		</pre>
	{/if}
</div>
