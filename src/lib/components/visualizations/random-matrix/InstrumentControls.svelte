<script lang="ts">
	import {
		PRESET_LABELS,
		type ExperimentStateView,
		type MatrixDistribution,
		type MatrixNormalisation,
		type MatrixSymmetry,
		type PresetId,
		type SignalType
	} from './types';

	let {
		state,
		disabled = false,
		busy = false,
		onchange,
		onreroll,
		oncopyseed,
		onreset
	}: {
		state: ExperimentStateView;
		disabled?: boolean;
		busy?: boolean;
		onchange: (patch: Partial<ExperimentStateView>, commit?: boolean) => void;
		onreroll: () => void;
		oncopyseed: () => void;
		onreset: () => void;
	} = $props();

	const distributions: readonly { value: MatrixDistribution; label: string }[] = [
		{ value: 'gaussian', label: 'Gaussian' },
		{ value: 'uniform', label: 'Uniform, matched variance' },
		{ value: 'rademacher', label: 'Rademacher ±1' }
	];
	const normalisations: readonly { value: MatrixNormalisation; label: string }[] = [
		{ value: 'variance-1/n', label: 'Dimension-scaled σ/√n' },
		{ value: 'unscaled', label: 'Unscaled entries' },
		{ value: 'frobenius', label: 'Unit Frobenius norm' },
		{ value: 'spectral-radius', label: 'Unit spectral radius' }
	];
	const signals: readonly { value: SignalType; label: string }[] = [
		{ value: 'none', label: 'No planted signal' },
		{ value: 'rank-one', label: 'Rank-one spike' },
		{ value: 'two-block', label: 'Two-block communities' },
		{ value: 'diagonal-band', label: 'Diagonal band' },
		{ value: 'toeplitz', label: 'Toeplitz-like correlation' },
		{ value: 'sparse-hubs', label: 'Sparse hubs' },
		{ value: 'repeated-motif', label: 'Repeated motif' },
		{ value: 'nonzero-mean', label: 'Nonzero mean' },
		{ value: 'unequal-row-variance', label: 'Unequal row variance' }
	];
	const intrinsicallySymmetric = $derived(
		[
			'wigner-moonrise',
			'wishart-ridge',
			'hidden-rank-one',
			'sparse-galaxy',
			'same-spectrum'
		].includes(state.preset)
	);
	const fixedNonsymmetric = $derived(state.preset === 'non-normal-trap');
	const distributionFixed = $derived(state.preset === 'sparse-galaxy');
	const meanFixed = $derived(fixedNonsymmetric);
	const sparsityFixed = $derived(fixedNonsymmetric);
	let constraintNote = $derived(
		state.preset === 'sparse-galaxy'
			? 'Sparse galaxy uses its own symmetric Bernoulli-edge generator, so the entry-distribution choice is fixed. Mean, scale and sparsity still change that model.'
			: fixedNonsymmetric
				? 'Non-normal trap is intrinsically nonsymmetric, with mean and sparsity fixed at zero. “Variance 1/n” is identical to unscaled here; distribution and scale still control the perturbation, while global norm rescaling remains available.'
				: intrinsicallySymmetric
					? 'This preset is intrinsically symmetric, so the matrix class is fixed even if another experiment previously selected nonsymmetry.'
					: ''
	);

	function numberValue(event: Event): number {
		return Number((event.currentTarget as HTMLInputElement | HTMLSelectElement).value);
	}

	function stringValue(event: Event): string {
		return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
	}
</script>

