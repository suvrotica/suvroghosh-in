<script lang="ts">
	let { onvector }: { onvector(bank: number, pitch: number): void } = $props();

	let field: HTMLButtonElement;
	let pointerId: number | null = null;
	let markerX = $state(0);
	let markerY = $state(0);

	function updateVector(event: PointerEvent) {
		const bounds = field.getBoundingClientRect();
		const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
		const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 - 1;
		const length = Math.max(1, Math.hypot(x, y));
		markerX = x / length;
		markerY = y / length;
		onvector(markerX, -markerY);
	}

	function begin(event: PointerEvent) {
		if (pointerId !== null) return;
		event.preventDefault();
		pointerId = event.pointerId;
		field.setPointerCapture(event.pointerId);
		updateVector(event);
	}

	function move(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		event.preventDefault();
		updateVector(event);
	}

	function end(event?: PointerEvent) {
		if (event && pointerId !== event.pointerId) return;
		const captured = pointerId;
		pointerId = null;
		markerX = 0;
		markerY = 0;
		onvector(0, 0);
		if (captured !== null && field?.hasPointerCapture(captured))
			field.releasePointerCapture(captured);
	}
</script>

<button
	type="button"
	bind:this={field}
	class="flight-field"
	aria-label="Flight control. Drag left and right to bank; drag up to raise the nose and down to lower it."
	onpointerdown={begin}
	onpointermove={move}
	onpointerup={end}
	onpointercancel={end}
	onlostpointercapture={end}
>
	<span class="axis axis-horizontal" aria-hidden="true"></span>
	<span class="axis axis-vertical" aria-hidden="true"></span>
	<span
		class="marker"
		style={`transform: translate(calc(-50% + ${markerX * 43}px), calc(-50% + ${markerY * 31}px));`}
		aria-hidden="true"
	></span>
	<span class="flight-field-label" aria-hidden="true">BANK · PITCH</span>
</button>

<style>
	.flight-field {
		position: relative;
		width: min(43vw, 188px);
		height: 124px;
		min-width: 132px;
		min-height: 88px;
		overflow: hidden;
		border: 1px solid rgb(244 225 187 / 0.65);
		border-radius: 999px;
		background: rgb(22 20 17 / 0.58);
		box-shadow:
			inset 0 0 28px rgb(245 228 194 / 0.08),
			0 8px 28px rgb(0 0 0 / 0.25);
		color: #f4e1bb;
		touch-action: none;
		user-select: none;
		backdrop-filter: blur(6px);
	}

	.flight-field:focus-visible {
		outline: 3px solid #ffd76a;
		outline-offset: 3px;
	}

	.axis {
		position: absolute;
		background: rgb(244 225 187 / 0.22);
		pointer-events: none;
	}

	.axis-horizontal {
		top: 50%;
		left: 12%;
		width: 76%;
		height: 1px;
	}

	.axis-vertical {
		top: 15%;
		left: 50%;
		width: 1px;
		height: 70%;
	}

	.marker {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 34px;
		height: 22px;
		border: 2px solid #f6dfad;
		border-radius: 50% 50% 46% 46%;
		background: rgb(246 223 173 / 0.12);
		box-shadow: 0 0 0 4px rgb(10 10 9 / 0.3);
		pointer-events: none;
	}

	.flight-field-label {
		position: absolute;
		right: 0;
		bottom: 9px;
		left: 0;
		font-size: 0.57rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		opacity: 0.72;
		pointer-events: none;
	}
</style>
