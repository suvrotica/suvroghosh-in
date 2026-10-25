<script lang="ts">
	import { scaleLinear, ticks, format } from 'd3';
	let {
		xValues = [],
		yValues = [],
		xName = 'x',
		yName = 'y',
		mode = 'scatter',
		colorValues = []
	}: {
		xValues?: number[];
		yValues?: number[];
		xName?: string;
		yName?: string;
		mode?: 'scatter' | 'line' | 'cdf';
		colorValues?: unknown[];
	} = $props();
	const width = 430,
		height = 242,
		left = 48,
		right = 14,
		top = 18,
		bottom = 37;
	let points = $derived.by(() => {
		if (mode === 'cdf') {
			const sorted = xValues.filter(Number.isFinite).sort((a, b) => a - b);
			const stride = Math.max(1, Math.ceil(sorted.length / 600));
			return sorted
				.filter((_, i) => i % stride === 0 || i === sorted.length - 1)
				.map((v, i) => ({ x: v, y: Math.min(1, (i * stride + 1) / sorted.length), c: 0 }));
		}
		return xValues
			.map((v, i) => ({ x: v, y: yValues[i], c: colorValues[i] }))
			.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
	});
	function domain(values: number[]) {
		if (!values.length) return [0, 1];
		const lo = Math.min(...values),
			hi = Math.max(...values);
		return lo === hi ? [lo - 0.5, hi + 0.5] : [lo, hi];
	}
	let x = $derived(
		scaleLinear()
			.domain(domain(points.map((p) => p.x)))
			.nice()
			.range([left, width - right])
	);
	let y = $derived(
		scaleLinear()
			.domain(mode === 'cdf' ? [0, 1] : domain(points.map((p) => p.y)))
			.nice()
			.range([height - bottom, top])
	);
	let line = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join(' '));
	let drawn = $derived(
		points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 1200)) === 0)
	);
	let groups = $derived([...new Set(colorValues)]);
	const colors = ['#087f80', '#dd8969', '#647ca5', '#ac819d', '#b5a94b'];
</script>

<svg
	viewBox={`0 0 ${width} ${height}`}
	role="img"
	aria-label={mode === 'cdf'
		? `Empirical cumulative distribution of ${xName}`
		: `${yName} against ${xName}, ${points.length.toLocaleString()} valid pairs`}
>
	<desc
		>{mode === 'cdf'
			? 'The curve shows the fraction of generated values at or below each x value.'
			: mode === 'line'
				? 'A line joins generated observations in their actual sequence order.'
				: 'Each dot represents a generated record. Large results use a deterministic display subset.'}</desc
	>
	{#each y.ticks(4) as t}<line class="grid" x1={left} x2={width - right} y1={y(t)} y2={y(t)} /><text
			class="tick"
			x={left - 8}
			y={y(t) + 4}
			text-anchor="end">{format('.3~g')(t)}</text
		>{/each}
	{#each x.ticks(5) as t}<text class="tick" x={x(t)} y={height - bottom + 18} text-anchor="middle"
			>{format('.3~g')(t)}</text
		>{/each}
	{#if mode === 'scatter'}{#each drawn as p}<circle
				cx={x(p.x)}
				cy={y(p.y)}
				r="2.3"
				fill={colors[Math.max(0, groups.indexOf(p.c)) % colors.length]}
				opacity=".36"
				><title>{xName}: {format('.4~g')(p.x)} · {yName}: {format('.4~g')(p.y)}</title></circle
			>{/each}{:else}<path d={line} fill="none" stroke="#087f80" stroke-width="2.3" />{/if}
	<line class="axis" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} />
	<text class="label" x={left} y="10"
		>{mode === 'cdf' ? 'CUMULATIVE PROBABILITY' : yName.toUpperCase()}</text
	>
	<text class="label" x={width - right} y={height - 1} text-anchor="end">{xName}</text>
	{#if !points.length}<text class="empty" x={width / 2} y={height / 2} text-anchor="middle"
			>Choose two numerical columns</text
		>{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		font-family: inherit;
	}
	.grid {
		stroke: #e2e8e3;
		stroke-dasharray: 3 4;
	}
	.axis {
		stroke: #b1c0b8;
	}
	.tick {
		font-size: 10px;
		fill: #52665b;
		font-variant-numeric: tabular-nums;
	}
	.label {
		font-size: 9px;
		letter-spacing: 0.8px;
		fill: #52665b;
	}
	.empty {
		font-size: 13px;
		fill: #52665b;
	}
</style>
