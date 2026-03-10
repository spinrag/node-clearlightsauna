<script lang="ts">
	import { pressHold } from '$lib/pressHold';

	let {
		onPress,
		onHold,
		holdDuration = 500,
		holdInterval = 500,
		direction
	}: {
		onPress: () => void;
		onHold: () => void;
		holdDuration?: number;
		holdInterval?: number;
		direction: 'up' | 'down';
	} = $props();
</script>

<button
	class="bg-gray-600 hover:bg-gray-500 text-white w-10 h-10 rounded-full flex items-center justify-center select-none"
	aria-label={direction === 'up' ? 'Increase' : 'Decrease'}
	use:pressHold={{ onPress, onHold, holdDuration, holdInterval }}
>
	{direction === 'up' ? '▲' : '▼'}
</button>
