<script>
	import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome';
	export let icon;
	export let label = '';
	export let active = false;
	export let onToggle; // Function passed from the parent
</script>

<div class="button-container">
	<div class="round-button {active ? 'active' : ''}" on:click={onToggle}>
		<FontAwesomeIcon {icon} />
	</div>
	<div class="label">{label}</div>
</div>

<style>
	.button-container {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.round-button {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		display: flex;
		justify-content: center;
		align-items: center;
		cursor: pointer;
		font-size: 24px;
		transition: background-color 0.3s ease;
		color: white;
	}

	.round-button.active {
		background-color: #007bff;
	}

	.round-button:not(.active) {
		background-color: #333;
	}

	.label {
		margin-top: 8px;
		font-size: 14px;
		color: white;
	}
</style>
