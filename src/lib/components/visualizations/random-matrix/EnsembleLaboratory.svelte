<script lang="ts">
	import { onMount } from 'svelte';
	import { formatNumber, type EnsembleSummaryView } from './types';

	let {
		summary,
		paused = true,
		busy = false,
		targetSamples,
		speed,
		onsamplecountchange = () => undefined,
		onspeedchange = () => undefined,
		onstart = () => undefined,
		onpause = () => undefined,
		onresume = () => undefined,
		onclear = () => undefined,
		onreplay = () => undefined
	}: {
		summary: EnsembleSummaryView;
		paused?: boolean;
		busy?: boolean;
		targetSamples: number;
		speed: number;
		onsamplecountchange?: (count: number) => void;
		onspeedchange?: (speed: number) => void;
		onstart?: () => void;
		onpause?: () => void;
		onresume?: () => void;
		onclear?: () => void;
		onreplay?: () => void;
	} = $props();

	let plotHost: HTMLElement;
	let chartWidth = $state(760);
	let metric = $state<'spectral-radius' | 'largest-singular'>('spectral-radius');

	let values = $derived(
		metric === 'spectral-radius' ? summary.spectralRadii : summary.largestSingularValues
	);
	let histogram = $derived(makeHistogram(values, 30));
	let largestHistogramBin = $derived(Math.max(1, ...histogram.counts));
	let cumulativeMeans = $derived(makeCumulativeMeans(values));
	let progress = $derived(Math.max(0, Math.min(1, summary.completed / Math.max(1, targetSamples))));
	let stage = $derived(
		summary.completed < 10
			? 'one noisy realization'
			: summary.completed < 100
				? 'a small ensemble'
				: 'an empirical distribution'
	);
	let plot = $derived(plotGeometry(chartWidth));

	function plotGeometry(width: number) {
		const safeWidth = Math.max(280, Math.min(820, width));
		const height = Math.max(250, Math.min(320, safeWidth * 0.48));
		const left = safeWidth < 480 ? 48 : 58;
		return { width: safeWidth, height, left, right: safeWidth - 16, top: 24, bottom: height - 55 };
	}

	function makeHistogram(input: readonly number[], binCount: number) {
		if (input.length === 0)
			return { minimum: 0, maximum: 1, counts: Array.from({ length: binCount }, () => 0) };
		let minimum = Math.min(...input);
		let maximum = Math.max(...input);
		if (minimum === maximum) {
			minimum -= 0.5;
			maximum += 0.5;
		}
		const counts = Array.from({ length: binCount }, () => 0);
		for (const value of input) {
			const index = Math.max(
				0,
				Math.min(binCount - 1, Math.floor(((value - minimum) / (maximum - minimum)) * binCount))
			);
			counts[index] += 1;
		}
		return { minimum, maximum, counts };
	}

	function makeCumulativeMeans(input: readonly number[]): readonly number[] {
		let sum = 0;
		return input.map((value, index) => {
			sum += value;
			return sum / (index + 1);
		});
	}

	function mean(input: readonly number[]): number {
		if (input.length === 0) return 0;
		return input.reduce((sum, value) => sum + value, 0) / input.length;
	}

	function deviation(input: readonly number[]): number {
		if (input.length < 2) return 0;
		const average = mean(input);
		return Math.sqrt(
			input.reduce((sum, value) => sum + (value - average) ** 2, 0) / (input.length - 1)
		);
	}

	function cumulativePath(): string {
		if (cumulativeMeans.length === 0) return '';
		let minimum = Math.min(...cumulativeMeans);
		let maximum = Math.max(...cumulativeMeans);
		if (minimum === maximum) [minimum, maximum] = [minimum - 0.5, maximum + 0.5];
		return cumulativeMeans
			.map((value, index) => {
				const x =
					plot.left + (index / Math.max(1, cumulativeMeans.length - 1)) * (plot.right - plot.left);
				const y =
					plot.bottom - ((value - minimum) / (maximum - minimum)) * (plot.bottom - plot.top);
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function controlNumber(event: Event): number {
		return Number((event.currentTarget as HTMLInputElement | HTMLSelectElement).value);
	}

	onMount(() => {
		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width && width > 0) chartWidth = width;
		});
		if (plotHost) observer.observe(plotHost);
		return () => observer.disconnect();
	});
</script>

