<script lang="ts">
	export let value = 65;
	export let min = 0;
	export let max = 100;
	export let step = 1;
	export let label = 'Enhancement amount';
	export let unit = '%';
	export let disabled = false;
	export let id = 'recorder-enhancement-dial';
	export let onChange: ((next: number) => void) | undefined = undefined;

	let dragging = false;
	let dragStartY = 0;
	let dragStartX = 0;
	let dragStartValue = 0;

	$: clamped = Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
	$: normalized = max > min ? (clamped - min) / (max - min) : 0;
	// Sweep from -135 deg to +135 deg (270 degree arc)
	$: angleDeg = -135 + normalized * 270;

	$: strengthDescriptor =
		clamped === 0
			? 'Bypassed'
			: clamped <= 35
				? 'Subtle'
				: clamped <= 72
					? 'Balanced'
					: 'Stronger';

	function commitValue(raw: number) {
		if (disabled) return;
		const snapped = Math.round(raw / step) * step;
		const next = Math.max(min, Math.min(max, snapped));
		if (next !== value) {
			value = next;
			onChange?.(next);
		}
	}

	function handlePointerDown(event: PointerEvent) {
		if (disabled) return;
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		dragging = true;
		dragStartY = event.clientY;
		dragStartX = event.clientX;
		dragStartValue = clamped;
	}

	function handlePointerMove(event: PointerEvent) {
		if (!dragging || disabled) return;
		// Linear drag (vertical up OR horizontal right increases value; no circular gesture required)
		const deltaY = dragStartY - event.clientY;
		const deltaX = event.clientX - dragStartX;
		const dominantDelta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
		const spanPx = 140;
		const deltaValue = (dominantDelta / spanPx) * (max - min);
		commitValue(dragStartValue + deltaValue);
	}

	function handlePointerUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (disabled) return;
		if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
			event.preventDefault();
			commitValue(clamped + step);
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
			event.preventDefault();
			commitValue(clamped - step);
		} else if (event.key === 'PageUp') {
			event.preventDefault();
			commitValue(clamped + step * 10);
		} else if (event.key === 'PageDown') {
			event.preventDefault();
			commitValue(clamped - step * 10);
		} else if (event.key === 'Home') {
			event.preventDefault();
			commitValue(min);
		} else if (event.key === 'End') {
			event.preventDefault();
			commitValue(max);
		}
	}

	function handleNumericInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const parsed = Number(target.value);
		if (!Number.isNaN(parsed)) {
			commitValue(parsed);
		}
	}

	function handleRangeInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const parsed = Number(target.value);
		if (!Number.isNaN(parsed)) {
			commitValue(parsed);
		}
	}

	// Polar helper for SVG arc ticks
	function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
		const rad = ((deg - 90) * Math.PI) / 180;
		return {
			x: cx + r * Math.cos(rad),
			y: cy + r * Math.sin(rad)
		};
	}

	const ticks = Array.from({ length: 19 }, (_, idx) => {
		const frac = idx / 18;
		const deg = -135 + frac * 270;
		const inner = polarToCartesian(56, 56, 44, deg);
		const outer = polarToCartesian(56, 56, idx % 3 === 0 ? 51 : 48, deg);
		return { idx, frac, inner, outer, major: idx % 3 === 0 };
	});
</script>

