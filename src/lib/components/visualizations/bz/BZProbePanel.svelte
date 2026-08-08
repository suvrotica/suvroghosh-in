<script lang="ts">
	export type BZProbeSample = {
		step: number;
		time: number;
		u: number;
		v: number;
	};

	type Props = {
		history?: readonly BZProbeSample[];
		point?: readonly [number, number];
		active?: boolean;
		onclear?: () => void;
		ondownload?: () => void;
	};

	let { history = [], point = [0.5, 0.5], active = true, onclear, ondownload }: Props = $props();

	const chartWidth = 420;
	const chartHeight = 154;
	const margin = { left: 38, right: 12, top: 14, bottom: 26 };

	function extent(values: readonly number[]): readonly [number, number] {
		if (values.length === 0) return [0, 1];
		let minimum = Math.min(...values);
		let maximum = Math.max(...values);
		if (!(maximum > minimum)) {
			const pad = Math.max(1e-6, Math.abs(minimum) * 0.05, 0.05);
			minimum -= pad;
			maximum += pad;
		}
		return [minimum, maximum];
	}

	function scale(
		value: number,
		domain: readonly [number, number],
		range: readonly [number, number]
	) {
		return range[0] + ((value - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0]);
	}

	function tracePath(field: 'u' | 'v'): string {
		if (history.length < 2) return '';
		const timeExtent = extent(history.map((sample) => sample.time));
		const valueExtent = extent(history.flatMap((sample) => [sample.u, sample.v]));
		return history
			.map((sample, index) => {
				const x = scale(sample.time, timeExtent, [margin.left, chartWidth - margin.right]);
				const y = scale(sample[field], valueExtent, [chartHeight - margin.bottom, margin.top]);
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function phasePath(): string {
		if (history.length < 2) return '';
		const uExtent = extent(history.map((sample) => sample.u));
		const vExtent = extent(history.map((sample) => sample.v));
		return history
			.map((sample, index) => {
				const x = scale(sample.u, uExtent, [margin.left, chartWidth - margin.right]);
				const y = scale(sample.v, vExtent, [chartHeight - margin.bottom, margin.top]);
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function format(value: number): string {
		if (!Number.isFinite(value)) return '—';
		return Math.abs(value) >= 100 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)
			? value.toExponential(3)
			: value.toFixed(4);
	}

	let latest = $derived(history.at(-1) ?? null);
	let valueExtent = $derived(extent(history.flatMap((sample) => [sample.u, sample.v])));
	let timeExtent = $derived(extent(history.map((sample) => sample.time)));
	let uExtent = $derived(extent(history.map((sample) => sample.u)));
	let vExtent = $derived(extent(history.map((sample) => sample.v)));
</script>

<section class="probe" aria-labelledby="bz-probe-heading">
	<header>
		<div>
			<p class="eyebrow">Local instrument</p>
			<h3 id="bz-probe-heading">Probe history & phase portrait</h3>
		</div>
		<div class="probe-actions">
			<button type="button" onclick={onclear} disabled={history.length === 0}>Clear</button>
			<button type="button" onclick={ondownload} disabled={history.length === 0}>CSV</button>
		</div>
	</header>

	<div class="readout" aria-live="polite">
		<span><b>Position</b> {point[0].toFixed(3)}, {point[1].toFixed(3)}</span>
		<span><b>Status</b> {active ? 'active chemistry' : 'wall or exterior'}</span>
		<span><b>u</b> {latest ? format(latest.u) : '—'}</span>
		<span><b>v</b> {latest ? format(latest.v) : '—'}</span>
	</div>

	{#if history.length >= 2}
		<div class="charts">
			<figure>
				<svg
					viewBox={`0 0 ${chartWidth} ${chartHeight}`}
					role="img"
					aria-labelledby="bz-trace-title bz-trace-desc"
				>
					<title id="bz-trace-title">Probe field values through model time</title>
					<desc id="bz-trace-desc"
						>Line chart of u and v at the selected grid cell. The exact recent values follow in a
						table.</desc
					>
					<path
						class="axis"
						d={`M${margin.left},${margin.top}V${chartHeight - margin.bottom}H${chartWidth - margin.right}`}
					/>
					<path
						class="grid"
						d={`M${margin.left},${(margin.top + chartHeight - margin.bottom) / 2}H${chartWidth - margin.right}`}
					/>
					<path class="trace trace-u" d={tracePath('u')} />
					<path class="trace trace-v" d={tracePath('v')} />
					<text x={margin.left} y={chartHeight - 7}>t {format(timeExtent[0])}</text>
					<text x={chartWidth - margin.right} y={chartHeight - 7} text-anchor="end"
						>{format(timeExtent[1])}</text
					>
					<text x={margin.left - 6} y={margin.top + 4} text-anchor="end"
						>{format(valueExtent[1])}</text
					>
					<text x={margin.left - 6} y={chartHeight - margin.bottom} text-anchor="end"
						>{format(valueExtent[0])}</text
					>
				</svg>
				<figcaption>
					<span class="u-key">u</span> fast field · <span class="v-key">v</span> recovery field
				</figcaption>
			</figure>

			<figure>
				<svg
					viewBox={`0 0 ${chartWidth} ${chartHeight}`}
					role="img"
					aria-labelledby="bz-phase-title bz-phase-desc"
				>
					<title id="bz-phase-title">Local u–v phase portrait</title>
					<desc id="bz-phase-desc"
						>The same samples plotted as v against u. A loop indicates recurrent local timing, not
						spatial travel by itself.</desc
					>
					<path
						class="axis"
						d={`M${margin.left},${margin.top}V${chartHeight - margin.bottom}H${chartWidth - margin.right}`}
					/>
					<path class="trace trace-phase" d={phasePath()} />
					{#if latest}
						<circle
							class="phase-dot"
							cx={scale(latest.u, uExtent, [margin.left, chartWidth - margin.right])}
							cy={scale(latest.v, vExtent, [chartHeight - margin.bottom, margin.top])}
							r="4"
						/>
					{/if}
					<text x={chartWidth - margin.right} y={chartHeight - 7} text-anchor="end">u →</text>
					<text x={margin.left - 6} y={margin.top + 4} text-anchor="end">v</text>
				</svg>
				<figcaption>Current state is the bright marker; the curve preserves time order.</figcaption>
			</figure>
		</div>
	{:else}
		<p class="empty">
			Place the probe in active chemistry and advance at least two sampled frames.
		</p>
	{/if}

	<details>
		<summary>Recent exact samples ({Math.min(8, history.length)})</summary>
		<div class="table-wrap">
			<table>
				<caption>Most recent probe samples in ascending model time</caption>
				<thead
					><tr
						><th scope="col">Step</th><th scope="col">Model time</th><th scope="col">u</th><th
							scope="col">v</th
						></tr
					></thead
				>
				<tbody>
					{#each history.slice(-8) as sample (sample.step)}
						<tr
							><td>{sample.step}</td><td>{format(sample.time)}</td><td>{format(sample.u)}</td><td
								>{format(sample.v)}</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

<style>
	.probe {
		border: 1px solid color-mix(in oklab, var(--essay-ink, #252b29) 20%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklab, var(--essay-paper, #f3eee3) 95%, #8e4b55 5%);
		padding: clamp(0.85rem, 2vw, 1.25rem);
	}
	header,
	.readout,
	.probe-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}
	header {
		justify-content: space-between;
	}
	h3 {
		margin: 0.1rem 0 0;
		font-size: clamp(1rem, 2vw, 1.28rem);
	}
	.eyebrow {
		margin: 0;
		color: #8e4b55;
		font:
			700 0.67rem/1.1 ui-monospace,
			monospace;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	button {
		border: 1px solid currentColor;
		border-radius: 999px;
		background: transparent;
		color: inherit;
		padding: 0.36rem 0.7rem;
		font: inherit;
		font-size: 0.76rem;
		cursor: pointer;
	}
	button:disabled {
		cursor: default;
		opacity: 0.45;
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid #2189a3;
		outline-offset: 2px;
	}
	.readout {
		flex-wrap: wrap;
		margin: 0.9rem 0;
		font:
			0.75rem/1.4 ui-monospace,
			monospace;
	}
	.readout span {
		border-left: 2px solid #8e4b55;
		padding-left: 0.5rem;
	}
	.charts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}
	figure {
		margin: 0;
		min-width: 0;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.axis {
		fill: none;
		stroke: currentColor;
		stroke-width: 1;
		opacity: 0.5;
	}
	.grid {
		fill: none;
		stroke: currentColor;
		stroke-dasharray: 3 5;
		opacity: 0.15;
	}
	.trace {
		fill: none;
		stroke-width: 2.2;
		stroke-linejoin: round;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	.trace-u {
		stroke: #b53f46;
	}
	.trace-v {
		stroke: #167e9e;
	}
	.trace-phase {
		stroke: #7a477c;
	}
	.phase-dot {
		fill: #ffcb58;
		stroke: #1d2423;
		stroke-width: 1.5;
	}
	text {
		fill: currentColor;
		font:
			10px ui-monospace,
			monospace;
	}
	figcaption,
	.empty {
		margin: 0.4rem 0 0;
		color: color-mix(in oklab, currentColor 70%, transparent);
		font-size: 0.73rem;
		line-height: 1.45;
	}
	.empty {
		padding: 1rem 0;
	}
	.u-key {
		color: #b53f46;
		font-weight: 800;
	}
	.v-key {
		color: #167e9e;
		font-weight: 800;
	}
	details {
		margin-top: 0.8rem;
	}
	summary {
		cursor: pointer;
		font-size: 0.78rem;
		font-weight: 700;
	}
	.table-wrap {
		margin-top: 0.55rem;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font:
			0.72rem/1.35 ui-monospace,
			monospace;
	}
	caption {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	th,
	td {
		border-bottom: 1px solid color-mix(in oklab, currentColor 14%, transparent);
		padding: 0.35rem 0.45rem;
		text-align: right;
	}
	th:first-child,
	td:first-child {
		text-align: left;
	}
	@media (max-width: 680px) {
		.charts {
			grid-template-columns: 1fr;
		}
		header {
			align-items: flex-start;
		}
	}
</style>