<section class="ensemble-laboratory lens-panel" aria-labelledby="ensemble-laboratory-heading">
	<header class="lens-header">
		<div>
			<p class="eyebrow">LENS 06 · MANY MATRICES</p>
			<h3 id="ensemble-laboratory-heading">Ensemble laboratory</h3>
			<p>
				Accumulate independent matrices with the same declared parameters. Calculation begins only
				when you ask.
			</p>
		</div>
		<div class="ensemble-readout"><span>Current evidence</span><strong>{stage}</strong></div>
	</header>

	<div class="ensemble-controls" aria-label="Ensemble accumulation controls">
		<div class="transport" role="group" aria-label="Ensemble playback">
			{#if summary.completed === 0}
				<button
					type="button"
					data-testid="random-matrix-ensemble-start"
					class="primary"
					disabled={busy}
					onclick={onstart}>Start accumulation</button
				>
			{:else if paused}
				<button
					type="button"
					data-testid="random-matrix-ensemble-resume"
					class="primary"
					disabled={summary.completed >= targetSamples}
					onclick={onresume}>Resume</button
				>
			{:else}
				<button
					type="button"
					data-testid="random-matrix-ensemble-pause"
					class="primary"
					onclick={onpause}>Pause</button
				>
			{/if}
			<button type="button" disabled={summary.completed === 0} onclick={onclear}>Clear</button>
			<button type="button" disabled={summary.completed === 0} onclick={onreplay}
				>Replay deterministically</button
			>
		</div>
		<label>
			<span>Target matrices</span>
			<input
				type="number"
				min="1"
				max="400"
				step="1"
				value={targetSamples}
				onchange={(event) => onsamplecountchange(controlNumber(event))}
			/>
		</label>
		<label class="speed-control">
			<span><span>Accumulation pace</span><output>{speed.toFixed(0)} matrices/s</output></span>
			<input
				type="range"
				min="1"
				max="30"
				step="1"
				value={speed}
				oninput={(event) => onspeedchange(controlNumber(event))}
			/>
		</label>
	</div>

	<div class="progress-block">
		<div>
			<span
				>{paused ? 'Paused' : busy ? 'Worker calculating' : 'Ready'} · sample index {summary.completed}</span
			><output
				>{summary.completed.toLocaleString('en-GB')} / {targetSamples.toLocaleString(
					'en-GB'
				)}</output
			>
		</div>
		<progress max="1" value={progress}>{Math.round(progress * 100)}%</progress>
		<p>
			Seed + parameters + sample index determine every matrix. Replay consumes the same indexed
			pseudorandom streams.
		</p>
	</div>

	<ol class="evidence-steps" aria-label="Ensemble evidence stages">
		<li class:active={summary.completed > 0}>
			<span>1</span><strong>One</strong><small>individual noise dominates</small>
		</li>
		<li class:active={summary.completed >= 10}>
			<span>10</span><strong>Ten</strong><small>a shape begins to gather</small>
		</li>
		<li class:active={summary.completed >= 100}>
			<span>100+</span><strong>Many</strong><small>empirical law becomes legible</small>
		</li>
	</ol>

	<div class="ensemble-grid">
		<figure bind:this={plotHost} data-export-surface>
			<div class="figure-heading">
				<p class="figure-caption">Empirical distribution</p>
				<select bind:value={metric} aria-label="Ensemble metric">
					<option value="spectral-radius">Spectral radius</option>
					<option value="largest-singular">Largest singular value</option>
				</select>
			</div>
			<svg
				viewBox={`0 0 ${plot.width} ${plot.height}`}
				role="img"
				aria-label={`Histogram of ${values.length} ${metric === 'spectral-radius' ? 'spectral radii' : 'largest singular values'}`}
			>
				<rect
					class="plot-background"
					x={plot.left}
					y={plot.top}
					width={plot.right - plot.left}
					height={plot.bottom - plot.top}
				/>
				{#each histogram.counts as count, index (index)}
					<rect
						class="histogram-bar"
						x={plot.left + (index / histogram.counts.length) * (plot.right - plot.left)}
						y={plot.bottom - (count / largestHistogramBin) * (plot.bottom - plot.top)}
						width={(plot.right - plot.left) / histogram.counts.length - 1}
						height={(count / largestHistogramBin) * (plot.bottom - plot.top)}
						><title>{count} matrices</title></rect
					>
				{/each}
				<text class="tick" x={plot.left} y={plot.bottom + 18}
					>{formatNumber(histogram.minimum, 3)}</text
				>
				<text class="tick" x={plot.right} y={plot.bottom + 18} text-anchor="end"
					>{formatNumber(histogram.maximum, 3)}</text
				>
				<text
					class="axis-label"
					x={(plot.left + plot.right) / 2}
					y={plot.height - 10}
					text-anchor="middle">{metric === 'spectral-radius' ? 'ρ(A)' : 'σ₁(A)'}</text
				>
			</svg>
		</figure>
		<figure>
			<figcaption>Running ensemble mean · order is deterministic</figcaption>
			<svg
				viewBox={`0 0 ${plot.width} ${plot.height}`}
				role="img"
				aria-label={`Running mean across ${values.length} samples`}
			>
				<rect
					class="plot-background"
					x={plot.left}
					y={plot.top}
					width={plot.right - plot.left}
					height={plot.bottom - plot.top}
				/>
				<path class="mean-line" d={cumulativePath()} />
				<text
					class="axis-label"
					x={(plot.left + plot.right) / 2}
					y={plot.height - 10}
					text-anchor="middle">matrices accumulated</text
				>
			</svg>
		</figure>
	</div>

	<div class="summary-grid">
		<div>
			<span>Matrices completed</span><strong data-testid="random-matrix-ensemble-completed"
				>{summary.completed.toLocaleString('en-GB')}</strong
			>
		</div>
		<div>
			<span>Eigenvalues retained for density</span><strong
				>{summary.eigenvalues.length.toLocaleString('en-GB')}</strong
			>
		</div>
		<div>
			<span>Mean spectral radius</span><strong
				>{formatNumber(mean(summary.spectralRadii), 5)}</strong
			>
		</div>
		<div>
			<span>SD spectral radius</span><strong
				>{formatNumber(deviation(summary.spectralRadii), 5)}</strong
			>
		</div>
		<div>
			<span>Mean largest singular value</span><strong
				>{formatNumber(mean(summary.largestSingularValues), 5)}</strong
			>
		</div>
	</div>
	<p class="finite-note">
		A smoother empirical shape is evidence about this simulated ensemble, not proof of an asymptotic
		theorem. Finite n, finite samples, the chosen distribution, and normalisation all remain visible
		assumptions.
	</p>
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
	.progress-block p,
	figure,
	figcaption,
	.finite-note {
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
	.ensemble-readout {
		max-width: 14rem;
		border-left: 1px solid var(--rm-rule);
		padding-left: 0.8rem;
		text-align: right;
	}
	.ensemble-readout span,
	.ensemble-readout strong {
		display: block;
	}
	.ensemble-readout span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
	}
	.ensemble-readout strong {
		margin-top: 0.15rem;
		font-size: 0.78rem;
		line-height: 1.3;
	}
	.ensemble-controls {
		display: grid;
		grid-template-columns: minmax(18rem, 1fr) minmax(8rem, 0.35fr) minmax(12rem, 0.65fr);
		align-items: end;
		gap: 0.55rem;
		margin-top: 0.75rem;
		border-block: 1px solid var(--rm-rule);
		padding: 0.55rem 0;
	}
	.transport {
		display: flex;
		gap: 0.35rem;
	}
	.ensemble-controls button,
	.ensemble-controls input[type='number'] {
		min-height: 2.75rem;
		box-sizing: border-box;
		border: 1px solid var(--rm-control);
		border-radius: 0.38rem;
		background: var(--rm-paper);
		padding: 0.45rem 0.6rem;
		color: var(--rm-ink);
		font: 700 0.72rem var(--rm-sans);
		cursor: pointer;
	}
	.ensemble-controls button.primary {
		border-color: var(--rm-accent);
		background: var(--rm-accent);
		color: var(--rm-accent-ink);
	}
	.ensemble-controls button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.ensemble-controls label {
		display: grid;
		gap: 0.2rem;
		color: var(--rm-muted);
		font-size: 0.6875rem;
		font-weight: 700;
	}
	.ensemble-controls input[type='number'] {
		width: 100%;
	}
	.speed-control > span {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.speed-control output {
		color: var(--rm-ink);
		font-family: var(--rm-mono);
	}
	.speed-control input {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--rm-accent);
	}
	.progress-block {
		display: grid;
		gap: 0.32rem;
		margin-top: 0.65rem;
	}
	.progress-block > div {
		display: flex;
		justify-content: space-between;
		gap: 0.7rem;
		font: 650 0.6875rem var(--rm-mono);
	}
	.progress-block output {
		color: var(--rm-muted);
	}
	.progress-block progress {
		width: 100%;
		height: 0.65rem;
		accent-color: var(--rm-accent);
	}
	.progress-block p,
	.finite-note {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		line-height: 1.4;
	}
	.evidence-steps {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0.65rem 0 0;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
		padding: 0;
		list-style: none;
	}
	.evidence-steps li {
		display: grid;
		grid-template-columns: 2rem 1fr;
		grid-template-rows: auto auto;
		align-content: center;
		column-gap: 0.45rem;
		min-height: 3.4rem;
		border-right: 1px solid var(--rm-rule);
		padding: 0.45rem 0.6rem;
		color: var(--rm-muted);
	}
	.evidence-steps li:last-child {
		border-right: 0;
	}
	.evidence-steps li.active {
		box-shadow: inset 0 -3px 0 var(--rm-accent);
		color: var(--rm-ink);
	}
	.evidence-steps li > span {
		display: grid;
		grid-row: 1 / 3;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border: 1px solid currentColor;
		border-radius: 50%;
		font: 700 0.6875rem var(--rm-mono);
	}
	.evidence-steps strong {
		font-size: 0.76rem;
	}
	.evidence-steps small {
		font-size: 0.6875rem;
	}
	.ensemble-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		margin-top: 0.65rem;
	}
	.ensemble-grid figure {
		min-width: 0;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
		padding: 0.55rem;
	}
	.figure-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	figcaption,
	.figure-caption {
		margin: 0;
		color: var(--rm-muted);
		font: 700 0.6875rem var(--rm-mono);
	}
	.figure-heading select {
		min-height: 2.75rem;
		border: 1px solid var(--rm-control);
		border-radius: 0.35rem;
		background: var(--rm-paper);
		padding: 0.35rem 0.5rem;
		color: var(--rm-ink);
		font: 650 0.6875rem var(--rm-sans);
	}
	.ensemble-grid svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.plot-background {
		fill: var(--rm-plot-paper);
		stroke: var(--rm-rule);
	}
	.histogram-bar {
		fill: var(--rm-point);
		opacity: 0.78;
	}
	.mean-line {
		fill: none;
		stroke: var(--rm-theory);
		stroke-width: 2.4;
		vector-effect: non-scaling-stroke;
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
		font-size: 11px;
		font-weight: 700;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		margin-top: 0.65rem;
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
		margin-top: 0.16rem;
		font: 750 0.7rem var(--rm-mono);
	}
	.finite-note {
		margin-top: 0.5rem;
	}
	:where(button, input, select):focus-visible {
		outline: 3px solid var(--rm-focus);
		outline-offset: 2px;
	}
	@media (max-width: 66rem) {
		.ensemble-controls {
			grid-template-columns: minmax(0, 1fr) repeat(2, minmax(10rem, 0.5fr));
		}
		.transport {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 50rem) {
		.ensemble-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.summary-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.summary-grid > div:nth-child(3) {
			border-right: 0;
			border-bottom: 1px solid var(--rm-rule);
		}
		.summary-grid > div:nth-child(-n + 2) {
			border-bottom: 1px solid var(--rm-rule);
		}
	}
	@media (max-width: 38rem) {
		.lens-header,
		.progress-block > div {
			align-items: stretch;
			flex-direction: column;
		}
		.ensemble-readout {
			max-width: none;
			border-top: 1px solid var(--rm-rule);
			border-left: 0;
			padding-top: 0.45rem;
			padding-left: 0;
			text-align: left;
		}
		.ensemble-controls {
			grid-template-columns: minmax(0, 1fr);
		}
		.transport {
			display: grid;
			grid-column: 1;
			grid-template-columns: minmax(0, 1fr);
		}
		.evidence-steps {
			grid-template-columns: minmax(0, 1fr);
		}
		.evidence-steps li {
			border-right: 0;
			border-bottom: 1px solid var(--rm-rule);
		}
		.evidence-steps li:last-child {
			border-bottom: 0;
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
		.ensemble-controls,
		.ensemble-controls button,
		.ensemble-controls input,
		.evidence-steps,
		.evidence-steps li,
		.ensemble-grid figure,
		.plot-background,
		.summary-grid,
		.summary-grid > div {
			border-color: CanvasText;
		}
		.ensemble-controls button.primary {
			background: ButtonFace;
			color: ButtonText;
		}
	}
</style>
