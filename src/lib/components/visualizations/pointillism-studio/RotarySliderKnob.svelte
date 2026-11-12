<script lang="ts">
	interface Props {
		id: string;
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		displayValue: string;
		ariaValueText?: string;
		description: string;
		minLabel?: string;
		maxLabel?: string;
		onPreview: (nextValue: number) => void;
		onCommit: (nextValue: number) => void;
	}

	let {
		id,
		label,
		value,
		min,
		max,
		step,
		displayValue,
		ariaValueText,
		description,
		minLabel,
		maxLabel,
		onPreview,
		onCommit
	}: Props = $props();

	let draggingDial = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartVal = 0;

	const descId = $derived(`${id}-desc`);
	const fraction = $derived(max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0);
	const angleDeg = $derived(-132 + fraction * 264);

	function quantize(raw: number): number {
		const clamped = Math.min(max, Math.max(min, raw));
		const stepped = min + Math.round((clamped - min) / step) * step;
		const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
		return Number(Math.min(max, Math.max(min, stepped)).toFixed(decimals));
	}

	function handleRangeInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const next = quantize(Number(target.value));
		onPreview(next);
	}

	function handleRangeChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const next = quantize(Number(target.value));
		onCommit(next);
	}

	function handleDialPointerDown(event: PointerEvent) {
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		const el = event.currentTarget as HTMLElement;
		el.setPointerCapture(event.pointerId);
		draggingDial = true;
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragStartVal = value;
		event.preventDefault();
	}

	function handleDialPointerMove(event: PointerEvent) {
		if (!draggingDial) return;
		const dx = event.clientX - dragStartX;
		const dy = dragStartY - event.clientY;
		// Allow simple horizontal or vertical linear dragging rather than circular movement.
		const combinedPx = Math.abs(dx) > Math.abs(dy) ? dx : dy;
		const fullSweepPx = 150;
		const deltaValue = (combinedPx / fullSweepPx) * (max - min);
		const next = quantize(dragStartVal + deltaValue);
		onPreview(next);
	}

	function finishDialDrag(event: PointerEvent) {
		if (!draggingDial) return;
		const el = event.currentTarget as HTMLElement;
		if (el.hasPointerCapture(event.pointerId)) {
			el.releasePointerCapture(event.pointerId);
		}
		draggingDial = false;
		onCommit(value);
	}
</script>

<div class="ps-knob-card" class:is-dragging={draggingDial}>
	<div class="ps-knob-header">
		<div class="ps-knob-title-group">
			<label class="ps-knob-label" for={id}>{label}</label>
			<span class="ps-knob-value" aria-hidden="true">{displayValue}</span>
		</div>

		<div
			class="ps-dial"
			aria-hidden="true"
			title="Drag left/right or up/down to adjust {label}"
			onpointerdown={handleDialPointerDown}
			onpointermove={handleDialPointerMove}
			onpointerup={finishDialDrag}
			onpointercancel={finishDialDrag}
		>
			<svg viewBox="0 0 40 40" class="ps-dial-svg">
				<circle cx="20" cy="20" r="16" class="ps-dial-track" />
				<g transform="rotate({angleDeg} 20 20)">
					<line x1="20" y1="20" x2="20" y2="6.5" class="ps-dial-needle" />
					<circle cx="20" cy="6.5" r="2" class="ps-dial-tip" />
				</g>
			</svg>
		</div>
	</div>

	<div class="ps-slider-wrap">
		<input
			{id}
			type="range"
			class="ps-range-input"
			{min}
			{max}
			{step}
			{value}
			aria-valuetext={ariaValueText ?? displayValue}
			aria-describedby={descId}
			oninput={handleRangeInput}
			onchange={handleRangeChange}
		/>
		{#if minLabel || maxLabel}
			<div class="ps-knob-endpoints" aria-hidden="true">
				<span>{minLabel ?? ''}</span>
				<span>{maxLabel ?? ''}</span>
			</div>
		{/if}
	</div>

	<p id={descId} class="ps-knob-desc">{description}</p>
</div>