<aside class="instrument-controls" aria-labelledby="random-matrix-controls-heading">
	<header>
		<div>
			<p>Experiment console</p>
			<h3 id="random-matrix-controls-heading">Generate the matrix</h3>
		</div>
		{#if busy}<span class="busy" aria-label="Calculation in progress">Computing…</span>{/if}
	</header>

	<div class="primary-fields">
		<label class="field span-two">
			<span>Preset</span>
			<select
				{disabled}
				value={state.preset}
				onchange={(event) => onchange({ preset: stringValue(event) as PresetId }, true)}
			>
				{#each Object.entries(PRESET_LABELS) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</label>

		<label class="field span-two">
			<span>Reproducibility seed</span>
			<input
				type="text"
				value={state.seed}
				maxlength="64"
				spellcheck="false"
				{disabled}
				onchange={(event) => onchange({ seed: stringValue(event).trim() || 'matrix-1729' }, true)}
			/>
		</label>
		<div class="seed-actions span-two" aria-label="Seed actions">
			<button type="button" {disabled} onclick={onreroll}>Reroll</button>
			<button type="button" {disabled} onclick={oncopyseed}>Copy seed</button>
		</div>

		<label class="field">
			<span>Dimension n</span>
			<input
				type="number"
				min="2"
				max="256"
				step="1"
				value={state.dimension}
				{disabled}
				onchange={(event) => onchange({ dimension: Math.round(numberValue(event)) }, true)}
			/>
		</label>
		<label class="field">
			<span>Mode</span>
			<select
				value={state.mode}
				{disabled}
				onchange={(event) => onchange({ mode: stringValue(event) as 'single' | 'ensemble' }, true)}
			>
				<option value="single">One matrix</option>
				<option value="ensemble">Ensemble</option>
			</select>
		</label>
	</div>

	<details open>
		<summary>Entry model <span>distribution, centre, scale</span></summary>
		<div class="field-grid">
			{#if constraintNote}<p class="constraint-note span-two">{constraintNote}</p>{/if}
			<label class="field span-two">
				<span>Entry distribution</span>
				<select
					value={state.distribution}
					disabled={disabled || distributionFixed}
					onchange={(event) =>
						onchange({ distribution: stringValue(event) as MatrixDistribution }, true)}
				>
					{#each distributions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Mean</span>
				<input
					type="number"
					min="-2"
					max="2"
					step="0.05"
					value={state.mean}
					disabled={disabled || meanFixed}
					onchange={(event) => onchange({ mean: numberValue(event) }, true)}
				/>
			</label>
			<label class="field">
				<span>Scale σ</span>
				<input
					type="number"
					min="0.01"
					max="4"
					step="0.01"
					value={state.scale}
					{disabled}
					onchange={(event) => onchange({ scale: Math.max(0.01, numberValue(event)) }, true)}
				/>
			</label>
			<label class="field span-two">
				<span>Normalisation</span>
				<select
					value={state.normalisation}
					{disabled}
					onchange={(event) =>
						onchange({ normalisation: stringValue(event) as MatrixNormalisation }, true)}
				>
					{#each normalisations as option (option.value)}
						<option
							value={option.value}
							disabled={fixedNonsymmetric && option.value === 'variance-1/n'}
							>{option.label}{fixedNonsymmetric && option.value === 'variance-1/n'
								? ' · same as unscaled here'
								: ''}</option
						>
					{/each}
				</select>
			</label>
		</div>
	</details>

	<details>
		<summary>Geometry <span>symmetry, shape, sparsity</span></summary>
		<div class="field-grid">
			<label class="field span-two">
				<span>Symmetry</span>
				<select
					value={state.symmetry}
					disabled={disabled || intrinsicallySymmetric || fixedNonsymmetric}
					onchange={(event) => onchange({ symmetry: stringValue(event) as MatrixSymmetry }, true)}
				>
					<option value="none">Real nonsymmetric</option>
					<option value="symmetric">Real symmetric</option>
				</select>
			</label>
			<label class="range-field span-two">
				<span
					><span>Rectangular aspect γ = n/m</span><output>{state.aspectRatio.toFixed(2)}</output
					></span
				>
				<input
					type="range"
					min="0.25"
					max="2"
					step="0.05"
					value={state.aspectRatio}
					disabled={disabled || state.preset !== 'wishart-ridge'}
					oninput={(event) => onchange({ aspectRatio: numberValue(event) })}
					onchange={(event) => onchange({ aspectRatio: numberValue(event) }, true)}
				/>
				<small>Used by the Wishart covariance experiment.</small>
			</label>
			<label class="range-field span-two">
				<span><span>Sparsity</span><output>{Math.round(state.sparsity * 100)}%</output></span>
				<input
					type="range"
					min="0"
					max="0.98"
					step="0.01"
					value={state.sparsity}
					disabled={disabled || sparsityFixed}
					oninput={(event) => onchange({ sparsity: numberValue(event) })}
					onchange={(event) => onchange({ sparsity: numberValue(event) }, true)}
				/>
			</label>
		</div>
	</details>

	<details>
		<summary>Planted structure <span>declared signal, not a verdict</span></summary>
		<div class="field-grid">
			<label class="field span-two">
				<span>Signal</span>
				<select
					value={state.signalType}
					{disabled}
					onchange={(event) => onchange({ signalType: stringValue(event) as SignalType }, true)}
				>
					{#each signals as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="range-field span-two">
				<span><span>Signal strength α</span><output>{state.signalStrength.toFixed(2)}</output></span
				>
				<input
					type="range"
					min="0"
					max="6"
					step="0.05"
					value={state.signalStrength}
					disabled={disabled || state.signalType === 'none'}
					oninput={(event) => onchange({ signalStrength: numberValue(event) })}
					onchange={(event) => onchange({ signalStrength: numberValue(event) }, true)}
				/>
			</label>
		</div>
	</details>

	<details>
		<summary>Display <span>theory and colour encoding</span></summary>
		<div class="field-grid">
			<label class="check-field span-two">
				<input
					type="checkbox"
					checked={state.theory}
					{disabled}
					onchange={(event) =>
						onchange({ theory: (event.currentTarget as HTMLInputElement).checked }, true)}
				/>
				<span>Show theoretical large-n reference</span>
			</label>
			<label class="field span-two">
				<span>Heatmap colour scale</span>
				<select
					value={state.colourScale}
					{disabled}
					onchange={(event) =>
						onchange({ colourScale: stringValue(event) as 'diverging' | 'sequential' }, true)}
				>
					<option value="diverging">Signed diverging, centred at zero</option>
					<option value="sequential">Sequential magnitude</option>
				</select>
			</label>
			<label class="check-field span-two">
				<input
					type="checkbox"
					checked={state.highContrast}
					{disabled}
					onchange={(event) =>
						onchange({ highContrast: (event.currentTarget as HTMLInputElement).checked }, true)}
				/>
				<span>High-contrast plot mode</span>
			</label>
		</div>
	</details>

	<footer>
		<button type="button" class="reset" {disabled} onclick={onreset}>Reset experiment</button>
		<p>Matrix generation and decomposition happen locally in a Worker.</p>
	</footer>
</aside>

<style>
	.instrument-controls {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--rm-rule);
		border-radius: var(--rm-radius);
		background: var(--rm-surface);
		color: var(--rm-ink);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		border-bottom: 1px solid var(--rm-rule);
		padding: 0.75rem;
	}
	header p,
	header h3,
	footer p {
		margin: 0;
	}
	header p {
		color: var(--rm-accent);
		font: 700 0.6875rem var(--rm-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	header h3 {
		margin-top: 0.12rem;
		font-size: 1rem;
	}
	.busy {
		color: var(--rm-muted);
		font: 700 0.7rem var(--rm-mono);
	}
	.primary-fields,
	.field-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		padding: 0.75rem;
	}
	details {
		border-top: 1px solid var(--rm-rule);
	}
	summary {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		padding: 0.55rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 750;
		cursor: pointer;
	}
	summary span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		font-weight: 500;
		text-align: right;
	}
	.span-two {
		grid-column: 1 / -1;
	}
	.field,
	.range-field {
		display: grid;
		min-width: 0;
		gap: 0.3rem;
		color: var(--rm-muted);
		font-size: 0.72rem;
		font-weight: 700;
	}
	.field input,
	.field select {
		width: 100%;
		min-width: 0;
		min-height: 2.75rem;
		box-sizing: border-box;
		border: 1px solid var(--rm-control);
		border-radius: 0.38rem;
		background: var(--rm-paper);
		padding: 0.48rem 0.55rem;
		color: var(--rm-ink);
		font: 600 0.78rem var(--rm-sans);
	}
	.field input[type='text'],
	.field input[type='number'] {
		font-family: var(--rm-mono);
		font-variant-numeric: tabular-nums;
	}
	.range-field > span {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.range-field output {
		color: var(--rm-ink);
		font-family: var(--rm-mono);
	}
	.range-field input {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--rm-accent);
	}
	.range-field small {
		font-weight: 500;
		line-height: 1.35;
	}
	.constraint-note {
		margin: 0;
		border-left: 3px solid var(--rm-theory);
		background: color-mix(in srgb, var(--rm-theory) 7%, transparent);
		padding: 0.5rem 0.6rem;
		color: var(--rm-muted);
		font-size: 0.72rem;
		line-height: 1.45;
	}
	.check-field {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		color: var(--rm-ink);
		font-size: 0.76rem;
		font-weight: 650;
	}
	.check-field input {
		width: 2.75rem;
		height: 2.75rem;
		accent-color: var(--rm-accent);
	}
	.seed-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid var(--rm-control);
		border-radius: 0.38rem;
		background: var(--rm-paper);
		padding: 0.45rem 0.65rem;
		color: var(--rm-ink);
		font: 750 0.76rem var(--rm-sans);
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: var(--rm-accent);
		color: var(--rm-accent);
	}
	button:disabled,
	input:disabled,
	select:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	footer {
		display: grid;
		gap: 0.45rem;
		border-top: 1px solid var(--rm-rule);
		padding: 0.75rem;
	}
	footer p {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		line-height: 1.4;
	}
	.reset {
		width: 100%;
	}
	:where(button, input, select, summary):focus-visible {
		outline: 3px solid var(--rm-focus);
		outline-offset: 2px;
	}
	@media (max-width: 30rem) {
		.primary-fields,
		.field-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.span-two {
			grid-column: 1;
		}
	}
	@media (forced-colors: active) {
		.instrument-controls,
		header,
		details,
		footer,
		button,
		.field input,
		.field select {
			border-color: CanvasText;
		}
	}
</style>
