<script lang="ts">
	import { onMount } from 'svelte';
	import type { SpectrumReading } from '$lib/visualizations/reaction-diffusion/types';

	type Props = {
		id?: string;
		reading?: SpectrumReading | null;
		title?: string;
		onmeasure?: () => void;
		busy?: boolean;
		measuredStep?: number | null;
		measuredModelTime?: number | null;
	};

	const EMPTY_READING: SpectrumReading = {
		bins: Array.from({ length: 33 }, (_, index) => ({ q: index * 0.025, power: 0 })),
		dominantQ: null,
		dominantWavelength: null,
		domainFraction: null,
		prominence: 0,
		trustworthy: false,
		reason: 'No trustworthy dominant wavelength is present: the field has no resolved variation.',
		window: 'none'
	};

	let {
		id = 'rd-spectrum',
		reading = null,
		title = 'Spatial spectrum and dominant wavelength',
		onmeasure,
		busy = false,
		measuredStep = null,
		measuredModelTime = null
	}: Props = $props();
	let canvas = $state<HTMLCanvasElement>();
	let active = $derived(reading ?? EMPTY_READING);

	$effect(() => {
		active.prominence.toString();
		draw();
	});

	onMount(() => {
		if (!canvas) return;
		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		draw();
		return () => observer.disconnect();
	});

	function draw() {
		if (!canvas || active.bins.length < 2) return;
		const bounds = canvas.getBoundingClientRect();
		const density = Math.min(window.devicePixelRatio || 1, 1.5);
		canvas.width = Math.max(1, Math.round(bounds.width * density));
		canvas.height = Math.max(1, Math.round(bounds.height * density));
		const context = canvas.getContext('2d');
		if (!context) return;
		const width = canvas.width;
		const height = canvas.height;
		const margin = {
			left: 58 * density,
			right: 18 * density,
			top: 20 * density,
			bottom: 42 * density
		};
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		const qMax = Math.max(...active.bins.map((bin) => bin.q), 1e-6);
		const powerMax = Math.max(...active.bins.map((bin) => bin.power), 1e-12);
		const x = (q: number) => margin.left + (q / qMax) * plotWidth;
		const y = (power: number) =>
			margin.top + plotHeight - (Math.log1p(power) / Math.log1p(powerMax)) * plotHeight;
		context.fillStyle = '#111817';
		context.fillRect(0, 0, width, height);
		context.strokeStyle = 'rgba(236,231,213,.18)';
		context.lineWidth = density;
		for (let line = 0; line <= 4; line += 1) {
			const py = margin.top + (plotHeight * line) / 4;
			context.beginPath();
			context.moveTo(margin.left, py);
			context.lineTo(width - margin.right, py);
			context.stroke();
		}
		context.fillStyle = 'rgba(104,190,169,.42)';
		context.strokeStyle = '#80cdb8';
		context.lineWidth = 2 * density;
		context.beginPath();
		context.moveTo(x(active.bins[0].q), y(0));
		for (const bin of active.bins) context.lineTo(x(bin.q), y(bin.power));
		context.lineTo(x(active.bins.at(-1)?.q ?? qMax), y(0));
		context.closePath();
		context.fill();
		context.stroke();
		if (active.dominantQ !== null) {
			context.strokeStyle = '#e8c977';
			context.setLineDash([6 * density, 5 * density]);
			context.beginPath();
			context.moveTo(x(active.dominantQ), margin.top);
			context.lineTo(x(active.dominantQ), margin.top + plotHeight);
			context.stroke();
			context.setLineDash([]);
		}
		context.fillStyle = '#e9e3d5';
		context.font = `${13 * density}px ui-monospace, monospace`;
		context.textAlign = 'center';
		context.fillText(
			'radial wave number q (model-length⁻¹)',
			margin.left + plotWidth / 2,
			height - 10 * density
		);
		context.save();
		context.translate(14 * density, margin.top + plotHeight / 2);
		context.rotate(-Math.PI / 2);
		context.fillText('log-scaled radial power', 0, 0);
		context.restore();
	}
</script>

