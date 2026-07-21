<script lang="ts">
	import { theoreticalStandardError } from '$lib/visualizations/monte-carlo/statistics';
	import type { ChartMode, ConvergenceObservation } from '$lib/visualizations/monte-carlo/types';

	type Props = {
		observations: ConvergenceObservation[];
		mode: ChartMode;
		targetSamples: number;
		showTrail: boolean;
		showGuide: boolean;
	};

	let { observations, mode, targetSamples, showTrail, showGuide }: Props = $props();
	let highlighted = $state<ConvergenceObservation | null>(null);

	const width = 760;
	const height = 310;
	const margin = { top: 26, right: 24, bottom: 54, left: 70 };
	const plotWidth = width - margin.left - margin.right;
	const plotHeight = height - margin.top - margin.bottom;

	let maximumSample = $derived(
		Math.max(100, targetSamples, observations.at(-1)?.sampleCount ?? targetSamples)
	);
	let xTicks = $derived(
		[10, 100, 1_000, 10_000, 100_000, 1_000_000].filter((value) => value <= maximumSample)
	);
	let positiveErrors = $derived(
		observations.map((point) => point.absoluteError).filter((error) => error > 0)
	);
	let maximumError = $derived(
		Math.max(0.1, ...positiveErrors, theoreticalStandardError(Math.max(10, xTicks[0] ?? 10)))
	);
	let minimumError = $derived(
		Math.min(
			0.01,
			...(positiveErrors.length > 0 ? positiveErrors : [0.000_001]),
			theoreticalStandardError(maximumSample)
		) / 1.8
	);
	let estimateExtent = $derived.by(() => {
		const values = observations.map((point) => point.estimate);
		const minimum = Math.max(0, Math.min(Math.PI, ...values) - 0.12);
		const maximum = Math.min(4, Math.max(Math.PI, ...values) + 0.12);
		return maximum - minimum < 0.3
			? [Math.max(0, Math.PI - 0.2), Math.min(4, Math.PI + 0.2)]
			: [minimum, maximum];
	});
	let estimateTicks = $derived(
		Array.from(
			{ length: 5 },
			(_, index) => estimateExtent[0] + ((estimateExtent[1] - estimateExtent[0]) * index) / 4
		)
	);
	let errorTicks = $derived(
		[1, 0.1, 0.01, 0.001, 0.000_1, 0.000_01].filter(
			(value) => value <= maximumError * 1.05 && value >= minimumError * 0.95
		)
	);

	function xPosition(sampleCount: number) {
		const minimumLog = Math.log10(10);
		const maximumLog = Math.log10(maximumSample);
		const progress =
			(Math.log10(Math.max(10, sampleCount)) - minimumLog) / (maximumLog - minimumLog);
		return margin.left + progress * plotWidth;
	}

	function estimateY(value: number) {
		const progress = (value - estimateExtent[0]) / (estimateExtent[1] - estimateExtent[0]);
		return margin.top + (1 - progress) * plotHeight;
	}

	function errorY(value: number) {
		if (value <= 0) return margin.top + plotHeight;
		const minimumLog = Math.log10(minimumError);
		const maximumLog = Math.log10(maximumError);
		const progress = (Math.log10(value) - minimumLog) / (maximumLog - minimumLog);
		return margin.top + (1 - progress) * plotHeight;
	}

	function yPosition(point: ConvergenceObservation) {
		return mode === 'estimate' ? estimateY(point.estimate) : errorY(point.absoluteError);
	}

	function linePath(points: ConvergenceObservation[]) {
		return points
			.filter((point) => point.sampleCount >= 10)
			.map(
				(point, index) =>
					`${index === 0 ? 'M' : 'L'} ${xPosition(point.sampleCount).toFixed(2)} ${yPosition(point).toFixed(2)}`
			)
			.join(' ');
	}

	function guidePath() {
		return xTicks
			.map(
				(sampleCount, index) =>
					`${index === 0 ? 'M' : 'L'} ${xPosition(sampleCount).toFixed(2)} ${errorY(theoreticalStandardError(sampleCount)).toFixed(2)}`
			)
			.join(' ');
	}

	function formatCount(value: number) {
		if (value >= 1_000_000) return `${value / 1_000_000}m`;
		if (value >= 1_000) return `${value / 1_000}k`;
		return String(value);
	}

	function formatError(value: number) {
		return value !== 0 && value < 0.000_1 ? value.toExponential(2) : value.toFixed(6);
	}
