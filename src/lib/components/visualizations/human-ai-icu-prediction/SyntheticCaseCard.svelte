<script lang="ts">
	type SyntheticCase = {
		index: number;
		id: string;
		outcome: 0 | 1;
		probabilities: { clinician: number; model: number; ensemble: number };
		squaredLosses: { clinician: number; model: number; ensemble: number };
	};

	type Rail = {
		key: 'clinician' | 'model' | 'ensemble';
		label: string;
		marker: 'circle' | 'square' | 'diamond';
	};

	const rails: Rail[] = [
		{ key: 'clinician', label: 'Simulated clinician', marker: 'circle' },
		{ key: 'model', label: 'Simulated model', marker: 'square' },
		{ key: 'ensemble', label: 'Weighted ensemble', marker: 'diamond' }
	];

	let {
		caseRecord,
		clinicianWeight,
		totalCases,
		positiveOutcomeLabel,
		negativeOutcomeLabel,
		onprevious,
		onnext
	}: {
		caseRecord: SyntheticCase;
		clinicianWeight: number;
		totalCases: number;
		positiveOutcomeLabel: string;
		negativeOutcomeLabel: string;
		onprevious: () => void;
		onnext: () => void;
	} = $props();

	function percent(value: number): string {
		return `${(value * 100).toFixed(1)}%`;
	}

	function loss(value: number): string {
		return value.toFixed(4);
	}
</script>

<section
	class="case-card"
	aria-labelledby="icu-case-heading"
	data-testid="icu-selected-case"
	data-case-index={caseRecord.index}
