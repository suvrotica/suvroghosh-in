<script lang="ts">
	import { scaleLinear, ticks, format } from 'd3';
	import { probabilityMassSeries } from '$lib/synthetic-data-lab/chart-series';
	let {
		values = [],
		baseline = [],
		name = 'value',
		color = '#087f80',
		bins = 32,
		density = [],
		mass = false
	}: {
		values?: number[];
		baseline?: number[];
		name?: string;
		color?: string;
		bins?: number;
		density?: { x: number; y: number }[];
		mass?: boolean;
	} = $props();
	const width = 760,
		height = 296,
		left = 52,
		right = 18,
		top = 22,
		bottom = 40;
	let hover = $state<number | null>(null);
	let massSeries = $derived(probabilityMassSeries(values, baseline, density));
	let domain = $derived.by(() => {
		if (mass) {
			const support = massSeries.points.map((point) => point.x);
			if (!support.length) return [0, 1];
			const gaps = support
				.slice(1)
				.map((value, index) => value - support[index])
				.filter((gap) => gap > 0);
			const padding =
				(gaps.length ? Math.min(...gaps) : Math.max(1, Math.abs(support[0]) * 0.1)) * 0.5;
			return [support[0] - padding, support[support.length - 1] + padding];
		}
		const all = [...values, ...baseline].filter(Number.isFinite);
		if (!all.length) return [0, 1];
		let lo = Math.min(...all),
			hi = Math.max(...all);
		if (lo === hi) {
			lo -= 0.5;
			hi += 0.5;
		}
		return [lo, hi];
	});
	let x = $derived(
		scaleLinear()
			.domain(domain)
			.range([left, width - right])
	);
	function histogram(data: number[]) {
		const step = (domain[1] - domain[0]) / bins;
		const counts = Array.from({ length: bins }, () => 0);
		for (const value of data)
			if (Number.isFinite(value))
				counts[Math.min(bins - 1, Math.max(0, Math.floor((value - domain[0]) / step)))]++;
		return counts.map((count, i) => ({
			lo: domain[0] + step * i,
			hi: domain[0] + step * (i + 1),
			count,
			density: count / (Math.max(1, data.length) * step)
		}));
	}
	let bars = $derived(histogram(values));
	let oldBars = $derived(histogram(baseline));
	let yMax = $derived(
		mass
			? Math.max(
					0.01,
					...massSeries.points.map((point) =>
						Math.max(point.probability, point.baselineProbability, point.modelProbability ?? 0)
					)
				)
			: Math.max(
					0.001,
					...bars.map((b) => b.density),
					...oldBars.map((b) => b.density),
					...density.map((d) => d.y)
				)
	);
	let y = $derived(
		scaleLinear()
			.domain([0, yMax * 1.12])
			.range([height - bottom, top])
	);
	let densityPath = $derived(
		!mass && density.length
			? density.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join(' ')
			: ''
	);
	let supportBarWidth = $derived.by(() => {
		const points = massSeries.points;
		const gaps = points.slice(1).map((point, index) => x(point.x) - x(points[index].x));
		return Math.max(2, Math.min(30, (gaps.length ? Math.min(...gaps) : 40) * 0.65));
	});
	let xTicks = $derived(
		mass
			? massSeries.points
					.filter((_, i) => i % Math.max(1, Math.ceil(massSeries.points.length / 9)) === 0)
					.map((point) => point.x)
			: ticks(domain[0], domain[1], 7)
	);
	let number = format('~g');
</script>

