<script lang="ts">
	import { onMount } from 'svelte';
	import { matrixColour, robustColourDomain } from './colour';
	import { formatNumber, type ColourScale, type SingularView } from './types';

	let {
		singular,
		rows,
		columns,
		reconstruction,
		reconstructionRank = 1,
		reconstructionError,
		colourScale = 'diverging',
		highContrast = false,
		onrankchange = () => undefined
	}: {
		singular?: SingularView;
		rows: number;
		columns: number;
		reconstruction?: Float64Array;
		reconstructionRank?: number;
		reconstructionError?: number;
		colourScale?: ColourScale;
		highContrast?: boolean;
		onrankchange?: (rank: number, commit: boolean) => void;
	} = $props();

	let plotHost: HTMLElement;
	let chartWidth = $state(760);
	let scaleMode = $state<'linear' | 'log'>('linear');
	let plotMode = $state<'curve' | 'histogram'>('curve');
	let reconstructionCanvas = $state<HTMLCanvasElement>();
	let resizeRevision = $state(0);

	let values = $derived(singular?.values ?? new Float64Array());
	let maximumRank = $derived(Math.max(1, values.length));
	let safeRank = $derived(Math.max(1, Math.min(maximumRank, reconstructionRank)));
	let energy = $derived(cumulativeEnergy());
	let selectedEnergy = $derived(energy[safeRank - 1] ?? 0);
	let histogram = $derived(histogramBins(28));
	let histogramAxis = $derived(histogramAxisGeometry());
	let plot = $derived(plotGeometry(chartWidth));
	let narrowPlot = $derived(chartWidth < 500);
	let conditionLabel = $derived(
		!singular || !Number.isFinite(singular.condition) || singular.condition > 1e14
			? 'effectively infinite'
			: formatNumber(singular.condition, 5)
	);

	function plotGeometry(width: number) {
		const safeWidth = Math.max(280, Math.min(900, width));
		const height = Math.max(280, Math.min(390, safeWidth * 0.52));
		const left = safeWidth < 500 ? 68 : 76;
		const rightMargin = safeWidth < 500 ? 68 : 74;
		return {
			width: safeWidth,
			height,
			left,
			right: safeWidth - rightMargin,
			top: 24,
			bottom: height - 58
		};
	}

	function cumulativeEnergy(): Float64Array {
		if (singular?.cumulativeEnergy?.length === values.length) return singular.cumulativeEnergy;
		const output = new Float64Array(values.length);
		let total = 0;
		for (const value of values) total += value * value;
		let running = 0;
		for (let index = 0; index < values.length; index += 1) {
			running += (values[index] ?? 0) ** 2;
			output[index] = total > 0 ? running / total : 1;
		}
		return output;
	}

	function transformed(value: number): number {
		return scaleMode === 'log'
			? Math.log10(Math.max(value, Math.max(singular?.tolerance ?? 1e-14, 1e-14)))
			: value;
	}

	function yBounds(): readonly [number, number] {
		if (values.length === 0) return [0, 1];
		let minimum = Number.POSITIVE_INFINITY;
		let maximum = Number.NEGATIVE_INFINITY;
		for (const value of values) {
			const next = transformed(value);
			minimum = Math.min(minimum, next);
			maximum = Math.max(maximum, next);
		}
		if (scaleMode === 'linear') minimum = Math.min(0, minimum);
		if (minimum === maximum) maximum = minimum + 1;
		return [minimum, maximum];
	}

	function sx(index: number): number {
		return plot.left + (index / Math.max(1, values.length - 1)) * (plot.right - plot.left);
	}

	function sy(value: number): number {
		const [minimum, maximum] = yBounds();
		return (
			plot.bottom -
			((transformed(value) - minimum) / Math.max(Number.EPSILON, maximum - minimum)) *
				(plot.bottom - plot.top)
		);
	}

	function curvePath(): string {
		return Array.from(values)
			.map(
				(value, index) =>
					`${index === 0 ? 'M' : 'L'}${sx(index).toFixed(2)},${sy(value).toFixed(2)}`
			)
			.join(' ');
	}

	function energyPath(): string {
		return Array.from(energy)
			.map(
				(value, index) =>
					`${index === 0 ? 'M' : 'L'}${sx(index).toFixed(2)},${(plot.bottom - value * (plot.bottom - plot.top)).toFixed(2)}`
			)
			.join(' ');
	}

	function histogramBins(count: number): readonly { start: number; end: number; count: number }[] {
		if (values.length === 0) return [];
		const maximum = Math.max(...values, Number.EPSILON);
		const bins = Array.from({ length: count }, (_, index) => ({
			start: (index / count) * maximum,
			end: ((index + 1) / count) * maximum,
			count: 0
		}));
		for (const value of values) {
			const index = Math.max(0, Math.min(count - 1, Math.floor((value / maximum) * count)));
			bins[index].count += 1;
		}
		return bins;
	}

	function histogramAxisGeometry(): { maximum: number; ticks: readonly number[] } {
		const maximumCount = Math.max(1, ...histogram.map((bin) => bin.count));
		const roughStep = maximumCount / 4;
		const power = 10 ** Math.floor(Math.log10(Math.max(1, roughStep)));
		const normalisedStep = roughStep / power;
		const multiplier =
			normalisedStep <= 1 ? 1 : normalisedStep <= 2 ? 2 : normalisedStep <= 5 ? 5 : 10;
		const step = Math.max(1, multiplier * power);
		const maximum = Math.max(step, Math.ceil(maximumCount / step) * step);
		const ticks: number[] = [];
		for (let value = 0; value <= maximum; value += step) ticks.push(value);
		return { maximum, ticks };
	}

	function histogramY(count: number): number {
		return plot.bottom - (count / Math.max(1, histogramAxis.maximum)) * (plot.bottom - plot.top);
	}

	function renderReconstruction(): void {
		void resizeRevision;
		if (
			!reconstructionCanvas ||
			!reconstruction ||
			reconstruction.length !== rows * columns ||
			typeof window === 'undefined'
		)
			return;
		const bounds = reconstructionCanvas.getBoundingClientRect();
		if (!(bounds.width > 0 && bounds.height > 0)) return;
		const ratio = Math.min(2, window.devicePixelRatio || 1);
		reconstructionCanvas.width = Math.max(1, Math.round(bounds.width * ratio));
		reconstructionCanvas.height = Math.max(1, Math.round(bounds.height * ratio));
		const context = reconstructionCanvas.getContext('2d');
		if (!context) return;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.imageSmoothingEnabled = false;
		const cellCanvas = document.createElement('canvas');
		cellCanvas.width = columns;
		cellCanvas.height = rows;
		const cellContext = cellCanvas.getContext('2d');
		if (!cellContext) return;
		const image = cellContext.createImageData(columns, rows);
		const domain = robustColourDomain(reconstruction, colourScale === 'sequential');
		for (let index = 0; index < reconstruction.length; index += 1) {
			const colour = matrixColour(reconstruction[index] ?? 0, domain, colourScale, highContrast);
			const match = colour.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/u);
			image.data[index * 4] = Number(match?.[1] ?? 0);
			image.data[index * 4 + 1] = Number(match?.[2] ?? 0);
			image.data[index * 4 + 2] = Number(match?.[3] ?? 0);
			image.data[index * 4 + 3] = 255;
		}
		cellContext.putImageData(image, 0, 0);
		context.clearRect(0, 0, bounds.width, bounds.height);
		context.drawImage(cellCanvas, 0, 0, bounds.width, bounds.height);
	}

	$effect(() => {
		const revision = [reconstruction, rows, columns, colourScale, highContrast, resizeRevision];
		void revision;
		requestAnimationFrame(renderReconstruction);
	});

	onMount(() => {
		const canvasObserver = new ResizeObserver(() => (resizeRevision += 1));
		if (reconstructionCanvas) canvasObserver.observe(reconstructionCanvas);
		const chartObserver = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width && width > 0) chartWidth = width;
		});
		if (plotHost) chartObserver.observe(plotHost);
		return () => {
			canvasObserver.disconnect();
			chartObserver.disconnect();
		};
	});

	function selectedRankChanged(event: Event, commit: boolean): void {
		onrankchange(
			Math.max(1, Math.min(maximumRank, Number((event.currentTarget as HTMLInputElement).value))),
			commit
		);
	}

	function tickValue(fraction: number): number {
		const [minimum, maximum] = yBounds();
		const display = maximum - fraction * (maximum - minimum);
		return scaleMode === 'log' ? 10 ** display : display;
	}