<section class="spectrum-panel" {id} aria-labelledby={`${id}-title`} aria-busy={busy}>
	<header>
		<div>
			<p class="eyebrow">FFT · radial average · measured scale</p>
			<h3 id={`${id}-title`}>{title}</h3>
		</div>
		{#if onmeasure}<button type="button" onclick={onmeasure} disabled={busy}
				>{busy ? 'Measuring…' : 'Measure now'}</button
			>{/if}
	</header>

	<div class="spectrum-grid">
		<div>
			<canvas
				bind:this={canvas}
				aria-label={`Radially averaged spatial power spectrum. ${active.reason}`}
			></canvas>
			<p class="caption">
				The field mean is removed first. Any radix-2 grid reduction uses active-area-weighted
				footprint averages before the transform. {active.window === 'hann'
					? 'A two-dimensional Hann window reduces edge leakage for this non-periodic boundary.'
					: 'No window is applied to this periodic field.'}
			</p>
		</div>
		<div class:credible={active.trustworthy} class="peak-card" role="status">
			<span>{active.trustworthy ? 'Credible peak' : 'No invented peak'}</span>
			<strong
				>{active.dominantWavelength === null
					? 'none'
					: `${active.dominantWavelength.toPrecision(4)} model units`}</strong
			>
			<dl>
				<div>
					<dt>measured field</dt>
					<dd>
						{measuredStep === null || measuredModelTime === null
							? 'not yet measured'
							: `step ${measuredStep} · t ${measuredModelTime.toPrecision(5)}`}
					</dd>
				</div>
				<div>
					<dt>q*</dt>
					<dd>{active.dominantQ === null ? '—' : active.dominantQ.toPrecision(4)}</dd>
				</div>
				<div>
					<dt>domain fraction</dt>
					<dd>{active.domainFraction === null ? '—' : active.domainFraction.toPrecision(3)}</dd>
				</div>
				<div>
					<dt>peak prominence</dt>
					<dd>{active.prominence.toPrecision(3)}</dd>
				</div>
				<div>
					<dt>window</dt>
					<dd>{active.window}</dd>
				</div>
			</dl>
			<p>{active.reason}</p>
		</div>
	</div>

	<details>
		<summary>Spectrum values as a table</summary>
		<div class="table-scroll">
			<table>
				<caption>Radially averaged power by wave-number bin</caption>
				<thead><tr><th>q</th><th>Power</th></tr></thead>
				<tbody>
					{#each active.bins.filter((_, index) => index % Math.max(1, Math.floor(active.bins.length / 20)) === 0) as bin (bin.q)}
						<tr><td>{bin.q.toPrecision(5)}</td><td>{bin.power.toPrecision(5)}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

<style>
	.spectrum-panel {
		margin-block: 2rem;
		border: 1px solid color-mix(in oklab, var(--essay-ink, #24302e) 22%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklab, var(--paper-raised, #faf6ec) 96%, #587d75);
		padding: clamp(1rem, 3vw, 1.7rem);
		color: var(--essay-ink, #24302e);
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.8rem;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: #377d72;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h3 {
		margin: 0;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid currentColor;
		border-radius: 999px;
		background: transparent;
		padding: 0.45rem 0.9rem;
		color: inherit;
		font-weight: 800;
	}
	button:disabled {
		opacity: 0.58;
	}
	.spectrum-grid {
		display: grid;
		gap: 1rem;
		margin-top: 1rem;
	}
	canvas {
		display: block;
		width: 100%;
		height: 18rem;
		border-radius: 0.65rem;
		background: #111817;
	}
	.caption {
		margin: 0.55rem 0 0;
		font-size: 0.875rem;
		color: color-mix(in oklab, currentColor 72%, transparent);
	}
	.peak-card {
		align-self: start;
		border: 1px solid #a95345;
		border-radius: 0.75rem;
		background: color-mix(in oklab, #a95345 8%, transparent);
		padding: 1rem;
	}
	.peak-card.credible {
		border-color: #367d70;
		background: color-mix(in oklab, #367d70 9%, transparent);
	}
	.peak-card > span {
		display: block;
		font-size: 0.75rem;
		font-weight: 850;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.peak-card > strong {
		display: block;
		margin-block: 0.4rem 0.9rem;
		font:
			800 1.2rem/1.2 ui-monospace,
			monospace;
	}
	.peak-card dl {
		margin: 0;
	}
	.peak-card dl div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		border-top: 1px solid color-mix(in oklab, currentColor 15%, transparent);
		padding-block: 0.38rem;
	}
	.peak-card dt {
		font-size: 0.875rem;
	}
	.peak-card dd {
		margin: 0;
		font:
			700 0.8rem/1.2 ui-monospace,
			monospace;
	}
	.peak-card p {
		margin: 0.75rem 0 0;
		font-size: 0.8rem;
	}
	details {
		margin-top: 1rem;
	}
	summary {
		min-height: 2.75rem;
		cursor: pointer;
		font-weight: 800;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		min-width: 22rem;
		border-collapse: collapse;
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}
	caption {
		padding: 0.5rem;
		text-align: left;
		font-weight: 700;
	}
	th,
	td {
		border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
		padding: 0.5rem;
		text-align: right;
	}
	@media (min-width: 50rem) {
		.spectrum-grid {
			grid-template-columns: minmax(0, 1.5fr) minmax(15rem, 0.65fr);
		}
	}
	:global(html[data-theme='high-contrast']) .spectrum-panel {
		border-width: 2px;
	}
	:global(html[data-theme='night']) .eyebrow,
	:global(html[data-theme='high-contrast']) .eyebrow {
		color: #8bd2c0;
	}
</style>