<div class="chart" style={`--plot-color:${color}`}>
	<svg
		viewBox={`0 0 ${width} ${height}`}
		role="img"
		aria-label={`Distribution of ${name}, ${values.length.toLocaleString()} observed values. ${mass ? `Point probabilities at ${massSeries.points.length} displayed support values.` : `Histogram density with ${bins} bins.`}`}
	>
		<desc
			>{mass
				? 'Each bar height is the fraction of nonmissing observations equal to that exact support value. Model PMF stems and dots show point probabilities without connecting lines. Coral outlines show baseline probabilities on the same support.'
				: 'Each bar represents the proportion of generated values in an interval, divided by the interval width. Coral outlines show the pinned baseline when one is selected.'}</desc
		>
		{#each y.ticks(4) as tick}<g class="grid"
				><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text
					x={left - 10}
					y={y(tick) + 4}
					text-anchor="end">{format('.2~g')(tick)}</text
				></g
			>{/each}
		{#if mass}
			{#each massSeries.points as point, i}
				<rect
					role="presentation"
					class="bar"
					x={x(point.x) - supportBarWidth / 2}
					y={y(point.probability)}
					width={supportBarWidth}
					height={height - bottom - y(point.probability)}
					rx="1"
					opacity={hover === i ? 1 : 0.82}
					onpointerenter={() => (hover = i)}
					onpointerleave={() => (hover = null)}
					><title
						>{name} = {number(point.x)} · {point.count.toLocaleString()} values · probability {format(
							'.4~g'
						)(point.probability)} ({format('.1%')(point.probability)})</title
					></rect
				>
				{#if baseline.length}<rect
						class="baseline"
						x={x(point.x) - supportBarWidth / 2}
						y={y(point.baselineProbability)}
						width={supportBarWidth}
						height={height - bottom - y(point.baselineProbability)}
					/>{/if}
				{#if point.modelProbability !== undefined}<line
						class="pmf"
						x1={x(point.x)}
						x2={x(point.x)}
						y1={height - bottom}
						y2={y(point.modelProbability)}
					/><circle class="pmf-dot" cx={x(point.x)} cy={y(point.modelProbability)} r="3.3"
						><title
							>Model P({name} = {number(point.x)}) = {format('.4~g')(point.modelProbability)}</title
						></circle
					>{/if}
			{/each}
		{:else}
			{#each bars as bar, i}
				<rect
					role="presentation"
					class="bar"
					x={x(bar.lo) + 1}
					y={y(bar.density)}
					width={Math.max(1, x(bar.hi) - x(bar.lo) - 2)}
					height={height - bottom - y(bar.density)}
					rx="1"
					opacity={hover === i ? 1 : 0.82}
					onpointerenter={() => (hover = i)}
					onpointerleave={() => (hover = null)}
				>
					<title
						>{name}: {number(bar.lo)} to {number(bar.hi)} · {bar.count.toLocaleString()} values · {(
							(bar.count / Math.max(1, values.length)) *
							100
						).toFixed(1)}%</title
					>
				</rect>
			{/each}
			{#if baseline.length}{#each oldBars as bar}<rect
						class="baseline"
						x={x(bar.lo) + 1}
						y={y(bar.density)}
						width={Math.max(1, x(bar.hi) - x(bar.lo) - 2)}
						height={height - bottom - y(bar.density)}
					/>{/each}{/if}
			{#if densityPath}<path d={densityPath} class="theory" />{/if}
		{/if}
		<line class="axis" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} />
		{#each xTicks as tick}<text
				class="tick"
				x={x(tick)}
				y={height - bottom + 21}
				text-anchor="middle">{number(tick)}</text
			>{/each}
		<text class="label" x={left} y="12">{mass ? 'PROBABILITY' : 'DENSITY'}</text>
		<text class="label" x={width - right} y={height - 2} text-anchor="end">{name}</text>
		{#if !values.length}<text class="empty" x={width / 2} y={height / 2} text-anchor="middle"
				>Your distribution appears here</text
			>{/if}
	</svg>
	{#if mass && hover !== null && massSeries.points[hover]}<div class="readout">
			{number(massSeries.points[hover].x)}
			<strong
				>{format('.1%')(massSeries.points[hover].probability)} · {massSeries.points[
					hover
				].count.toLocaleString()} values</strong
			>
		</div>
	{:else if !mass && hover !== null && bars[hover]}<div class="readout">
			{number(bars[hover].lo)}–{number(bars[hover].hi)}
			<strong>{bars[hover].count.toLocaleString()} values</strong>
		</div>{/if}
	{#if mass && massSeries.supportCount > massSeries.points.length}<p class="support-note">
			Showing {massSeries.points.length} of {massSeries.supportCount} support values. Omitted observed
			mass: {format('.2%')(massSeries.omittedProbability)}{baseline.length
				? `; baseline: ${format('.2%')(massSeries.omittedBaselineProbability)}`
				: ''}{density.length
				? `; model mass omitted from supplied support: ${format('.2%')(massSeries.omittedModelProbability)}`
				: ''}. Displayed probabilities retain their original denominators.
		</p>{/if}
	{#if mass && density.length}<p class="support-note">
			Model PMF marks cover the supplied support points; tail mass beyond that computed support is
			not shown.
		</p>{/if}
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		min-width: 0;
	}
	svg {
		width: 100%;
		display: block;
		overflow: visible;
		font-family: inherit;
	}
	.grid line {
		stroke: #dce3df;
		stroke-dasharray: 3 5;
	}
	.grid text,
	.tick {
		font-size: 11px;
		fill: #52665b;
		font-variant-numeric: tabular-nums;
	}
	.bar {
		fill: var(--plot-color);
		transition: opacity 0.1s;
	}
	.baseline {
		fill: none;
		stroke: #bd6844;
		stroke-width: 1.6;
		pointer-events: none;
	}
	.axis {
		stroke: #abbcb7;
	}
	.label {
		font-size: 10px;
		letter-spacing: 1.2px;
		fill: #52665b;
	}
	.empty {
		font-size: 15px;
		fill: #52665b;
	}
	.theory {
		fill: none;
		stroke: #213e49;
		stroke-width: 2;
		stroke-dasharray: 5 3;
		pointer-events: none;
	}
	.pmf {
		stroke: #213e49;
		stroke-width: 1.4;
		pointer-events: none;
	}
	.pmf-dot {
		fill: #52665b;
		stroke: #fffef9;
		stroke-width: 0.8;
	}
	.support-note {
		font-size: 10px;
		line-height: 1.7;
		color: #52665b;
		margin: 10px 12px 0;
	}
	.readout {
		position: absolute;
		top: 0;
		right: 10px;
		background: #eff7f3;
		border: 1px solid #d6e6de;
		padding: 6px 10px;
		border-radius: 6px;
		font-size: 11px;
		color: #47605b;
		display: flex;
		gap: 12px;
	}
</style>