>
	<header>
		<div>
			<p class="eyebrow">SELECTED SYNTHETIC RECORD</p>
			<h3 id="icu-case-heading">Synthetic case {caseRecord.id}</h3>
		</div>
		<p class="outcome">
			<span>Realized synthetic outcome</span>
			<strong>{caseRecord.outcome === 1 ? positiveOutcomeLabel : negativeOutcomeLabel}</strong>
		</p>
	</header>

	<div class="scale" aria-hidden="true">
		<span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
	</div>

	<div class="rails">
		{#each rails as rail (rail.key)}
			{@const probability = caseRecord.probabilities[rail.key]}
			<div class={`rail-row ${rail.key}`}>
				<div class="rail-label">
					<span class={`marker ${rail.marker}`} aria-hidden="true"></span>
					<strong>{rail.label}</strong>
				</div>
				<div
					class="track"
					role="img"
					aria-label={`${rail.label} forecast ${percent(probability)}, squared loss ${loss(caseRecord.squaredLosses[rail.key])}`}
				>
					<span class="grid-lines" aria-hidden="true"></span>
					<span class="fill" style={`--probability:${probability * 100}%`}></span>
					<span class={`point ${rail.marker}`} style={`--probability:${probability * 100}%`}></span>
				</div>
				<output>{percent(probability)}</output>
				<span class="loss"
					><small>squared loss</small>{loss(caseRecord.squaredLosses[rail.key])}</span
				>
			</div>
		{/each}
	</div>

	<div class="arithmetic">
		<p>
			<strong>Ensemble arithmetic</strong>
			<code>
				{clinicianWeight.toFixed(2)} × {percent(caseRecord.probabilities.clinician)} +
				{(1 - clinicianWeight).toFixed(2)} × {percent(caseRecord.probabilities.model)} =
				{percent(caseRecord.probabilities.ensemble)}
			</code>
		</p>
		<p>
			The simulator records a binary outcome and evaluated forecasts. It does not claim an
			observable “true individual risk”.
		</p>
	</div>

	<nav aria-label="Browse synthetic cases">
		<button type="button" onclick={onprevious}>
			<span aria-hidden="true">←</span> Previous
		</button>
		<span>Case {caseRecord.index + 1} of {totalCases}</span>
		<button type="button" onclick={onnext}>
			Next <span aria-hidden="true">→</span>
		</button>
	</nav>
</section>

<style>
	.case-card {
		min-width: 0;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.65rem;
		background: var(--icu-raised, var(--paper-raised));
		padding: clamp(0.7rem, 1.5cqi, 1rem);
	}

	header,
	.outcome,
	.arithmetic,
	nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
	}

	header p,
	header h3,
	.arithmetic p {
		margin: 0;
	}

	.eyebrow {
		color: var(--icu-accent, var(--accent));
		font: 760 0.62rem/1.2 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		letter-spacing: 0.09em;
	}

	header h3 {
		margin-top: 0.14rem;
		font: 790 clamp(1rem, 2cqi, 1.25rem)/1.2 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.outcome {
		align-items: flex-end;
		flex-direction: column;
		gap: 0.08rem;
		text-align: right;
	}

	.outcome span,
	.loss small {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.62rem/1.25 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.outcome strong {
		font: 780 0.78rem/1.3 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.scale {
		display: flex;
		justify-content: space-between;
		margin: 0.9rem 8.3rem 0.15rem 9.3rem;
		color: var(--icu-muted, var(--ink-muted));
		font: 0.61rem/1 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
	}

	.rails {
		display: grid;
		gap: 0.4rem;
	}

	.rail-row {
		display: grid;
		grid-template-columns: minmax(7.8rem, 9rem) minmax(8rem, 1fr) 4.2rem 4.8rem;
		gap: 0.45rem;
		align-items: center;
		min-width: 0;
		--series: var(--icu-ensemble);
	}

	.rail-row.clinician {
		--series: var(--icu-clinician);
	}

	.rail-row.model {
		--series: var(--icu-model);
	}

	.rail-label {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.42rem;
		font: 720 0.69rem/1.25 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.rail-label strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.marker {
		display: block;
		width: 0.64rem;
		height: 0.64rem;
		flex: none;
		border: 2px solid var(--series);
		background: var(--icu-raised, var(--paper-raised));
	}

	.circle {
		border-radius: 50%;
	}

	.diamond {
		transform: rotate(45deg);
	}

	.track {
		position: relative;
		height: 1.25rem;
		overflow: hidden;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 999px;
		background: var(--icu-paper, var(--paper));
	}

	.grid-lines {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			to right,
			transparent 0 calc(25% - 1px),
			color-mix(in oklab, var(--icu-rule, var(--rule)) 66%, transparent) calc(25% - 1px) 25%
		);
	}

	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--probability);
		background: color-mix(in oklab, var(--series) 28%, transparent);
	}

	.model .fill {
		background: repeating-linear-gradient(
			135deg,
			color-mix(in oklab, var(--series) 32%, transparent) 0 4px,
			transparent 4px 8px
		);
	}

	.point {
		position: absolute;
		top: 50%;
		left: clamp(0.38rem, var(--probability), calc(100% - 0.38rem));
		width: 0.62rem;
		height: 0.62rem;
		border: 2px solid var(--series);
		background: var(--icu-paper, var(--paper));
		translate: -50% -50%;
	}

	output,
	.loss {
		font: 760 0.68rem/1.2 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.loss small {
		display: block;
		font-size: 0.54rem;
	}

	.arithmetic {
		align-items: flex-start;
		margin-top: 0.75rem;
		border-block: 1px solid var(--icu-rule, var(--rule));
		padding-block: 0.65rem;
	}

	.arithmetic p {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.66rem/1.45 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.arithmetic p:first-child {
		flex: 1 1 60%;
	}

	.arithmetic p:last-child {
		max-width: 19rem;
	}

	.arithmetic strong,
	.arithmetic code {
		display: block;
	}

	.arithmetic strong {
		color: var(--icu-ink, var(--ink));
	}

	.arithmetic code {
		margin-top: 0.15rem;
		color: var(--icu-ensemble);
		font: 720 0.68rem/1.4 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		white-space: normal;
	}

	nav {
		margin-top: 0.65rem;
	}

	nav button {
		min-width: 6.4rem;
		min-height: 2.75rem;
		border: 1px solid var(--icu-control, var(--control-border));
		border-radius: 0.45rem;
		background: var(--icu-paper, var(--paper));
		color: var(--icu-ink, var(--ink));
		font: 740 0.7rem var(--icu-sans, var(--font-sans, sans-serif));
		cursor: pointer;
	}

	nav > span {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.65rem var(--icu-mono, var(--font-mono, ui-monospace, monospace));
	}

	button:focus-visible {
		outline: 3px solid var(--icu-focus, var(--focus-ring, var(--accent)));
		outline-offset: 2px;
	}

	@container icu-lab (max-width: 42rem) {
		header,
		.arithmetic {
			align-items: flex-start;
			flex-direction: column;
		}

		.outcome {
			align-items: flex-start;
			text-align: left;
		}

		.scale {
			margin-right: 0;
			margin-left: 0;
		}

		.rail-row {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 0.25rem 0.5rem;
		}

		.track {
			grid-column: 1 / -1;
			grid-row: 2;
		}

		output {
			grid-column: 2;
			grid-row: 1;
		}

		.loss {
			grid-column: 1 / -1;
			grid-row: 3;
			text-align: left;
		}

		.loss small {
			display: inline;
			margin-right: 0.3rem;
		}
	}

	@container icu-lab (max-width: 25rem) {
		nav {
			align-items: stretch;
			flex-wrap: wrap;
		}

		nav button {
			flex: 1 1 7rem;
		}

		nav > span {
			order: -1;
			width: 100%;
			text-align: center;
		}
	}

	@media (forced-colors: active) {
		.case-card,
		.track,
		.arithmetic,
		nav button,
		.marker,
		.point {
			border-color: CanvasText;
		}
	}
</style>
