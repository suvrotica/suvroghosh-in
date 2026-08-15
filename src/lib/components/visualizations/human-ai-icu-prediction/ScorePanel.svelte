<script lang="ts">
	import { onMount } from 'svelte';

	type ScoreMetrics = {
		brierScores: {
			clinician: number;
			model: number;
			ensemble: number;
			constantPrevalence: number;
		};
		ensembleGain: number;
		observedEventRate: number;
		meanPredictions: { clinician: number; model: number; ensemble: number };
		realizedAuc: { clinician: number | null; model: number | null; ensemble: number | null };
		weightedAverageLoss: number;
		diversityTerm: number;
	};

	type WeightCurve = {
		points: readonly { clinicianWeight: number; brierScore: number }[];
		hindsightOptimalWeight: number | null;
		hindsightMinimumBrier: number | null;
		identifiable: boolean;
	};

	let {
		metrics,
		weightCurve,
		clinicianWeight
	}: {
		metrics: ScoreMetrics;
		weightCurve: WeightCurve;
		clinicianWeight: number;
	} = $props();
	let svgRegion = $state<HTMLElement>();
	let WIDTH = $state(760);
	let HEIGHT = $derived(WIDTH < 430 ? 310 : 330);
	let MARGIN = $derived({
		top: WIDTH < 430 ? 38 : 32,
		right: WIDTH < 430 ? 10 : 28,
		bottom: WIDTH < 430 ? 66 : 62,
		left: WIDTH < 430 ? 45 : 64
	});

	let scoreCards = $derived([
		{
			key: 'clinician',
			label: 'Clinician Brier',
			value: metrics.brierScores.clinician,
			detail: `AUC ${format(metrics.realizedAuc.clinician, 3)}`
		},
		{
			key: 'model',
			label: 'Model Brier',
			value: metrics.brierScores.model,
			detail: `AUC ${format(metrics.realizedAuc.model, 3)}`
		},
		{
			key: 'ensemble',
			label: 'Ensemble Brier',
			value: metrics.brierScores.ensemble,
			detail: `AUC ${format(metrics.realizedAuc.ensemble, 3)}`
		}
	]);
	let plotWidth = $derived(WIDTH - MARGIN.left - MARGIN.right);
	let plotHeight = $derived(HEIGHT - MARGIN.top - MARGIN.bottom);
	let yMaximum = $derived.by(() => {
		const maximum = Math.max(
			metrics.brierScores.clinician,
			metrics.brierScores.model,
			metrics.brierScores.ensemble,
			metrics.brierScores.constantPrevalence,
			...weightCurve.points.map((point) => point.brierScore)
		);
		return Math.min(1, Math.max(0.25, Math.ceil((maximum + 0.01) * 20) / 20));
	});
	let curvePath = $derived(
		weightCurve.points
			.map(
				(point, index) =>
					`${index ? 'L' : 'M'}${x(point.clinicianWeight).toFixed(2)},${y(point.brierScore).toFixed(2)}`
			)
			.join(' ')
	);
	let currentScore = $derived(interpolatedScore(clinicianWeight));
	let gainLabel = $derived(
		metrics.ensembleGain > 0.00005
			? `+${metrics.ensembleGain.toFixed(4)}`
			: metrics.ensembleGain < -0.00005
				? metrics.ensembleGain.toFixed(4)
				: '0.0000'
	);

	function x(weight: number): number {
		return MARGIN.left + weight * plotWidth;
	}

	function y(score: number): number {
		return MARGIN.top + plotHeight * (1 - score / yMaximum);
	}

	function format(value: number | null, digits = 4): string {
		return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
	}

	function interpolatedScore(weight: number): number {
		if (!weightCurve.points.length) return metrics.brierScores.ensemble;
		let closest = weightCurve.points[0];
		for (const point of weightCurve.points) {
			if (Math.abs(point.clinicianWeight - weight) < Math.abs(closest.clinicianWeight - weight)) {
				closest = point;
			}
		}
		return closest.brierScore;
	}

	onMount(() => {
		if (!svgRegion) return;
		const updateWidth = () => {
			if (!svgRegion) return;
			WIDTH = Math.max(270, Math.floor(svgRegion.getBoundingClientRect().width));
		};
		const observer = new ResizeObserver(updateWidth);
		observer.observe(svgRegion);
		updateWidth();
		return () => observer.disconnect();
	});
</script>

