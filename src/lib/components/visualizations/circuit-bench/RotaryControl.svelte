<script lang="ts">
	import {
		dialNormalizedToValue,
		formatEngineeringValue,
		parseEngineeringValue,
		stepParameterValue,
		valueToDialNormalized,
		type EngineeringBounds
	} from '$lib/visualizations/circuit-bench/notation';

	interface Props {
		label: string;
		paramKey: string;
		value: number;
		bounds: EngineeringBounds;
		onchange: (newValue: number) => void;
	}

	let { label, paramKey, value, bounds, onchange }: Props = $props();

	let inputEl = $state<HTMLInputElement | null>(null);
	let inputText = $state('');
	let editingText = $state(false);
	let validationError = $state('');
	let dragging = $state(false);
	let dragStartY = 0;
	let dragStartNorm = 0;

	const formattedValue = $derived(formatEngineeringValue(value, bounds.unit));
	const baseFormatted = $derived(`${Number(value.toPrecision(5))} ${bounds.unit}`);
	const norm = $derived(valueToDialNormalized(value, bounds));
	// Map [0, 1] to angle [-135deg, +135deg]
	const angleDeg = $derived(-135 + norm * 270);

	$effect(() => {
		if (!editingText) {
			inputText = formattedValue;
		}
	});

	function commitTextInput(): void {
		editingText = false;
		const rawText = inputEl ? inputEl.value : inputText;
		const parsed = parseEngineeringValue(rawText, bounds);
		if (!parsed.ok) {
			validationError = `${parsed.error} Preserved ${formattedValue}.`;
			inputText = formattedValue;
			if (inputEl) inputEl.value = formattedValue;
			return;
		}
		validationError = '';
		inputText = parsed.formatted;
		if (inputEl) inputEl.value = parsed.formatted;
		if (Math.abs(parsed.value - value) > 1e-15) {
			onchange(parsed.value);
		}
	}

	function handleKeydownInput(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitTextInput();
		} else if (event.key === 'Escape') {
			editingText = false;
			validationError = '';
			inputText = formattedValue;
		}
	}

	function handleDialKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
			event.preventDefault();
			validationError = '';
			onchange(stepParameterValue(value, 1, bounds, event.shiftKey));
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
			event.preventDefault();
			validationError = '';
			onchange(stepParameterValue(value, -1, bounds, event.shiftKey));
		} else if (event.key === 'PageUp') {
			event.preventDefault();
			validationError = '';
			onchange(stepParameterValue(value, 1, bounds, true));
		} else if (event.key === 'PageDown') {
			event.preventDefault();
			validationError = '';
			onchange(stepParameterValue(value, -1, bounds, true));
		} else if (event.key === 'Home') {
			event.preventDefault();
			validationError = '';
			onchange(bounds.min);
		} else if (event.key === 'End') {
			event.preventDefault();
			validationError = '';
			onchange(bounds.max);
		}
	}

	function handleDialPointerDown(event: PointerEvent): void {
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		dragging = true;
		dragStartY = event.clientY;
		dragStartNorm = norm;
		validationError = '';
	}

	function handleDialPointerMove(event: PointerEvent): void {
		if (!dragging) return;
		const deltaY = dragStartY - event.clientY;
		const nextNorm = Math.min(1, Math.max(0, dragStartNorm + deltaY / 140));
		const nextVal = dialNormalizedToValue(nextNorm, bounds);
		if (Math.abs(nextVal - value) > 1e-15) {
			onchange(nextVal);
		}
	}

	function handleDialPointerUp(event: PointerEvent): void {
		if (!dragging) return;
		dragging = false;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
	}

	function applyStep(direction: -1 | 1, coarse: boolean): void {
		validationError = '';
		const next = stepParameterValue(value, direction, bounds, coarse);
		onchange(next);
	}
</script>