<div class="rotary-unit" class:is-disabled={disabled}>
	<div class="rotary-header">
		<label class="rotary-label" for="{id}-number">{label}</label>
		<span class="rotary-badge">{strengthDescriptor}</span>
	</div>

	<div class="rotary-body">
		<!-- Tactile hardware rotary dial (supports linear drag + keyboard arrows) -->
		<div
			class="rotary-dial-housing"
			role="slider"
			tabindex={disabled ? -1 : 0}
			aria-label={label}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={clamped}
			aria-valuetext="{clamped}{unit} ({strengthDescriptor})"
			on:pointerdown={handlePointerDown}
			on:pointermove={handlePointerMove}
			on:pointerup={handlePointerUp}
			on:pointercancel={handlePointerUp}
			on:keydown={handleKeyDown}
		>
			<svg class="rotary-svg" viewBox="0 0 112 112" aria-hidden="true">
				{#each ticks as tick (tick.idx)}
					<line
						x1={tick.inner.x}
						y1={tick.inner.y}
						x2={tick.outer.x}
						y2={tick.outer.y}
						class="tick-line"
						class:is-lit={tick.frac <= normalized && clamped > 0}
						class:is-major={tick.major}
					/>
				{/each}
			</svg>

			<div class="rotary-cap" style="transform: rotate({angleDeg}deg);">
				<div class="rotary-groove"></div>
				<div class="rotary-indicator"></div>
			</div>
		</div>

		<!-- Ordinary linear slider + exact numeric input so circular gestures are never required -->
		<div class="rotary-linear-controls">
			<div class="numeric-row">
				<input
					id="{id}-number"
					type="number"
					class="numeric-input"
					{min}
					{max}
					{step}
					{disabled}
					value={clamped}
					aria-label="{label} numeric percentage"
					on:input={handleNumericInput}
				/>
				<span class="numeric-unit">{unit}</span>
			</div>

			<input
				id="{id}-range"
				type="range"
				class="linear-slider"
				{min}
				{max}
				{step}
				{disabled}
				value={clamped}
				aria-label="{label} linear slider"
				on:input={handleRangeInput}
			/>

			<div class="scale-captions" aria-hidden="true">
				<span>Off</span>
				<span>Subtle</span>
				<span>Stronger</span>
			</div>
		</div>
	</div>
</div>

<style>
	.rotary-unit {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding: 0.85rem 1rem;
		background: linear-gradient(180deg, #181c21 0%, #13161a 100%);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.05),
			0 6px 16px rgba(0, 0, 0, 0.35);
	}

	.rotary-unit.is-disabled {
		opacity: 0.55;
	}

	.rotary-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.rotary-label {
		font-size: 0.82rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: #f3efe6;
	}

	.rotary-badge {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.72rem;
		padding: 0.15rem 0.48rem;
		border-radius: 4px;
		background: rgba(242, 107, 33, 0.14);
		border: 1px solid rgba(242, 107, 33, 0.38);
		color: #ff985a;
	}

	.rotary-body {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.rotary-dial-housing {
		position: relative;
		width: 92px;
		height: 92px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: ns-resize;
		user-select: none;
		touch-action: none;
		border-radius: 50%;
	}

	.rotary-dial-housing:focus-visible {
		outline: 2px solid #f26b21;
		outline-offset: 3px;
	}

	.rotary-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.tick-line {
		stroke: rgba(255, 255, 255, 0.18);
		stroke-width: 1.5;
		stroke-linecap: round;
		transition: stroke 120ms ease;
	}

	.tick-line.is-major {
		stroke-width: 2;
		stroke: rgba(255, 255, 255, 0.3);
	}

	.tick-line.is-lit {
		stroke: #f26b21;
	}

	.rotary-cap {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background:
			radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.12), transparent 55%),
			conic-gradient(
				from 0deg,
				#242930,
				#1a1e23,
				#2a3038,
				#171a1f,
				#252a32,
				#191c21,
				#242930
			);
		border: 1px solid rgba(255, 255, 255, 0.14);
		box-shadow:
			0 6px 14px rgba(0, 0, 0, 0.65),
			inset 0 1px 1px rgba(255, 255, 255, 0.16);
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: center;
	}

	.rotary-groove {
		position: absolute;
		top: 6px;
		bottom: 6px;
		width: 2px;
		background: rgba(0, 0, 0, 0.55);
		border-right: 1px solid rgba(255, 255, 255, 0.08);
	}

	.rotary-indicator {
		margin-top: 6px;
		width: 4px;
		height: 13px;
		border-radius: 2px;
		background: #f26b21;
		box-shadow: 0 0 6px rgba(242, 107, 33, 0.75);
		z-index: 1;
	}

	.rotary-linear-controls {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.42rem;
		min-width: 0;
	}

	.numeric-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.numeric-input {
		width: 4.4rem;
		padding: 0.28rem 0.45rem;
		background: #0d0f12;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 6px;
		color: #f3efe6;
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.92rem;
		font-weight: 600;
		text-align: right;
	}

	.numeric-input:focus-visible {
		outline: 2px solid #f26b21;
		border-color: #f26b21;
	}

	.numeric-unit {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.82rem;
		color: #b5b0a6;
	}

	.linear-slider {
		width: 100%;
		accent-color: #f26b21;
		cursor: pointer;
		height: 6px;
	}

	.scale-captions {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: #b5b0a6;
	}

	@media (prefers-reduced-motion: reduce) {
		.tick-line {
			transition: none;
		}
	}
</style>