<section class="score-panel" aria-labelledby="icu-scores-heading">
	<header>
		<div>
			<p class="eyebrow">PROBABILITY LOSS</p>
			<h3 id="icu-scores-heading">Brier score across the mixture</h3>
		</div>
		<p class:positive={metrics.ensembleGain > 0} class="gain">
			<span>Gain versus better member</span>
			<strong>{gainLabel}</strong>
		</p>
	</header>

	<div class="score-cards">
		{#each scoreCards as card (card.key)}
			<article class={card.key}>
				<span
					class={`marker ${card.key === 'clinician' ? 'circle' : card.key === 'model' ? 'square' : 'diamond'}`}
					aria-hidden="true"
				></span>
				<p>{card.label}</p>
				<strong>{card.value.toFixed(4)}</strong>
				<small>{card.detail}</small>
			</article>
		{/each}
	</div>

	<figure data-testid="icu-score-curve">
		<figcaption>
			<strong>Ensemble Brier score by clinician weight</strong>
			<span
				>Lower is better · vertical scale explicitly starts at 0 and ends at {yMaximum.toFixed(
					2
				)}</span
			>
		</figcaption>
		<div class="svg-region" bind:this={svgRegion}>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				role="img"
				aria-labelledby="icu-score-curve-title icu-score-curve-description"
			>
				<title id="icu-score-curve-title">Brier score across clinician ensemble weights</title>
				<desc id="icu-score-curve-description">
					The curve shows cohort Brier score from model only at weight zero to clinician only at
					weight one. The current clinician weight is {clinicianWeight.toFixed(2)} with score
					{currentScore.toFixed(4)}.
				</desc>
				<g class="grid">
					{#each [0, 0.25, 0.5, 0.75, 1] as fraction}
						<line
							x1={MARGIN.left}
							x2={WIDTH - MARGIN.right}
							y1={y(fraction * yMaximum)}
							y2={y(fraction * yMaximum)}
						/>
						<text x={MARGIN.left - 10} y={y(fraction * yMaximum) + 4} text-anchor="end">
							{(fraction * yMaximum).toFixed(2)}
						</text>
					{/each}
					{#each [0, 0.25, 0.5, 0.75, 1] as weight}
						<line x1={x(weight)} x2={x(weight)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
						<text x={x(weight)} y={HEIGHT - MARGIN.bottom + 21} text-anchor="middle">
							{weight.toFixed(2)}
						</text>
					{/each}
				</g>
				<line
					class="reference clinician"
					x1={MARGIN.left}
					x2={WIDTH - MARGIN.right}
					y1={y(metrics.brierScores.clinician)}
					y2={y(metrics.brierScores.clinician)}
				/>
				<line
					class="reference model"
					x1={MARGIN.left}
					x2={WIDTH - MARGIN.right}
					y1={y(metrics.brierScores.model)}
					y2={y(metrics.brierScores.model)}
				/>
				<path class="curve" d={curvePath} />
				<line
					class="current-line"
					x1={x(clinicianWeight)}
					x2={x(clinicianWeight)}
					y1={MARGIN.top}
					y2={HEIGHT - MARGIN.bottom}
				/>
				<path
					class="current-marker"
					d={`M ${x(clinicianWeight)} ${y(currentScore) - 7} l 7 7 -7 7 -7 -7 Z`}
				/>
				<text
					class="current-label"
					x={Math.min(WIDTH - MARGIN.right - 80, Math.max(MARGIN.left + 80, x(clinicianWeight)))}
					y={Math.max(MARGIN.top + 14, y(currentScore) - 12)}
					text-anchor="middle"
				>
					current w = {clinicianWeight.toFixed(2)} · {currentScore.toFixed(4)}
				</text>
				<text class="axis-label" x={MARGIN.left} y={HEIGHT - 12}>Model only</text>
				<text class="axis-label" x={WIDTH - MARGIN.right} y={HEIGHT - 12} text-anchor="end">
					Clinician only
				</text>
				{#if WIDTH >= 760}
					<text
						class="axis-title"
						x={16}
						y={MARGIN.top + plotHeight / 2}
						text-anchor="middle"
						transform={`rotate(-90 16 ${MARGIN.top + plotHeight / 2})`}
					>
						Brier score
					</text>
				{:else}
					<text class="axis-title" x={MARGIN.left} y="18">Brier score</text>
				{/if}
			</svg>
		</div>
	</figure>

	<div class="score-notes">
		<p>
			<strong>Constant-prevalence reference</strong>
			{metrics.brierScores.constantPrevalence.toFixed(4)} at an observed synthetic event rate of
			{(metrics.observedEventRate * 100).toFixed(1)}%.
		</p>
		<p>
			<strong>Hindsight minimum</strong>
			{#if weightCurve.identifiable && weightCurve.hindsightOptimalWeight !== null}
				w = {weightCurve.hindsightOptimalWeight.toFixed(2)} · Brier
				{format(weightCurve.hindsightMinimumBrier)}.
			{:else}
				— · the forecasts are effectively identical, so a unique optimum is not identifiable.
			{/if}
		</p>
	</div>
	<p class="hindsight-caveat">
		Lowest score in hindsight on this same synthetic cohort—not a deployable weight.
	</p>
	<p class="identity-note">
		The pool’s Brier score ({metrics.brierScores.ensemble.toFixed(4)}) is no worse than the
		weighted-average loss ({metrics.weightedAverageLoss.toFixed(4)}) by a diversity term of
		{metrics.diversityTerm.toFixed(4)}. It can still be worse than the better member.
	</p>
</section>

<style>
	.score-panel {
		display: grid;
		min-width: 0;
		gap: 0.75rem;
	}

	header,
	.gain,
	.score-cards article,
	.score-notes {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
	}

	header p,
	header h3,
	.score-cards p,
	.score-notes p,
	.hindsight-caveat,
	.identity-note,
	figure,
	figcaption {
		margin: 0;
	}

	.eyebrow {
		color: var(--icu-accent, var(--accent));
		font: 760 0.62rem var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		letter-spacing: 0.09em;
	}

	header h3 {
		margin-top: 0.15rem;
		font: 790 clamp(1rem, 2cqi, 1.25rem)/1.2 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.gain {
		align-items: flex-end;
		flex-direction: column;
		gap: 0.08rem;
		text-align: right;
	}

	.gain span {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.62rem var(--icu-sans, var(--font-sans, sans-serif));
	}

	.gain strong {
		font: 820 1rem var(--icu-mono, var(--font-mono, ui-monospace, monospace));
	}

	.gain.positive strong {
		color: var(--icu-ensemble);
	}

	.score-cards {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.score-cards article {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.18rem 0.42rem;
		min-width: 0;
		border: 1px solid var(--icu-rule, var(--rule));
		border-top: 3px solid var(--series);
		border-radius: 0.5rem;
		background: var(--icu-raised, var(--paper-raised));
		padding: 0.55rem;
		--series: var(--icu-ensemble);
	}

	.score-cards article.clinician {
		--series: var(--icu-clinician);
	}

	.score-cards article.model {
		--series: var(--icu-model);
	}

	.score-cards article p {
		align-self: center;
		min-width: 0;
		color: var(--icu-muted, var(--ink-muted));
		font: 690 0.66rem/1.3 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.score-cards article strong {
		align-self: center;
		font: 820 clamp(0.88rem, 2cqi, 1.12rem)
			var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		font-variant-numeric: tabular-nums;
	}

	.score-cards article small {
		grid-column: 2 / -1;
		color: var(--icu-muted, var(--ink-muted));
		font: 0.58rem var(--icu-mono, var(--font-mono, ui-monospace, monospace));
	}

	.marker {
		width: 0.62rem;
		height: 0.62rem;
		align-self: center;
		border: 2px solid var(--series);
	}

	.marker.circle {
		border-radius: 50%;
	}

	.marker.diamond {
		transform: rotate(45deg);
	}

	figure {
		min-width: 0;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.55rem;
		background: var(--icu-plot-paper, var(--paper));
		padding: 0.65rem;
	}

	figcaption {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		font: 740 0.71rem/1.4 var(--icu-sans, var(--font-sans, sans-serif));
	}

	figcaption span {
		color: var(--icu-muted, var(--ink-muted));
		font-weight: 500;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}

	.svg-region {
		width: 100%;
		min-width: 0;
		margin-top: 0.35rem;
	}

	.grid line {
		stroke: var(--icu-rule, var(--rule));
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.grid text,
	.axis-label,
	.axis-title,
	.current-label {
		fill: var(--icu-muted, var(--ink-muted));
		font: 12px var(--icu-mono, var(--font-mono, ui-monospace, monospace));
	}

	.axis-title {
		font-weight: 720;
	}

	.reference {
		stroke-width: 1.5;
		stroke-dasharray: 7 5;
		vector-effect: non-scaling-stroke;
	}

	.reference.clinician {
		stroke: var(--icu-clinician);
	}

	.reference.model {
		stroke: var(--icu-model);
		stroke-dasharray: 2 5;
	}

	.curve {
		fill: none;
		stroke: var(--icu-ensemble);
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
	}

	.current-line {
		stroke: var(--icu-ink, var(--ink));
		stroke-dasharray: 3 4;
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	.current-marker {
		fill: var(--icu-plot-paper, var(--paper));
		stroke: var(--icu-ensemble);
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
	}

	.current-label {
		fill: var(--icu-ink, var(--ink));
		font-weight: 760;
	}

	.score-notes {
		align-items: stretch;
	}

	.score-notes p {
		flex: 1 1 0;
		border-left: 2px solid var(--icu-rule, var(--rule));
		padding-left: 0.55rem;
		color: var(--icu-muted, var(--ink-muted));
		font: 0.65rem/1.45 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.score-notes strong {
		display: block;
		color: var(--icu-ink, var(--ink));
	}

	.hindsight-caveat,
	.identity-note {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.64rem/1.45 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.hindsight-caveat {
		margin-top: -0.35rem;
		font-style: italic;
	}

	.identity-note {
		border-radius: 0.4rem;
		background: color-mix(in oklab, var(--icu-ensemble) 7%, var(--icu-raised, var(--paper-raised)));
		padding: 0.55rem;
	}

	@container icu-lab (max-width: 38rem) {
		header,
		figcaption,
		.score-notes {
			align-items: flex-start;
			flex-direction: column;
		}

		.gain {
			align-items: flex-start;
			text-align: left;
		}

		.score-cards {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (forced-colors: active) {
		.score-cards article,
		figure,
		.identity-note {
			border-color: CanvasText;
		}

		.curve,
		.reference,
		.current-marker,
		.current-line {
			stroke: CanvasText;
		}
	}
</style>