</script>

<section class="singular-mountain lens-panel" aria-labelledby="singular-mountain-heading">
	<header class="lens-header">
		<div>
			<p class="eyebrow">LENS 03 · STRETCH</p>
			<h3 id="singular-mountain-heading">Singular-value mountain</h3>
			<p>
				Singular values rank how strongly A stretches directions; they are not eigenvalue
				magnitudes.
			</p>
		</div>
		<div class="rank-readout">
			<span>Numerical rank</span><strong>{singular?.rank ?? 0}/{values.length}</strong>
		</div>
	</header>

	<div class="plot-toolbar">
		<div role="group" aria-label="Singular value plot style">
			<button
				type="button"
				class:active={plotMode === 'curve'}
				aria-pressed={plotMode === 'curve'}
				onclick={() => (plotMode = 'curve')}>Rank curve</button
			>
			<button
				type="button"
				class:active={plotMode === 'histogram'}
				aria-pressed={plotMode === 'histogram'}
				onclick={() => (plotMode = 'histogram')}>Histogram</button
			>
		</div>
		{#if plotMode === 'curve'}
			<div role="group" aria-label="Singular value vertical scale">
				<button
					type="button"
					class:active={scaleMode === 'linear'}
					aria-pressed={scaleMode === 'linear'}
					onclick={() => (scaleMode = 'linear')}>Linear</button
				>
				<button
					type="button"
					class:active={scaleMode === 'log'}
					aria-pressed={scaleMode === 'log'}
					onclick={() => (scaleMode = 'log')}>Log</button
				>
			</div>
		{:else}
			<p class="scale-note">Histogram frequency uses a linear count axis.</p>
		{/if}
	</div>

	<div class="mountain-grid">
		<figure bind:this={plotHost} data-export-surface class:narrow={narrowPlot}>
			<svg
				viewBox={`0 0 ${plot.width} ${plot.height}`}
				role="img"
				aria-labelledby="singular-title singular-description"
			>
				<title id="singular-title">
					{plotMode === 'curve'
						? 'Singular values and cumulative energy by rank'
						: 'Histogram of singular values'}
				</title>
				<desc id="singular-description">
					{#if plotMode === 'curve'}
						{values.length} singular values use the left axis and cumulative squared energy uses the zero-to-one-hundred-percent
						right axis. Selected reconstruction rank {safeRank}, retaining {(
							selectedEnergy * 100
						).toFixed(1)} percent of squared Frobenius energy.
					{:else}
						{values.length} singular values grouped into {histogram.length} bins. Bar heights use a linear
						count axis.
					{/if}
				</desc>
				<rect
					class="plot-background"
					x={plot.left}
					y={plot.top}
					width={plot.right - plot.left}
					height={plot.bottom - plot.top}
				/>
				{#if plotMode === 'curve'}
					{#each [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
						{@const tickY = plot.top + fraction * (plot.bottom - plot.top)}
						<line class="gridline" x1={plot.left} x2={plot.right} y1={tickY} y2={tickY} />
						<text class="tick" x={plot.left - 8} y={tickY + 3} text-anchor="end"
							>{formatNumber(tickValue(fraction), 2)}</text
						>
						<line class="axis-tick" x1={plot.right} x2={plot.right + 5} y1={tickY} y2={tickY} />
						<text class="tick" x={plot.right + 8} y={tickY + 3}
							>{Math.round((1 - fraction) * 100)}%</text
						>
					{/each}
					<path class="singular-line" d={curvePath()} />
					<path class="energy-line" d={energyPath()} />
					{#each Array.from(values) as value, index (index)}
						<circle
							class:selected={index + 1 === safeRank}
							class="singular-point"
							cx={sx(index)}
							cy={sy(value)}
							r={index + 1 === safeRank ? 5 : 2.2}
						/>
					{/each}
					<line
						class="rank-line"
						x1={sx(safeRank - 1)}
						x2={sx(safeRank - 1)}
						y1={plot.top}
						y2={plot.bottom}
					/>
				{:else}
					{#each histogramAxis.ticks as tick (tick)}
						{@const tickY = histogramY(tick)}
						<line class="gridline" x1={plot.left} x2={plot.right} y1={tickY} y2={tickY} />
						<text class="tick" x={plot.left - 8} y={tickY + 3} text-anchor="end">{tick}</text>
					{/each}
					{#each histogram as bin, index (index)}
						<rect
							class="histogram-bar"
							x={plot.left + (index / histogram.length) * (plot.right - plot.left)}
							y={histogramY(bin.count)}
							width={(plot.right - plot.left) / histogram.length - 1}
							height={plot.bottom - histogramY(bin.count)}
						>
							<title>{formatNumber(bin.start, 3)}–{formatNumber(bin.end, 3)}: {bin.count}</title>
						</rect>
					{/each}
				{/if}
				<text
					class="axis-label y-axis-label"
					data-axis="y"
					x="12"
					y={(plot.top + plot.bottom) / 2}
					text-anchor="middle"
					transform={`rotate(-90 12 ${(plot.top + plot.bottom) / 2})`}
				>
					{plotMode === 'curve'
						? `singular value σₖ${scaleMode === 'log' ? ' (log scale)' : ''}`
						: 'frequency (count)'}
				</text>
				{#if plotMode === 'curve'}
					<text
						class="axis-label y-axis-label energy-axis-label"
						data-axis="y2"
						x={plot.width - 10}
						y={(plot.top + plot.bottom) / 2}
						text-anchor="middle"
						transform={`rotate(90 ${plot.width - 10} ${(plot.top + plot.bottom) / 2})`}
					>
						cumulative energy (%)
					</text>
				{/if}
				<text
					class="axis-label"
					data-axis="x"
					x={(plot.left + plot.right) / 2}
					y={plot.height - 10}
					text-anchor="middle">{plotMode === 'curve' ? 'rank index k' : 'singular value σ'}</text
				>
			</svg>
			<figcaption>
				{#if plotMode === 'curve'}
					Solid, left axis: σₖ. Dashed, right axis: cumulative squared energy from 0–100%. The
					vertical marker selects A<sub>k</sub>.
				{:else}
					Each bar counts singular values in its interval; frequency is always linear.
				{/if}
			</figcaption>
		</figure>

		<figure class="reconstruction-figure">
			<figcaption>
				Low-rank reconstruction A<sub>{safeRank}</sub> · nearest-neighbour pixels
			</figcaption>
			{#if reconstruction}
				<canvas
					bind:this={reconstructionCanvas}
					aria-label={`Heatmap of rank-${safeRank} reconstruction. Relative Frobenius error ${formatNumber(reconstructionError, 5)}.`}
				></canvas>
			{:else}
				<div class="reconstruction-placeholder">
					Preparing the rank-{safeRank} reconstruction in the numerical worker.
				</div>
			{/if}
		</figure>
	</div>

	<label class="rank-slider">
		<span><strong>Reconstruction rank k</strong><output>{safeRank} of {maximumRank}</output></span>
		<input
			type="range"
			min="1"
			max={maximumRank}
			step="1"
			value={safeRank}
			oninput={(event) => selectedRankChanged(event, false)}
			onchange={(event) => selectedRankChanged(event, true)}
		/>
	</label>

	<div class="summary-grid">
		<div><span>Energy retained</span><strong>{(selectedEnergy * 100).toFixed(2)}%</strong></div>
		<div>
			<span>Relative reconstruction error</span><strong
				>{formatNumber(reconstructionError, 5)}</strong
			>
		</div>
		<div>
			<span>Condition number</span><strong class:warning={conditionLabel === 'effectively infinite'}
				>{conditionLabel}</strong
			>
		</div>
		<div><span>Rank tolerance</span><strong>{formatNumber(singular?.tolerance, 3)}</strong></div>
		<div><span>SVD residual</span><strong>{formatNumber(singular?.residual, 3)}</strong></div>
	</div>
	{#if conditionLabel === 'effectively infinite'}
		<p class="warning-note">
			The smallest singular value is at or below the documented numerical tolerance, so a
			finite-looking condition number would be misleading.
		</p>
	{/if}
</section>

<style>
	.lens-header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
	}
	.lens-header p,
	.lens-header h3,
	figure,
	figcaption,
	.warning-note {
		margin: 0;
	}
	.eyebrow {
		color: var(--rm-accent);
		font: 750 0.6875rem var(--rm-mono);
		letter-spacing: 0.11em;
	}
	.lens-header h3 {
		margin-top: 0.12rem;
		font-size: clamp(1.1rem, 2vw, 1.45rem);
	}
	.lens-header p:last-child {
		max-width: 50rem;
		margin-top: 0.22rem;
		color: var(--rm-muted);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.rank-readout {
		min-width: 8rem;
		border-left: 1px solid var(--rm-rule);
		padding-left: 0.8rem;
		text-align: right;
	}
	.rank-readout span,
	.rank-readout strong {
		display: block;
	}
	.rank-readout span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
	}
	.rank-readout strong {
		margin-top: 0.15rem;
		font: 800 1rem var(--rm-mono);
	}
	.plot-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		margin-top: 0.75rem;
		border-block: 1px solid var(--rm-rule);
		padding: 0.45rem 0;
	}
	.plot-toolbar > div {
		display: flex;
		gap: 0.25rem;
	}
	.scale-note {
		margin: 0;
		color: var(--rm-muted);
		font-size: 0.72rem;
		line-height: 1.4;
		text-align: right;
	}
	.plot-toolbar button {
		min-height: 2.75rem;
		border: 1px solid var(--rm-control);
		border-radius: 0.35rem;
		background: var(--rm-paper);
		padding: 0.38rem 0.62rem;
		color: var(--rm-ink);
		font: 700 0.72rem var(--rm-sans);
		cursor: pointer;
	}
	.plot-toolbar button.active {
		border-color: var(--rm-accent);
		background: color-mix(in srgb, var(--rm-accent) 10%, var(--rm-paper));
		color: var(--rm-accent);
	}
	.mountain-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(14rem, 0.7fr);
		gap: 0.7rem;
		margin-top: 0.7rem;
	}
	.mountain-grid figure {
		min-width: 0;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
		padding: 0.55rem;
	}
	.mountain-grid svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.plot-background {
		fill: var(--rm-plot-paper);
		stroke: var(--rm-rule);
	}
	.gridline {
		stroke: var(--rm-rule);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.axis-tick {
		stroke: var(--rm-rule);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.singular-line,
	.energy-line {
		fill: none;
		stroke: var(--rm-point);
		stroke-width: 2.5;
		vector-effect: non-scaling-stroke;
	}
	.energy-line {
		stroke: var(--rm-theory);
		stroke-dasharray: 9 5;
	}
	.singular-point {
		fill: var(--rm-point);
	}
	.singular-point.selected {
		fill: var(--rm-selected);
		stroke: var(--rm-ink);
		stroke-width: 1.5;
	}
	.rank-line {
		stroke: var(--rm-selected);
		stroke-width: 2;
		stroke-dasharray: 4 4;
	}
	.histogram-bar {
		fill: var(--rm-point);
		opacity: 0.78;
	}
	.tick,
	.axis-label {
		fill: var(--rm-muted);
		font-family: var(--rm-mono);
	}
	.tick {
		font-size: 11px;
	}
	.axis-label {
		font-size: 12px;
		font-weight: 700;
	}
	.energy-axis-label {
		fill: var(--rm-theory);
	}
	figcaption {
		color: var(--rm-muted);
		font-size: 0.7rem;
		line-height: 1.45;
	}
	.mountain-grid > figure > figcaption {
		margin-top: 0.25rem;
	}
	.reconstruction-figure {
		display: grid;
		grid-template-rows: auto minmax(16rem, 1fr);
		gap: 0.45rem;
	}
	.reconstruction-figure canvas,
	.reconstruction-placeholder {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 16rem;
		border: 1px solid var(--rm-rule);
		background: var(--rm-plot-paper);
	}
	.reconstruction-placeholder {
		display: grid;
		box-sizing: border-box;
		place-items: center;
		padding: 1rem;
		color: var(--rm-muted);
		font-size: 0.75rem;
		line-height: 1.45;
		text-align: center;
	}
	.rank-slider {
		display: grid;
		gap: 0.25rem;
		margin-top: 0.7rem;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
		padding: 0.6rem 0.7rem;
	}
	.rank-slider > span {
		display: flex;
		justify-content: space-between;
		gap: 0.7rem;
		font-size: 0.74rem;
	}
	.rank-slider output {
		font-family: var(--rm-mono);
	}
	.rank-slider input {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--rm-accent);
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		margin-top: 0.7rem;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
	}
	.summary-grid > div {
		min-width: 0;
		border-right: 1px solid var(--rm-rule);
		padding: 0.55rem;
	}
	.summary-grid > div:last-child {
		border-right: 0;
	}
	.summary-grid span,
	.summary-grid strong {
		display: block;
	}
	.summary-grid span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		line-height: 1.3;
		text-transform: uppercase;
	}
	.summary-grid strong {
		overflow-wrap: anywhere;
		margin-top: 0.18rem;
		font: 750 0.72rem var(--rm-mono);
	}
	.summary-grid strong.warning,
	.warning-note {
		color: var(--rm-warning);
	}
	.warning-note {
		margin-top: 0.5rem;
		font-size: 0.72rem;
		line-height: 1.45;
	}
	:where(button, input):focus-visible {
		outline: 3px solid var(--rm-focus);
		outline-offset: 2px;
	}
	@media (max-width: 60rem) {
		.mountain-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.reconstruction-figure {
			grid-template-rows: auto minmax(18rem, 48vw);
		}
		.summary-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.summary-grid > div:nth-child(3) {
			border-right: 0;
		}
		.summary-grid > div:nth-child(-n + 3) {
			border-bottom: 1px solid var(--rm-rule);
		}
	}
	@media (max-width: 34rem) {
		.lens-header,
		.plot-toolbar {
			align-items: stretch;
			flex-direction: column;
		}
		.rank-readout {
			border-top: 1px solid var(--rm-rule);
			border-left: 0;
			padding-top: 0.45rem;
			padding-left: 0;
			text-align: left;
		}
		.plot-toolbar > div {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.scale-note {
			text-align: left;
		}
		.summary-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.summary-grid > div,
		.summary-grid > div:nth-child(3) {
			border-right: 0;
			border-bottom: 1px solid var(--rm-rule);
		}
		.summary-grid > div:last-child {
			border-bottom: 0;
		}
	}
	@media (forced-colors: active) {
		.mountain-grid figure,
		.plot-background,
		.plot-toolbar,
		.plot-toolbar button,
		.rank-slider,
		.summary-grid,
		.summary-grid > div,
		.reconstruction-figure canvas {
			border-color: CanvasText;
		}
		.singular-line,
		.energy-line,
		.rank-line {
			stroke: CanvasText;
		}
	}
</style>