</script>

<section class="chart-panel" aria-labelledby="convergence-heading">
	<div class="chart-heading-row">
		<div>
			<p class="eyebrow">Recorded at logarithmic checkpoints</p>
			<h3 id="convergence-heading">Convergence trace</h3>
		</div>
		<div class="legend" aria-label="Chart legend">
			<span
				><i class="estimate-key"></i>{mode === 'estimate' ? 'π estimate' : 'absolute error'}</span
			>
			{#if mode === 'estimate'}<span><i class="reference-key"></i>actual π</span>{/if}
			{#if mode === 'error' && showGuide}<span><i class="guide-key"></i>theoretical 1 SE</span>{/if}
		</div>
	</div>

	<div class="chart-wrap">
		<svg
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-labelledby="chart-title chart-description"
		>
			<title id="chart-title">
				{mode === 'estimate'
					? 'Monte Carlo estimate of pi by sample count'
					: 'Absolute error by sample count'}
			</title>
			<desc id="chart-description">
				The horizontal sample-count axis is logarithmic. Focus any observation to hear its precise
				values.
			</desc>

			<rect
				x={margin.left}
				y={margin.top}
				width={plotWidth}
				height={plotHeight}
				class="plot-background"
			/>

			{#each xTicks as tick (tick)}
				<line
					x1={xPosition(tick)}
					y1={margin.top}
					x2={xPosition(tick)}
					y2={margin.top + plotHeight}
					class="grid-line"
				/>
				<text
					x={xPosition(tick)}
					y={margin.top + plotHeight + 22}
					class="axis-tick"
					text-anchor="middle"
				>
					{formatCount(tick)}
				</text>
			{/each}

			{#if mode === 'estimate'}
				{#each estimateTicks as tick (tick)}
					<line
						x1={margin.left}
						y1={estimateY(tick)}
						x2={margin.left + plotWidth}
						y2={estimateY(tick)}
						class="grid-line"
					/>
					<text x={margin.left - 10} y={estimateY(tick) + 4} class="axis-tick" text-anchor="end">
						{tick.toFixed(2)}
					</text>
				{/each}
				<line
					x1={margin.left}
					y1={estimateY(Math.PI)}
					x2={margin.left + plotWidth}
					y2={estimateY(Math.PI)}
					class="reference-line"
				/>
			{:else}
				{#each errorTicks as tick (tick)}
					<line
						x1={margin.left}
						y1={errorY(tick)}
						x2={margin.left + plotWidth}
						y2={errorY(tick)}
						class="grid-line"
					/>
					<text x={margin.left - 10} y={errorY(tick) + 4} class="axis-tick" text-anchor="end">
						{tick >= 0.01 ? tick.toFixed(2) : tick.toExponential(0)}
					</text>
				{/each}
				{#if showGuide && xTicks.length > 1}
					<path d={guidePath()} class="guide-line" />
				{/if}
			{/if}

			{#if showTrail && observations.length > 1}
				<path d={linePath(observations)} class="estimate-line" />
			{/if}

			{#each observations as point (point.sampleCount)}
				<a
					href="#convergence-data-table"
					onmouseenter={() => (highlighted = point)}
					onmouseleave={() => (highlighted = null)}
					onfocus={() => (highlighted = point)}
					onblur={() => (highlighted = null)}
					aria-label={`${point.sampleCount.toLocaleString('en-IN')} samples, estimate ${point.estimate.toFixed(7)}, absolute error ${formatError(point.absoluteError)}`}
				>
					<circle
						cx={xPosition(point.sampleCount)}
						cy={yPosition(point)}
						r="4.2"
						class:zero-error={mode === 'error' && point.absoluteError === 0}
						class="observation-point"
					/>
				</a>
			{/each}

			<text x={margin.left + plotWidth / 2} y={height - 10} class="axis-label" text-anchor="middle">
				Samples N (log scale)
			</text>
			<text
				x="18"
				y={margin.top + plotHeight / 2}
				class="axis-label"
				text-anchor="middle"
				transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`}
			>
				{mode === 'estimate' ? 'Estimate of π' : 'Absolute error (log scale)'}
			</text>

			{#if highlighted}
				<g class="tooltip" aria-hidden="true">
					<rect x="472" y="35" width="250" height="64" rx="7" />
					<text x="486" y="58">N = {highlighted.sampleCount.toLocaleString('en-IN')}</text>
					<text x="486" y="80">
						π̂ = {highlighted.estimate.toFixed(7)} · error {formatError(highlighted.absoluteError)}
					</text>
				</g>
			{/if}
		</svg>
	</div>

	{#if observations.length === 0}
		<p class="empty-chart">The trace begins after 10 calculated samples.</p>
	{/if}

	<details class="data-table-details">
		<summary>Checkpoint data table ({observations.length} rows)</summary>
		<div class="table-scroll">
			<table id="convergence-data-table">
				<caption class="sr-only">Monte Carlo convergence checkpoints</caption>
				<thead>
					<tr
						><th scope="col">Samples</th><th scope="col">π estimate</th><th scope="col"
							>Absolute error</th
						></tr
					>
				</thead>
				<tbody>
					{#each observations as point (point.sampleCount)}
						<tr>
							<td>{point.sampleCount.toLocaleString('en-IN')}</td>
							<td>{point.estimate.toFixed(7)}</td>
							<td>{formatError(point.absoluteError)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

<style>
	.chart-panel {
		border-top: 1px solid #404040;
		background: #0a0a0a;
		padding: 1rem;
	}

	.chart-heading-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.65rem;
	}

	.eyebrow {
		margin: 0 0 0.2rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: #a3a3a3;
	}

	h3 {
		margin: 0;
		font-size: 1rem;
		color: #fafafa;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		font-size: 0.7rem;
		color: #d4d4d4;
	}

	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.legend i {
		display: inline-block;
		width: 1.25rem;
		border-top: 2px solid;
	}

	.estimate-key {
		border-color: #5eead4 !important;
	}

	.reference-key {
		border-color: #f5f5f5 !important;
		border-top-style: dashed !important;
	}

	.guide-key {
		border-color: #fdba74 !important;
		border-top-style: dashed !important;
	}

	.chart-wrap {
		overflow-x: auto;
		border: 1px solid #262626;
		border-radius: 0.65rem;
		background: #111827;
	}

	svg {
		display: block;
		width: 100%;
		min-width: 37rem;
		height: auto;
	}

	.plot-background {
		fill: #0b1320;
		stroke: #404040;
	}

	.grid-line {
		stroke: #64748b;
		stroke-width: 0.65;
		opacity: 0.24;
	}

	.axis-tick,
	.axis-label {
		fill: #d4d4d4;
		font-family: ui-monospace, monospace;
		font-size: 11px;
	}

	.axis-label {
		font-size: 12px;
		font-weight: 700;
	}

	.reference-line {
		stroke: #f5f5f5;
		stroke-width: 1.3;
		stroke-dasharray: 6 5;
		opacity: 0.75;
	}

	.guide-line {
		fill: none;
		stroke: #fdba74;
		stroke-width: 1.4;
		stroke-dasharray: 6 5;
		opacity: 0.86;
	}

	.estimate-line {
		fill: none;
		stroke: #5eead4;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.observation-point {
		fill: #99f6e4;
		stroke: #042f2e;
		stroke-width: 1.4;
	}

	a:focus .observation-point {
		stroke: #fff;
		stroke-width: 3;
	}

	.zero-error {
		fill: #fff;
	}

	.tooltip rect {
		fill: #050505;
		stroke: #737373;
	}

	.tooltip text {
		fill: #f5f5f5;
		font-family: ui-monospace, monospace;
		font-size: 11px;
	}

	.empty-chart {
		margin: 0.7rem 0 0;
		font-size: 0.75rem;
		color: #a3a3a3;
	}

	.data-table-details {
		margin-top: 0.8rem;
		font-size: 0.75rem;
		color: #d4d4d4;
	}

	summary {
		width: fit-content;
		min-height: 2.75rem;
		cursor: pointer;
		padding: 0.75rem 0;
		font-weight: 700;
	}

	.table-scroll {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}

	th,
	td {
		border-bottom: 1px solid #404040;
		padding: 0.5rem;
		text-align: right;
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	@media (min-width: 640px) {
		.chart-panel {
			padding: 1.25rem;
		}
	}
</style>
