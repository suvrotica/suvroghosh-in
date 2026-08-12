<script lang="ts">
	interface Props {
		id: string;
		label: string;
		symbol: string;
		value: number;
		min: number;
		max: number;
		step: number;
		defaultValue: number;
		unit?: string;
		equation: string;
		explanation: string;
		disabled?: boolean;
		format?: (value: number) => string;
		onbegin?: () => void;
		onpreview: (value: number) => void;
		oncommit?: (value: number) => void;
	}

	let {
		id,
		label,
		symbol,
		value,
		min,
		max,
		step,
		defaultValue,
		unit = 'dimensionless',
		equation,
		explanation,
		disabled = false,
		format = (v: number) => String(Number(v.toFixed(4))),
		onbegin,
		onpreview,
		oncommit
	}: Props = $props();

	let detailsOpen = $state(false);
	let localValue = $derived(value);

	function readValue(event: Event): number {
		const target = event.currentTarget as HTMLInputElement;
		const next = Number(target.value);
		return Number.isFinite(next) ? Math.max(min, Math.min(max, next)) : value;
	}

	function preview(event: Event): void {
		onpreview(readValue(event));
	}

	function commit(event: Event): void {
		const next = readValue(event);
		onpreview(next);
		oncommit?.(next);
	}

	function reset(): void {
		onbegin?.();
		onpreview(defaultValue);
		oncommit?.(defaultValue);
	}
</script>

<div class="parameter" class:is-disabled={disabled}>
	<div class="parameter-heading">
		<label for={`${id}-range`}>
			<span class="label">{label}</span>
			<span class="symbol" aria-label={`symbol ${symbol}`}>{symbol}</span>
		</label>
		<div class="value-group">
			<input
				id={`${id}-number`}
				class="number-input"
				type="number"
				{min}
				{max}
				{step}
				value={localValue}
				aria-label={`${label} numeric value`}
				{disabled}
				onfocus={() => onbegin?.()}
				oninput={preview}
				onchange={commit}
			/>
			<span class="unit">{unit}</span>
		</div>
	</div>

	<div class="range-row">
		<input
			id={`${id}-range`}
			type="range"
			{min}
			{max}
			{step}
			value={localValue}
			aria-describedby={`${id}-description`}
			{disabled}
			onpointerdown={() => onbegin?.()}
			onkeydown={(event) => {
				if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
					onbegin?.();
				}
			}}
			oninput={preview}
			onchange={commit}
			style={`--progress: ${((localValue - min) / (max - min)) * 100}%`}
		/>
		<output for={`${id}-range`} class="range-output">{format(localValue)}</output>
		<button
			class="reset"
			type="button"
			onclick={reset}
			disabled={disabled || value === defaultValue}>Reset</button
		>
	</div>

	<div class="control-foot">
		<button
			class="explain-toggle"
			type="button"
			aria-expanded={detailsOpen}
			aria-controls={`${id}-description`}
			onclick={() => (detailsOpen = !detailsOpen)}
		>
			{detailsOpen ? 'Hide equation' : 'What this changes'}
		</button>
		<span class="default-marker">default {format(defaultValue)}</span>
	</div>

	{#if detailsOpen}
		<div id={`${id}-description`} class="explanation">
			<code>{equation}</code>
			<p>{explanation}</p>
		</div>
	{:else}
		<span id={`${id}-description`} class="sr-only">{explanation}. Equation: {equation}</span>
	{/if}
</div>

<style>
	.parameter {
		padding: 0.76rem 0.8rem 0.72rem;
		border-bottom: 1px solid var(--line);
		background: transparent;
	}

	.parameter:last-child {
		border-bottom: 0;
	}

	.parameter.is-disabled {
		opacity: 0.58;
	}

	.parameter-heading,
	.range-row,
	.control-foot {
		display: flex;
		align-items: center;
	}

	.parameter-heading {
		justify-content: space-between;
		gap: 0.75rem;
	}

	.parameter-heading label {
		display: flex;
		align-items: baseline;
		gap: 0.38rem;
		min-width: 0;
	}

	.label {
		font-size: 0.78rem;
		font-weight: 640;
		color: var(--text);
	}

	.symbol {
		font-family: Georgia, serif;
		font-size: 0.76rem;
		font-style: italic;
		color: var(--cyan);
	}

	.value-group {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
	}

	.number-input {
		width: 5.4rem;
		height: 29px;
		padding: 0.2rem 0.35rem;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--bg);
		color: var(--text);
		font-size: 0.72rem;
		text-align: right;
	}

	.unit {
		max-width: 5.6rem;
		font-size: 0.58rem;
		line-height: 1.1;
		color: var(--faint);
	}

	.range-row {
		gap: 0.5rem;
		margin-top: 0.55rem;
	}

	input[type='range'] {
		width: 100%;
		height: 20px;
		margin: 0;
		appearance: none;
		background: transparent;
	}

	input[type='range']::-webkit-slider-runnable-track {
		height: 3px;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			var(--amber) 0%,
			var(--amber) var(--progress),
			var(--line-bright) var(--progress),
			var(--line-bright) 100%
		);
	}

	input[type='range']::-moz-range-track {
		height: 3px;
		border-radius: 999px;
		background: var(--line-bright);
	}

	input[type='range']::-moz-range-progress {
		height: 3px;
		border-radius: 999px;
		background: var(--amber);
	}

	input[type='range']::-webkit-slider-thumb {
		width: 15px;
		height: 15px;
		margin-top: -6px;
		border: 2px solid var(--panel);
		border-radius: 50%;
		appearance: none;
		background: var(--shell);
		box-shadow: 0 0 0 1px var(--amber);
	}

	input[type='range']::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border: 2px solid var(--panel);
		border-radius: 50%;
		background: var(--shell);
		box-shadow: 0 0 0 1px var(--amber);
	}

	.range-output {
		min-width: 3.5rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.65rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
		color: var(--muted);
	}

	.reset,
	.explain-toggle {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--muted);
		font-size: 0.58rem;
		text-decoration: underline;
		text-decoration-color: transparent;
		text-underline-offset: 2px;
	}

	.reset:hover,
	.explain-toggle:hover {
		color: var(--cyan);
		text-decoration-color: currentColor;
	}

	.reset:disabled {
		text-decoration: none;
	}

	.control-foot {
		justify-content: space-between;
		margin-top: 0.28rem;
	}

	.default-marker {
		font-size: 0.56rem;
		color: var(--faint);
	}

	.explanation {
		margin-top: 0.52rem;
		padding: 0.52rem 0.58rem;
		border-left: 2px solid var(--cyan-soft);
		background: color-mix(in srgb, var(--cyan-soft) 12%, transparent);
	}

	.explanation code {
		display: block;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.66rem;
		color: var(--cyan);
		overflow-wrap: anywhere;
	}

	.explanation p {
		margin: 0.28rem 0 0;
		font-size: 0.66rem;
		line-height: 1.45;
		color: var(--muted);
	}

	@media (max-width: 720px) {
		.parameter {
			padding: 0.85rem 0.9rem;
		}

		.number-input {
			height: 36px;
		}

		input[type='range'] {
			height: 32px;
		}

		input[type='range']::-webkit-slider-thumb {
			width: 22px;
			height: 22px;
			margin-top: -9px;
		}

		input[type='range']::-moz-range-thumb {
			width: 18px;
			height: 18px;
		}
	}
</style>
