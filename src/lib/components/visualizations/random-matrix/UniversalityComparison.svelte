<script lang="ts">
	import { formatNumber, type UniversalityComparisonView } from './types';
	import {
		UNIVERSALITY_DISTRIBUTIONS,
		universalityEntryVariance,
		universalitySharedRadius
	} from './universality';

	let { comparison }: { comparison: UniversalityComparisonView } = $props();

	const size = 248;
	const margin = 25;
	let sharedRadius = $derived(universalitySharedRadius(comparison));
	let entryVariance = $derived(universalityEntryVariance(comparison));
	let plotScale = $derived((size - 2 * margin) / (2 * sharedRadius));

	function coordinateX(value: number): number {
		return size / 2 + value * plotScale;
	}

	function coordinateY(value: number): number {
		return size / 2 - value * plotScale;
	}

	function mean(values: readonly number[]): number {
		return values.length === 0
			? Number.NaN
			: values.reduce((total, value) => total + value, 0) / values.length;
	}
</script>

<section class="universality-comparison" aria-labelledby="universality-comparison-heading">
	<header>
		<div>
			<p class="kicker">MATCHED-MOMENT COMPARISON</p>
			<h4 id="universality-comparison-heading">Three microscopic laws, one macroscopic test</h4>
		</div>
		<p class="moment-note">
			{#if entryVariance === null}
				The noise draw in every panel has source mean {formatNumber(comparison.mean, 5)} and variance
				{formatNumber(comparison.scale ** 2, 5)} before the selected data-dependent normalisation and
				any planted structure.
			{:else}
				The noise draw in every panel has entry mean {formatNumber(comparison.mean, 5)} and variance {formatNumber(
					entryVariance,
					5
				)} before any planted structure.
			{/if}
		</p>
	</header>

	<div class="universality-grid" data-testid="random-matrix-universality-comparison">
		{#each UNIVERSALITY_DISTRIBUTIONS as distribution (distribution.id)}
			{@const summary = comparison.distributions[distribution.id]}
			<figure data-testid={`random-matrix-universality-${distribution.id}`}>
				<figcaption>
					<strong>{distribution.label}</strong>
					<span>{summary.completed.toLocaleString('en-GB')} matrices</span>
				</figcaption>
				<svg
					viewBox={`0 0 ${size} ${size}`}
					role="img"
					aria-label={`${distribution.label} eigenvalue cloud from ${summary.completed} matched-moment matrices`}
				>
					<rect
						class="plot-background"
						x={margin}
						y={margin}
						width={size - 2 * margin}
						height={size - 2 * margin}
					/>
					<line class="axis" x1={margin} x2={size - margin} y1={size / 2} y2={size / 2} />
					<line class="axis" x1={size / 2} x2={size / 2} y1={margin} y2={size - margin} />
					{#each summary.eigenvalues.slice(-2_400) as point, index (`${point.sample}:${index}`)}
						<circle
							class={`sample-point ${distribution.id}`}
							cx={coordinateX(point.real)}
							cy={coordinateY(point.imaginary)}
							r="1.15"
						/>
					{/each}
					<text class="axis-label" x={size - margin} y={size / 2 - 5} text-anchor="end">Re</text>
					<text class="axis-label" x={size / 2 + 5} y={margin + 11}>Im</text>
				</svg>
				<dl>
					<div>
						<dt>Eigenvalues shown</dt>
						<dd>{Math.min(2_400, summary.eigenvalues.length).toLocaleString('en-GB')}</dd>
					</div>
					<div>
						<dt>Mean ρ(A)</dt>
						<dd>{formatNumber(mean(summary.spectralRadii), 5)}</dd>
					</div>
				</dl>
			</figure>
		{/each}
	</div>
	<p class="comparison-note">
		All three plots share the same real and imaginary axes. Similar large-scale clouds are the
		comparison; no panel relies on the reader remembering an earlier run.
	</p>
</section>

<style>
	.universality-comparison {
		margin-top: 0.8rem;
		border: 1px solid var(--rm-rule);
		border-radius: 0.42rem;
		background: var(--rm-surface);
		padding: 0.75rem;
	}
	header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}
	.kicker,
	h4,
	.moment-note,
	figure,
	figcaption,
	.comparison-note,
	dl {
		margin: 0;
	}
	.kicker {
		color: var(--rm-accent);
		font: 750 0.6875rem var(--rm-mono);
		letter-spacing: 0.08em;
	}
	h4 {
		margin-top: 0.12rem;
		font-size: 0.95rem;
	}
	.moment-note {
		max-width: 30rem;
		color: var(--rm-muted);
		font-size: 0.7rem;
		line-height: 1.4;
		text-align: right;
	}
	.universality-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
		margin-top: 0.65rem;
	}
	figure {
		min-width: 0;
		border: 1px solid var(--rm-rule);
		border-radius: 0.35rem;
		background: var(--rm-paper);
		padding: 0.45rem;
	}
	figcaption {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	figcaption strong {
		font-size: 0.78rem;
	}
	figcaption span {
		color: var(--rm-muted);
		font: 650 0.6875rem var(--rm-mono);
	}
	svg {
		display: block;
		width: 100%;
		max-height: 16rem;
		margin-top: 0.3rem;
		touch-action: none;
	}
	.plot-background {
		fill: var(--rm-plot-paper);
		stroke: var(--rm-rule);
	}
	.axis {
		stroke: var(--rm-rule-strong);
		stroke-width: 0.8;
	}
	.sample-point {
		fill-opacity: 0.5;
	}
	.sample-point.gaussian {
		fill: var(--rm-point);
	}
	.sample-point.uniform {
		fill: var(--rm-selected);
	}
	.sample-point.rademacher {
		fill: var(--rm-accent);
	}
	.axis-label {
		fill: var(--rm-muted);
		font: 650 8px var(--rm-mono);
	}
	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
		border-top: 1px solid var(--rm-rule);
		padding-top: 0.4rem;
	}
	dt {
		color: var(--rm-muted);
		font-size: 0.625rem;
		text-transform: uppercase;
	}
	dd {
		margin: 0.1rem 0 0;
		font: 750 0.6875rem var(--rm-mono);
	}
	.comparison-note {
		margin-top: 0.55rem;
		color: var(--rm-muted);
		font-size: 0.7rem;
		line-height: 1.4;
	}
	@media (max-width: 58rem) {
		.universality-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		figure {
			display: grid;
			grid-template-columns: minmax(8rem, 0.65fr) minmax(12rem, 1.35fr);
			align-items: start;
			column-gap: 0.6rem;
		}
		figcaption,
		dl {
			grid-column: 1;
		}
		svg {
			grid-column: 2;
			grid-row: 1 / span 2;
			margin-top: 0;
		}
	}
	@media (max-width: 36rem) {
		header {
			align-items: start;
			flex-direction: column;
		}
		.moment-note {
			text-align: left;
		}
		figure {
			display: block;
		}
		svg {
			margin-top: 0.3rem;
		}
	}
	@media (forced-colors: active) {
		.universality-comparison,
		figure,
		.plot-background {
			border-color: CanvasText;
			stroke: CanvasText;
		}
		.sample-point {
			fill: Highlight;
		}
		.axis {
			stroke: CanvasText;
		}
	}
</style>
