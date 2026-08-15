<script lang="ts">
	import { onMount } from 'svelte';

	type CalibrationBin = {
		index: number;
		count: number;
		eventCount: number;
		meanPrediction: number;
		eventRate: number;
		wilson95: { lower: number; upper: number };
		minPrediction: number;
		maxPrediction: number;
	};

	type CalibrationCurves = {
		clinician: readonly CalibrationBin[];
		model: readonly CalibrationBin[];
		ensemble: readonly CalibrationBin[];
	};
	type ForecastDistributions = {
		clinician: readonly number[];
		model: readonly number[];
		ensemble: readonly number[];
	};

	type SeriesKey = keyof CalibrationCurves;
	type Series = {
		key: SeriesKey;
		label: string;
		marker: 'circle' | 'square' | 'diamond';
	};

	const series: Series[] = [
		{ key: 'clinician', label: 'Simulated clinician', marker: 'circle' },
		{ key: 'model', label: 'Simulated model', marker: 'square' },
		{ key: 'ensemble', label: 'Weighted ensemble', marker: 'diamond' }
	];

	let {
		calibration,
		distributions
	}: { calibration: CalibrationCurves; distributions: ForecastDistributions } = $props();
	let svgRegion = $state<HTMLElement>();
	let WIDTH = $state(620);
	let LEFT = $derived(WIDTH < 460 ? 47 : 78);
	let RIGHT = $derived(WIDTH < 460 ? 10 : 94);
	let TOP = $derived(WIDTH < 460 ? 42 : 44);
	let PLOT = $derived(Math.max(190, WIDTH - LEFT - RIGHT));
	let HEIGHT = $derived(TOP + PLOT + 118);
	let active = $state<{ series: SeriesKey; binIndex: number } | null>(null);
	let activeSeries = $derived(series.find((item) => item.key === active?.series) ?? null);
	let activeBin = $derived.by(() => {
		if (!active || !activeSeries) return null;
		const binIndex = active.binIndex;
		return calibration[activeSeries.key].find((bin) => bin.index === binIndex) ?? null;
	});

	function x(value: number): number {
		return LEFT + value * PLOT;
	}

	function y(value: number): number {
		return TOP + (1 - value) * PLOT;
	}

	function linePath(bins: readonly CalibrationBin[]): string {
		return bins
			.map(
				(bin, index) =>
					`${index ? 'L' : 'M'}${x(bin.meanPrediction).toFixed(2)},${y(bin.eventRate).toFixed(2)}`
			)
			.join(' ');
	}

	function inspect(key: SeriesKey, binIndex: number): void {
		active = { series: key, binIndex };
	}

	function handleKey(event: KeyboardEvent, key: SeriesKey, binIndex: number): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		inspect(key, binIndex);
	}

	function markerPath(marker: Series['marker'], cx: number, cy: number): string {
		if (marker === 'diamond') return `M${cx} ${cy - 6}l6 6-6 6-6-6Z`;
		return `M${cx - 5} ${cy - 5}h10v10h-10Z`;
	}

	function formatPercent(value: number): string {
		return `${(value * 100).toFixed(1)}%`;
	}

	function histogram(values: readonly number[], binCount = 20): number[] {
		const counts = Array.from({ length: binCount }, () => 0);
		for (const value of values) {
			const index = Math.min(binCount - 1, Math.max(0, Math.floor(value * binCount)));
			counts[index] += 1;
		}
		return counts;
	}

	let distributionHistograms = $derived({
		clinician: histogram(distributions.clinician),
		model: histogram(distributions.model),
		ensemble: histogram(distributions.ensemble)
	});

	onMount(() => {
		if (!svgRegion) return;
		const updateWidth = () => {
			if (!svgRegion) return;
			WIDTH = Math.max(260, Math.floor(svgRegion.getBoundingClientRect().width));
		};
		const observer = new ResizeObserver(updateWidth);
		observer.observe(svgRegion);
		updateWidth();
		return () => observer.disconnect();
	});
</script>