<div class="cb-rotary-card" data-param={paramKey}>
	<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
		<label
			for={`cb-input-${paramKey}`}
			style="font-weight:700;font-size:12.5px;color:var(--cb-text);"
		>
			{label}
		</label>
		<span
			style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--cb-muted);"
			title="Interpreted value and unit"
		>
			{formattedValue} ({baseFormatted})
		</span>
	</div>

	<div class="cb-rotary-row">
		<button
			type="button"
			class="cb-dial-button"
			role="slider"
			aria-label={`${label} rotary control (${bounds.logarithmic ? 'logarithmic scale' : 'linear scale'})`}
			aria-valuemin={bounds.min}
			aria-valuemax={bounds.max}
			aria-valuenow={value}
			aria-valuetext={formattedValue}
			onkeydown={handleDialKeydown}
			onpointerdown={handleDialPointerDown}
			onpointermove={handleDialPointerMove}
			onpointerup={handleDialPointerUp}
			onpointercancel={handleDialPointerUp}
		>
			<svg viewBox="0 0 68 68" width="64" height="64" aria-hidden="true">
				<!-- Scale ticks around the dial -->
				{#each [-135, -90, -45, 0, 45, 90, 135] as tickAngle (tickAngle)}
					{@const rad = ((tickAngle - 90) * Math.PI) / 180}
					<line
						x1={34 + Math.cos(rad) * 26}
						y1={34 + Math.sin(rad) * 26}
						x2={34 + Math.cos(rad) * 30}
						y2={34 + Math.sin(rad) * 30}
						stroke="#9DA5AE"
						stroke-width="1.5"
					/>
				{/each}
				<circle cx="34" cy="34" r="22" fill="#23272B" stroke="#4D545C" stroke-width="1.5" />
				<g transform={`rotate(${angleDeg} 34 34)`}>
					<line
						x1="34"
						y1="34"
						x2="34"
						y2="14"
						stroke="#EF762F"
						stroke-width="3"
						stroke-linecap="round"
					/>
					<circle cx="34" cy="16" r="2" fill="#F1EEE7" />
				</g>
			</svg>
		</button>

		<div style="flex:1 1 auto;display:flex;flex-direction:column;gap:6px;min-width:0;">
			<div class="cb-input-row">
				<input
					bind:this={inputEl}
					id={`cb-input-${paramKey}`}
					type="text"
					class="cb-text-input"
					aria-label={`${label} value entry (supports engineering notation like 1k, 4.7k, 100n, 10u)`}
					bind:value={inputText}
					onfocus={() => {
						editingText = true;
					}}
					oninput={(e) => {
						editingText = true;
						inputText = (e.currentTarget as HTMLInputElement).value;
					}}
					onblur={commitTextInput}
					onkeydown={handleKeydownInput}
				/>
				<button
					type="button"
					class="cb-btn cb-btn-compact"
					onclick={commitTextInput}
					aria-label={`Apply ${label}`}
				>
					Set
				</button>
			</div>

			<div class="cb-step-row" role="group" aria-label={`${label} increment controls`}>
				<button
					type="button"
					class="cb-btn cb-btn-compact"
					onclick={() => applyStep(-1, true)}
					title={bounds.logarithmic ? 'Halve value (×0.5)' : 'Coarse step down'}
					aria-label={bounds.logarithmic ? `Halve ${label}` : `Decrease ${label} coarse`}
				>
					{bounds.logarithmic ? '÷2' : '−−'}
				</button>
				<button
					type="button"
					class="cb-btn cb-btn-compact"
					onclick={() => applyStep(-1, false)}
					title="Fine step down"
					aria-label={`Decrease ${label}`}
				>
					−Step
				</button>
				<button
					type="button"
					class="cb-btn cb-btn-compact"
					onclick={() => applyStep(1, false)}
					title="Fine step up"
					aria-label={`Increase ${label}`}
				>
					+Step
				</button>
				<button
					type="button"
					class="cb-btn cb-btn-compact"
					onclick={() => applyStep(1, true)}
					title={bounds.logarithmic ? 'Double value (×2)' : 'Coarse step up'}
					aria-label={bounds.logarithmic ? `Double ${label}` : `Increase ${label} coarse`}
				>
					{bounds.logarithmic ? '×2' : '++'}
				</button>
			</div>
		</div>
	</div>

	<div
		style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--cb-muted);"
	>
		<span>Min: {formatEngineeringValue(bounds.min, bounds.unit)}</span>
		<span>{bounds.logarithmic ? 'Logarithmic scale' : 'Linear scale'}</span>
		<span>Max: {formatEngineeringValue(bounds.max, bounds.unit)}</span>
	</div>

	{#if validationError}
		<p
			role="alert"
			style="margin:0;padding:5px 8px;background:#2a1416;border-left:3px solid var(--cb-error);color:#ffd8d8;font-size:11.5px;border-radius:3px;"
		>
			{validationError}
		</p>
	{/if}
</div>
