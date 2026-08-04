<script lang="ts">
	import type { ChartPoint, DiagnosticId, HistogramBin } from './ui-types';

	type Props = {
		available: readonly DiagnosticId[];
		active: DiagnosticId;
		onselect: (id: DiagnosticId) => void;
		measured?: readonly ChartPoint[];
		theoretical?: readonly ChartPoint[];
		scatter?: readonly ChartPoint[];
		histogram?: readonly HistogramBin[];
		xLabel: string;
		yLabel: string;
		summary: string;
		logarithmic?: boolean;
	};

	let {
		available,
		active,
		onselect,
		measured = [],
		theoretical = [],
		scatter = [],
		histogram = [],
		xLabel,
		yLabel,
		summary,
		logarithmic = false
	}: Props = $props();

	const labels: Readonly<Record<DiagnosticId, string>> = {
		trajectory: 'Trajectory',
		distribution: 'Distribution',
		msd: 'Mean-square displacement',
		autocorrelation: 'Autocorrelation',
		'phase-space': 'Phase space',
		'first-passage': 'First passage'
	};

	const plot = { left: 58, right: 738, top: 22, bottom: 244 } as const;

	function transformed(value: number): number {
		return logarithmic ? Math.log10(Math.max(value, 1e-12)) : value;
	}

	let allPoints = $derived([...measured, ...theoretical, ...scatter]);
	let xValues = $derived(
		histogram.length > 0
			? histogram.flatMap((bin) => [bin.minimum, bin.maximum])
			: allPoints.map((point) => transformed(point.x))
	);
	let yValues = $derived(
		histogram.length > 0
			? histogram.flatMap((bin) => [bin.count, bin.theoreticalDensity ?? 0])
			: allPoints.map((point) => transformed(point.y))
	);
	let xMin = $derived(Math.min(...xValues, 0));
	let xMax = $derived(Math.max(...xValues, 1));
	let yMin = $derived(Math.min(...yValues, 0));
	let yMax = $derived(Math.max(...yValues, 1));

	function sx(value: number): number {
		const v = logarithmic ? transformed(value) : value;
		return (
			plot.left + ((v - xMin) / Math.max(Number.EPSILON, xMax - xMin)) * (plot.right - plot.left)
		);
	}

	function sy(value: number): number {
		const v = logarithmic ? transformed(value) : value;
		return (
			plot.bottom - ((v - yMin) / Math.max(Number.EPSILON, yMax - yMin)) * (plot.bottom - plot.top)
		);
	}

	function path(points: readonly ChartPoint[]): string {
		return points
			.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
			.map(
				(point, index) =>
					`${index === 0 ? 'M' : 'L'}${sx(point.x).toFixed(2)},${sy(point.y).toFixed(2)}`
			)
			.join(' ');
	}

	function format(value: number): string {
		if (!Number.isFinite(value)) return '—';
		if (Math.abs(value) >= 10_000 || (value !== 0 && Math.abs(value) < 0.001))
			return value.toExponential(2);
		return value.toFixed(Math.abs(value) < 10 ? 2 : 1);
	}

	function tabKey(event: KeyboardEvent, id: DiagnosticId): void {
		const index = available.indexOf(id);
		let next: number;
		if (event.key === 'ArrowRight') next = (index + 1) % available.length;
		else if (event.key === 'ArrowLeft') next = (index - 1 + available.length) % available.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = available.length - 1;
		else return;
		event.preventDefault();
		onselect(available[next]);
		document.getElementById(`brownian-diagnostic-${available[next]}`)?.focus();
	}
</script>

