<script>
	import { FontAwesomeIcon } from '@fortawesome/svelte-fontawesome'
	let { icon, label = '', active = false, onToggle } = $props()
</script>

<div class="button-container">
	<button type="button" class="round-button {active ? 'active' : ''}" onclick={onToggle}>
		<FontAwesomeIcon {icon} />
	</button>
	<div class="label">{label}</div>
</div>

<style>
	.button-container {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.round-button {
		border: none;
		padding: 0;
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
