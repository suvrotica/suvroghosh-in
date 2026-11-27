<script lang="ts">
	import { onDestroy } from 'svelte';

	interface Props {
		id: string;
		label: string;
		ariaLabel?: string;
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
		ariaLabel,
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
	let lastDraggedVal = 0;

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
		try {
			el.setPointerCapture(event.pointerId);
		} catch {
			// Ignore capture errors on synthetic or non-active pointers.
		}
		draggingDial = true;
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragStartVal = value;
		lastDraggedVal = value;
		event.preventDefault();
	}

	function handleDialPointerMove(event: PointerEvent) {
		if (!draggingDial) return;
		const dx = event.clientX - dragStartX;
		const dy = dragStartY - event.clientY;
		const combinedPx = Math.abs(dx) > Math.abs(dy) ? dx : dy;
		const fullSweepPx = 150;
		const deltaValue = (combinedPx / fullSweepPx) * (max - min);
		const next = quantize(dragStartVal + deltaValue);
		if (next !== lastDraggedVal) {
			lastDraggedVal = next;
			onPreview(next);
		}
	}

	function finishDialDrag(event: PointerEvent) {
		if (!draggingDial) return;
		const el = event.currentTarget as HTMLElement;
		try {
			if (el.hasPointerCapture(event.pointerId)) {
				el.releasePointerCapture(event.pointerId);
			}
		} catch {
			// Ignore capture release errors on synthetic or non-active pointers.
		}
		draggingDial = false;
		onCommit(lastDraggedVal);
	}

	function cancelDialDrag(event: PointerEvent) {
		if (!draggingDial) return;
		const el = event.currentTarget as HTMLElement;
		try {
			if (el.hasPointerCapture(event.pointerId)) {
				el.releasePointerCapture(event.pointerId);
			}
		} catch {
			// Ignore capture release errors on synthetic or cancelled pointers.
		}
		draggingDial = false;
		onCommit(dragStartVal);
	}

	onDestroy(() => {
		if (!draggingDial) return;
		draggingDial = false;
		onCommit(lastDraggedVal);
	});
</script>

<div class="cf-knob-card" class:is-dragging={draggingDial}>
	<div class="cf-knob-header">
		<div class="cf-knob-title-group">
			<label class="cf-knob-label" for={id}>{label}</label>
			<span class="cf-knob-value" aria-hidden="true">{displayValue}</span>
		</div>

		<div
			class="cf-dial"
			aria-hidden="true"
			title="Drag left/right or up/down to adjust {label}"
			onpointerdown={handleDialPointerDown}
			onpointermove={handleDialPointerMove}
			onpointerup={finishDialDrag}
			onpointercancel={cancelDialDrag}
		>
			<svg viewBox="0 0 40 40" class="cf-dial-svg">
				<circle cx="20" cy="20" r="16" class="cf-dial-track" />
				<g transform="rotate({angleDeg} 20 20)">
					<line x1="20" y1="20" x2="20" y2="6.5" class="cf-dial-needle" />
					<circle cx="20" cy="6.5" r="2" class="cf-dial-tip" />
				</g>
			</svg>
		</div>
	</div>

	<div class="cf-slider-wrap">
		<input
			{id}
			type="range"
			class="cf-range-input"
			{min}
			{max}
			{step}
			{value}
			aria-label={ariaLabel ?? label}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={value}
			aria-valuetext={ariaValueText ?? displayValue}
			aria-describedby={descId}
			oninput={handleRangeInput}
			onchange={handleRangeChange}
		/>
		{#if minLabel || maxLabel}
			<div class="cf-knob-endpoints" aria-hidden="true">
				<span>{minLabel ?? ''}</span>
				<span>{maxLabel ?? ''}</span>
			</div>
		{/if}
	</div>

	<p id={descId} class="cf-knob-desc">{description}</p>
</div>
