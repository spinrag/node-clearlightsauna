type PressHoldOptions = {
	onPress: (event: MouseEvent | TouchEvent) => void // Function to call on quick press
	onHold: (event: MouseEvent | TouchEvent) => void // Function to call on hold
	holdDuration?: number // Duration in milliseconds to trigger hold
	holdInterval?: number // Interval at which to call onHold during a hold
	onHoldingChange?: (isHolding: boolean) => void // Optional callback for visual feedback
}

export function pressHold(
	node: HTMLElement,
	{ onPress, onHold, holdDuration = 500, holdInterval = 500, onHoldingChange }: PressHoldOptions
	): { destroy: () => void } {
	let holdTimer: ReturnType<typeof setTimeout>
	let holdIntervalTimer: ReturnType<typeof setInterval>
	let isHolding = false

	function startHold(event: MouseEvent | TouchEvent) {
		isHolding = false
		onHoldingChange?.(true) // Notify holding started
		// Start the initial hold timer
		holdTimer = setTimeout(() => {
			isHolding = true
			onHold(event) // Trigger the first hold action

			// Start the continuous hold interval
			holdIntervalTimer = setInterval(() => {
				onHold(event) // Continuously call the hold action
			}, holdInterval)
		}, holdDuration)
	}

	function clearHold(event: MouseEvent | TouchEvent) {
		clearTimeout(holdTimer) // Clear the initial hold timer
		clearInterval(holdIntervalTimer) // Stop the continuous hold interval
		onHoldingChange?.(false) // Notify holding stopped
		if (!isHolding) {
			onPress(event) // Trigger the press action
		}
	}

	function cancelHold() {
		clearTimeout(holdTimer)
		clearInterval(holdIntervalTimer)
		onHoldingChange?.(false) // Notify holding stopped
	}

	// Add event listeners to the node
	node.addEventListener('mousedown', startHold)
	node.addEventListener('mouseup', clearHold)
	node.addEventListener('mouseleave', cancelHold)
	node.addEventListener('touchstart', startHold, { passive: true })
	node.addEventListener('touchend', clearHold, { passive: true })
	node.addEventListener('touchcancel', cancelHold)

	// Cleanup event listeners when the action is destroyed
	return {
		destroy() {
			node.removeEventListener('mousedown', startHold)
			node.removeEventListener('mouseup', clearHold)
			node.removeEventListener('mouseleave', cancelHold)
			node.removeEventListener('touchstart', startHold)
			node.removeEventListener('touchend', clearHold)
			node.removeEventListener('touchcancel', cancelHold)
		}
	}
}