<section class="diagnostics" aria-labelledby="brownian-diagnostics-title">
	<h3 id="brownian-diagnostics-title" class="sr-only">Statistical diagnostics</h3>
	<div class="tabs" role="tablist" aria-label="Statistical diagnostic">
		{#each available as diagnostic (diagnostic)}
			<button
				id={`brownian-diagnostic-${diagnostic}`}
				type="button"
				role="tab"
				aria-selected={active === diagnostic}
				aria-controls="brownian-diagnostic-panel"
				tabindex={active === diagnostic ? 0 : -1}
				class:active={active === diagnostic}
				onclick={() => onselect(diagnostic)}
				onkeydown={(event) => tabKey(event, diagnostic)}
			>
				{labels[diagnostic]}
			</button>
		{/each}
	</div>

	<div
		id="brownian-diagnostic-panel"
		class="chart-panel"
		role="tabpanel"
		aria-labelledby={`brownian-diagnostic-${active}`}
	>
		<div class="chart-heading">
			<div>
				<p class="kicker">{labels[active]}</p>
				<p>{summary}</p>
			</div>
			<div class="legend" aria-label="Line legend">
				<span><i class="measured"></i> measured</span>
				{#if theoretical.length > 0 || histogram.some((bin) => bin.theoreticalDensity !== undefined)}
					<span><i class="theory"></i> theoretical</span>
				{/if}
			</div>
		</div>

		<svg viewBox="0 0 760 280" role="img" aria-labelledby="diagnostic-title diagnostic-desc">
			<title id="diagnostic-title">{labels[active]} chart</title>
			<desc id="diagnostic-desc">{summary}</desc>
			<g class="grid" aria-hidden="true">
				{#each [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
					<line
						x1={plot.left}
						x2={plot.right}
						y1={plot.bottom - fraction * (plot.bottom - plot.top)}
						y2={plot.bottom - fraction * (plot.bottom - plot.top)}
					/>
				{/each}
			</g>
			<line class="axis" x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
			<line class="axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} />
			<text class="tick" x={plot.left} y="260">{format(xMin)}</text>
			<text class="tick" x={plot.right} y="260" text-anchor="end">{format(xMax)}</text>
			<text class="tick" x="50" y={plot.bottom + 4} text-anchor="end">{format(yMin)}</text>
			<text class="tick" x="50" y={plot.top + 4} text-anchor="end">{format(yMax)}</text>
			<text class="axis-label" x={(plot.left + plot.right) / 2} y="278" text-anchor="middle"
				>{xLabel}</text
			>
			<text
				class="axis-label"
				x="12"
				y={(plot.top + plot.bottom) / 2}
				text-anchor="middle"
				transform={`rotate(-90 12 ${(plot.top + plot.bottom) / 2})`}>{yLabel}</text
			>

			{#if histogram.length > 0}
				{#each histogram as bin (bin.minimum)}
					<rect
						class="bar"
						x={sx(bin.minimum) + 0.5}
						y={sy(bin.count)}
						width={Math.max(1, sx(bin.maximum) - sx(bin.minimum) - 1)}
						height={Math.max(0, plot.bottom - sy(bin.count))}
					/>
				{/each}
				{@const density = histogram
					.filter((bin) => bin.theoreticalDensity !== undefined)
					.map((bin) => ({
						x: (bin.minimum + bin.maximum) / 2,
						y: bin.theoreticalDensity ?? 0
					}))}
				{#if density.length > 1}<path class="theory-line" d={path(density)} />{/if}
			{:else}
				{#if measured.length > 1}<path class="measured-line" d={path(measured)} />{/if}
				{#if theoretical.length > 1}<path class="theory-line" d={path(theoretical)} />{/if}
				{#each scatter.slice(0, 600) as point, index (`${index}-${point.x}-${point.y}`)}
					<circle class="scatter" cx={sx(point.x)} cy={sy(point.y)} r="2.2" />
				{/each}
			{/if}
		</svg>

		<details>
			<summary>Accessible data table</summary>
			<table>
				<thead
					><tr><th>{xLabel}</th><th>Measured {yLabel}</th><th>Theoretical {yLabel}</th></tr></thead
				>
				<tbody>
					{#each measured.slice(-12) as point, index (`row-${index}-${point.x}`)}
						<tr>
							<td>{format(point.x)}</td>
							<td>{format(point.y)}</td>
							<td
								>{format(
									theoretical[
										Math.min(index + Math.max(0, theoretical.length - 12), theoretical.length - 1)
									]?.y ?? Number.NaN
								)}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</details>
	</div>
</section>

<style>
	.diagnostics {
		border-top: 1px solid var(--rule, #c8c1b2);
		background: var(--paper-raised, #f6f2e8);
	}
	.tabs {
		display: flex;
		overflow-x: auto;
		border-bottom: 1px solid var(--rule, #c8c1b2);
	}
	.tabs button {
		min-height: 2.8rem;
		flex: 1 0 auto;
		border: 0;
		border-right: 1px solid var(--rule, #c8c1b2);
		background: transparent;
		padding: 0.55rem 0.8rem;
		color: var(--ink-muted, #68707a);
		font-weight: 700;
		cursor: pointer;
	}
	.tabs button.active {
		box-shadow: inset 0 -3px var(--lab-rust, #9b5f48);
		background: color-mix(in srgb, var(--lab-rust, #9b5f48) 8%, transparent);
		color: var(--ink, #242a32);
	}
	.tabs button:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--lab-accent, #6f7fa8) 70%, white);
		outline-offset: -3px;
	}
	.chart-panel {
		padding: 0.85rem 1rem 1rem;
	}
	.chart-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.chart-heading p {
		margin: 0.15rem 0 0;
		color: var(--ink-muted, #68707a);
		font-size: 0.78rem;
	}
	.chart-heading .kicker {
		color: var(--ink, #242a32);
		font:
			700 0.68rem 'Courier Prime',
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.7rem;
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.legend i {
		display: inline-block;
		width: 1.5rem;
		border-top: 2px solid var(--lab-accent, #6f7fa8);
	}
	.legend i.theory {
		border-top-color: var(--lab-rust, #9b5f48);
		border-top-style: dashed;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 22rem;
		margin-top: 0.5rem;
	}
	.grid line,
	.axis {
		stroke: color-mix(in srgb, var(--rule, #c8c1b2) 75%, transparent);
		stroke-width: 1;
	}
	.axis {
		stroke: var(--ink-muted, #68707a);
	}
	.tick,
	.axis-label {
		fill: var(--ink-muted, #68707a);
		font:
			11px 'Courier Prime',
			monospace;
	}
	.measured-line,
	.theory-line {
		fill: none;
		vector-effect: non-scaling-stroke;
	}
	.measured-line {
		stroke: var(--lab-accent, #6f7fa8);
		stroke-width: 2.4;
	}
	.theory-line {
		stroke: var(--lab-rust, #9b5f48);
		stroke-width: 2;
		stroke-dasharray: 7 6;
	}
	.bar,
	.scatter {
		fill: color-mix(in srgb, var(--lab-accent, #6f7fa8) 68%, transparent);
	}
	details {
		margin-top: 0.5rem;
		border-top: 1px solid var(--rule, #c8c1b2);
		padding-top: 0.55rem;
		font-size: 0.75rem;
	}
	summary {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		cursor: pointer;
		font-weight: 700;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0.5rem;
	}
	th,
	td {
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.35rem;
		text-align: right;
	}
	th:first-child,
	td:first-child {
		text-align: left;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	@media (max-width: 40rem) {
		.chart-panel {
			padding-inline: 0.45rem;
		}
		.chart-heading {
			display: block;
			padding-inline: 0.35rem;
		}
		.legend {
			margin-top: 0.5rem;
		}
	}
</style>