<section class="reliability" aria-labelledby="icu-reliability-heading">
	<header>
		<div>
			<p class="eyebrow">PROBABILITY HONESTY</p>
			<h3 id="icu-reliability-heading">Reliability diagram</h3>
		</div>
		<div class="legend" aria-label="Forecast series">
			{#each series as item (item.key)}
				<span class={item.key}><i class={item.marker} aria-hidden="true"></i>{item.label}</span>
			{/each}
		</div>
	</header>

	<figure data-testid="icu-reliability-diagram">
		<div class="svg-region" bind:this={svgRegion}>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				role="img"
				aria-labelledby="icu-reliability-title icu-reliability-description"
			>
				<title id="icu-reliability-title"
					>Square reliability diagram for three synthetic forecasts</title
				>
				<desc id="icu-reliability-description">
					Mean forecast probability is on the horizontal axis and observed synthetic event frequency
					is on the vertical axis. A neutral diagonal represents perfect calibration. Points include
					Wilson 95 percent uncertainty intervals. Focus a point to inspect its counts.
				</desc>
				<rect class="plot-background" x={LEFT} y={TOP} width={PLOT} height={PLOT} />
				<g class="grid">
					{#each [0, 0.2, 0.4, 0.6, 0.8, 1] as tick}
						<line x1={x(tick)} x2={x(tick)} y1={TOP} y2={TOP + PLOT} />
						<line x1={LEFT} x2={LEFT + PLOT} y1={y(tick)} y2={y(tick)} />
						<text x={x(tick)} y={TOP + PLOT + 24} text-anchor="middle"
							>{Math.round(tick * 100)}%</text
						>
						<text x={LEFT - 12} y={y(tick) + 4} text-anchor="end">{Math.round(tick * 100)}%</text>
					{/each}
				</g>
				<line class="perfect" x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} />
				{#if WIDTH >= 400}
					<text
						class="perfect-label"
						x={x(0.69)}
						y={y(0.69) - 9}
						transform={`rotate(-45 ${x(0.69)} ${y(0.69) - 9})`}
					>
						perfect calibration
					</text>
				{/if}

				{#each series as item (item.key)}
					<path class={`series-line ${item.key}`} d={linePath(calibration[item.key])} />
					{#each calibration[item.key] as bin (bin.index)}
						<g
							class={`point ${item.key}`}
							class:selected={active?.series === item.key && active?.binIndex === bin.index}
							role="button"
							tabindex="0"
							aria-label={`${item.label}, bin ${bin.index + 1}: ${bin.count} cases, ${bin.eventCount} events, mean prediction ${formatPercent(bin.meanPrediction)}, event frequency ${formatPercent(bin.eventRate)}, Wilson 95 percent interval ${formatPercent(bin.wilson95.lower)} to ${formatPercent(bin.wilson95.upper)}`}
							onfocus={() => inspect(item.key, bin.index)}
							onclick={() => inspect(item.key, bin.index)}
							onkeydown={(event) => handleKey(event, item.key, bin.index)}
						>
							<rect
								class="hit-target"
								x={x(bin.meanPrediction) - 22}
								y={y(bin.eventRate) - 22}
								width="44"
								height="44"
								rx="22"
							/>
							<line
								class="whisker"
								x1={x(bin.meanPrediction)}
								x2={x(bin.meanPrediction)}
								y1={y(bin.wilson95.lower)}
								y2={y(bin.wilson95.upper)}
							/>
							<line
								class="whisker-cap"
								x1={x(bin.meanPrediction) - 4}
								x2={x(bin.meanPrediction) + 4}
								y1={y(bin.wilson95.lower)}
								y2={y(bin.wilson95.lower)}
							/>
							<line
								class="whisker-cap"
								x1={x(bin.meanPrediction) - 4}
								x2={x(bin.meanPrediction) + 4}
								y1={y(bin.wilson95.upper)}
								y2={y(bin.wilson95.upper)}
							/>
							{#if item.marker === 'circle'}
								<circle cx={x(bin.meanPrediction)} cy={y(bin.eventRate)} r="5.5" />
							{:else}
								<path d={markerPath(item.marker, x(bin.meanPrediction), y(bin.eventRate))} />
							{/if}
						</g>
					{/each}
				{/each}

				<g class="rug" aria-hidden="true">
					<text x={LEFT} y={TOP + PLOT + 49}>forecast distribution histogram</text>
					{#each series as item, seriesIndex (item.key)}
						{@const counts = distributionHistograms[item.key]}
						{@const maximumCount = Math.max(1, ...counts)}
						{#each counts as count, binIndex (binIndex)}
							<rect
								class={item.key}
								x={LEFT + (binIndex / counts.length) * PLOT}
								y={TOP + PLOT + 57 + seriesIndex * 9 + (1 - count / maximumCount) * 7}
								width={Math.max(1, PLOT / counts.length - 1)}
								height={(count / maximumCount) * 7}
							/>
						{/each}
					{/each}
				</g>
				<text class="axis-title" x={LEFT + PLOT / 2} y={HEIGHT - 10} text-anchor="middle">
					Mean forecast probability
				</text>
				{#if WIDTH >= 760}
					<text
						class="axis-title"
						x="18"
						y={TOP + PLOT / 2}
						text-anchor="middle"
						transform={`rotate(-90 18 ${TOP + PLOT / 2})`}
					>
						Observed synthetic event frequency
					</text>
				{:else}
					<text class="axis-title" x={LEFT} y="18">Observed event frequency</text>
				{/if}
			</svg>
		</div>

		{#if activeBin && activeSeries}
			<div class={`tooltip ${activeSeries.key}`} role="status" aria-live="polite">
				<span class={`tooltip-marker ${activeSeries.marker}`} aria-hidden="true"></span>
				<p>
					<strong>{activeSeries.label} · bin {activeBin.index + 1}</strong>
					{activeBin.count} cases · {activeBin.eventCount} events · mean prediction
					{formatPercent(activeBin.meanPrediction)} · event frequency {formatPercent(
						activeBin.eventRate
					)}
					· Wilson 95% interval {formatPercent(activeBin.wilson95.lower)}–{formatPercent(
						activeBin.wilson95.upper
					)}
				</p>
			</div>
		{:else}
			<p class="inspection-hint">Tap or focus a marker for its bin counts and uncertainty.</p>
		{/if}
	</figure>

	<p class="caption">
		Calibration asks whether synthetic cases assigned roughly <em>x</em>% risk experience the
		generated event roughly <em>x</em>% of the time. Ten equal-count bins are requested; tied,
		constant forecasts collapse to fewer defensible bins.
	</p>

	<details>
		<summary>Calibration point table</summary>
		<div class="table-scroll">
			<table>
				<caption>All reliability points plotted above</caption>
				<thead>
					<tr>
						<th scope="col">Series</th><th scope="col">Bin</th><th scope="col">Cases</th><th
							scope="col">Events</th
						><th scope="col">Mean forecast</th><th scope="col">Event frequency</th><th scope="col"
							>Wilson 95%</th
						>
					</tr>
				</thead>
				<tbody>
					{#each series as item (item.key)}
						{#each calibration[item.key] as bin (bin.index)}
							<tr>
								<th scope="row">{item.label}</th>
								<td>{bin.index + 1}</td>
								<td>{bin.count}</td>
								<td>{bin.eventCount}</td>
								<td>{formatPercent(bin.meanPrediction)}</td>
								<td>{formatPercent(bin.eventRate)}</td>
								<td>{formatPercent(bin.wilson95.lower)}–{formatPercent(bin.wilson95.upper)}</td>
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

<style>
	.reliability {
		display: grid;
		min-width: 0;
		gap: 0.7rem;
	}

	header,
	.legend,
	.legend span,
	.tooltip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	header p,
	header h3,
	figure,
	.caption,
	.tooltip p,
	.inspection-hint {
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

	.legend {
		flex-wrap: wrap;
		justify-content: flex-end;
		font: 0.62rem/1.2 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.legend span {
		justify-content: flex-start;
		gap: 0.3rem;
		white-space: nowrap;
		--series: var(--icu-ensemble);
	}

	.legend span.clinician {
		--series: var(--icu-clinician);
	}

	.legend span.model {
		--series: var(--icu-model);
	}

	.legend i,
	.tooltip-marker {
		display: block;
		width: 0.58rem;
		height: 0.58rem;
		border: 2px solid var(--series);
	}

	.legend i.circle,
	.tooltip-marker.circle {
		border-radius: 50%;
	}

	.legend i.diamond,
	.tooltip-marker.diamond {
		transform: rotate(45deg);
	}

	figure {
		min-width: 0;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.55rem;
		background: var(--icu-plot-paper, var(--paper));
		padding: 0.55rem;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		margin-inline: auto;
		overflow: visible;
	}

	.svg-region {
		width: min(100%, 42rem);
		min-width: 0;
		margin-inline: auto;
	}

	.plot-background {
		fill: var(--icu-plot-paper, var(--paper));
		stroke: var(--icu-rule, var(--rule));
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	.grid line {
		stroke: var(--icu-rule, var(--rule));
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.grid text,
	.axis-title,
	.rug text,
	.perfect-label {
		fill: var(--icu-muted, var(--ink-muted));
		font: 12px var(--icu-mono, var(--font-mono, ui-monospace, monospace));
	}

	.axis-title {
		font-weight: 730;
	}

	.perfect {
		stroke: var(--icu-reference);
		stroke-dasharray: 8 5;
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}

	.perfect-label {
		fill: var(--icu-reference);
	}

	.series-line {
		fill: none;
		stroke-width: 2.2;
		vector-effect: non-scaling-stroke;
	}

	.series-line.clinician,
	.point.clinician,
	.rug .clinician {
		stroke: var(--icu-clinician);
	}

	.series-line.model,
	.point.model,
	.rug .model {
		stroke: var(--icu-model);
	}

	.series-line.model {
		stroke-dasharray: 8 5;
	}

	.series-line.ensemble,
	.point.ensemble,
	.rug .ensemble {
		stroke: var(--icu-ensemble);
	}

	.series-line.ensemble {
		stroke-width: 3.2;
	}

	.point {
		cursor: pointer;
		outline: none;
	}

	.point .hit-target {
		fill: transparent;
		stroke: none;
		pointer-events: all;
	}

	.point circle,
	.point path {
		fill: var(--icu-plot-paper, var(--paper));
		stroke: inherit;
		stroke-width: 2.5;
		vector-effect: non-scaling-stroke;
	}

	.whisker,
	.whisker-cap {
		stroke: inherit;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.point:hover circle,
	.point:hover path,
	.point:focus circle,
	.point:focus path,
	.point.selected circle,
	.point.selected path {
		stroke-width: 4;
	}

	.point:focus circle,
	.point:focus path {
		filter: drop-shadow(0 0 2px var(--icu-focus, var(--accent)));
	}

	.rug rect {
		fill: none;
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	.tooltip,
	.inspection-hint {
		min-height: 2.75rem;
		margin-top: 0.35rem;
		border-radius: 0.4rem;
		background: var(--icu-raised, var(--paper-raised));
		padding: 0.5rem 0.6rem;
		color: var(--icu-muted, var(--ink-muted));
		font: 0.65rem/1.4 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.tooltip {
		justify-content: flex-start;
		--series: var(--icu-ensemble);
	}

	.tooltip.clinician {
		--series: var(--icu-clinician);
	}

	.tooltip.model {
		--series: var(--icu-model);
	}

	.tooltip-marker {
		flex: none;
	}

	.tooltip strong {
		display: block;
		color: var(--icu-ink, var(--ink));
	}

	.caption {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.69rem/1.5 var(--icu-sans, var(--font-sans, sans-serif));
	}

	details {
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.45rem;
		background: var(--icu-raised, var(--paper-raised));
	}

	summary {
		min-height: 2.75rem;
		padding: 0.7rem;
		font: 740 0.7rem var(--icu-sans, var(--font-sans, sans-serif));
		cursor: pointer;
	}

	.table-scroll {
		overflow-x: auto;
		border-top: 1px solid var(--icu-rule, var(--rule));
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font: 0.63rem/1.35 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		font-variant-numeric: tabular-nums;
	}

	caption {
		padding: 0.55rem;
		text-align: left;
	}

	th,
	td {
		border-top: 1px solid var(--icu-rule, var(--rule));
		padding: 0.42rem;
		text-align: right;
		white-space: nowrap;
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	:where(summary):focus-visible {
		outline: 3px solid var(--icu-focus, var(--focus-ring, var(--accent)));
		outline-offset: 2px;
	}

	@container icu-lab (max-width: 44rem) {
		header {
			align-items: flex-start;
			flex-direction: column;
		}

		.legend {
			justify-content: flex-start;
		}
	}

	@media (forced-colors: active) {
		figure,
		details,
		.table-scroll,
		th,
		td {
			border-color: CanvasText;
		}

		.series-line,
		.point,
		.rug rect,
		.perfect {
			stroke: CanvasText;
		}
	}
</style>
