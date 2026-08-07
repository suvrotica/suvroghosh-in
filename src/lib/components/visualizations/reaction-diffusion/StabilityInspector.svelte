<script lang="ts">
	import { onMount } from 'svelte';
	import type { DispersionReading } from '$lib/visualizations/reaction-diffusion/types';

	type Props = {
		id?: string;
		readings?: readonly DispersionReading[];
		selected?: number;
		title?: string;
		onselect?: (index: number) => void;
	};

	const DEFAULT_SAMPLES = Array.from({ length: 65 }, (_, index) => {
		const q = (Math.PI * index) / 64;
		return { q, growthRate: Math.max(-0.0367 - 0.16 * q * q, -0.1016 - 0.08 * q * q) };
	});
	const DEFAULT_READING: DispersionReading = {
		equilibrium: { id: 'feed', u: 1, v: 0 },
		jacobian: {
			matrix: [-0.0367, 0, 0, -0.1016],
			trace: -0.1383,
			determinant: 0.00372872,
			eigenvalues: [
				{ real: -0.0367, imaginary: 0 },
				{ real: -0.1016, imaginary: 0 }
			]
		},
		classification: 'linearly-stable',
		qZeroGrowthRate: -0.0367,
		maximumGrowthRate: -0.0367,
		fastestQ: null,
		linearWavelength: null,
		samples: DEFAULT_SAMPLES
	};

	let {
		id = 'rd-stability',
		readings = [DEFAULT_READING],
		selected = 0,
		title = 'Homogeneous equilibrium and stability inspector',
		onselect
	}: Props = $props();
	let canvas = $state<HTMLCanvasElement>();
	let active = $derived(
		readings[Math.max(0, Math.min(readings.length - 1, selected))] ?? DEFAULT_READING
	);
	let tableSamples = $derived(
		active.samples.filter(
			(_, index) => index % Math.max(1, Math.floor(active.samples.length / 12)) === 0
		)
	);

	$effect(() => {
		active.maximumGrowthRate.toString();
		draw();
	});

	onMount(() => {
		if (!canvas) return;
		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		draw();
		return () => observer.disconnect();
	});

	function classificationLabel(reading: DispersionReading) {
		return reading.classification === 'classical-diffusion-driven'
			? 'Classical diffusion-driven instability'
			: reading.classification === 'reaction-unstable'
				? 'Reaction-unstable before diffusion'
				: reading.classification === 'near-boundary'
					? 'Near a stability boundary'
					: 'Linearly stable over the scanned modes';
	}

	function formatComplex(value: { real: number; imaginary: number }) {
		const imaginary =
			Math.abs(value.imaginary) < 1e-10
				? ''
				: `${value.imaginary >= 0 ? '+' : '−'} ${Math.abs(value.imaginary).toPrecision(3)}i`;
		return `${value.real.toPrecision(4)} ${imaginary}`.trim();
	}

	function draw() {
		if (!canvas || active.samples.length < 2) return;
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
			top: 22 * density,
			bottom: 42 * density
		};
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		const qMax = Math.max(...active.samples.map((sample) => sample.q), 1);
		const dataMin = Math.min(...active.samples.map((sample) => sample.growthRate), 0);
		const dataMax = Math.max(...active.samples.map((sample) => sample.growthRate), 0);
		const padding = Math.max(0.01, (dataMax - dataMin) * 0.12);
		const yMin = dataMin - padding;
		const yMax = dataMax + padding;
		const x = (q: number) => margin.left + (q / qMax) * plotWidth;
		const y = (growth: number) => margin.top + ((yMax - growth) / (yMax - yMin)) * plotHeight;

		context.fillStyle = '#111817';
		context.fillRect(0, 0, width, height);
		context.strokeStyle = 'rgba(236,231,213,.2)';
		context.lineWidth = density;
		for (let line = 0; line <= 4; line += 1) {
			const py = margin.top + (plotHeight * line) / 4;
			context.beginPath();
			context.moveTo(margin.left, py);
			context.lineTo(width - margin.right, py);
			context.stroke();
		}
		context.strokeStyle = '#e5c874';
		context.lineWidth = 1.4 * density;
		context.beginPath();
		context.moveTo(margin.left, y(0));
		context.lineTo(width - margin.right, y(0));
		context.stroke();
		context.strokeStyle = active.maximumGrowthRate > 0 ? '#df7d65' : '#76c5b3';
		context.lineWidth = 2.2 * density;
		context.beginPath();
		active.samples.forEach((sample, index) => {
			if (index === 0) context.moveTo(x(sample.q), y(sample.growthRate));
			else context.lineTo(x(sample.q), y(sample.growthRate));
		});
		context.stroke();
		const markers = [
			{ q: 0, growth: active.qZeroGrowthRate, label: 'q = 0' },
			...(active.fastestQ !== null
				? [{ q: active.fastestQ, growth: active.maximumGrowthRate, label: 'fastest q' }]
				: [])
		];
		context.font = `${9 * density}px ui-monospace, monospace`;
		context.textAlign = 'left';
		for (const marker of markers) {
			context.beginPath();
			context.arc(x(marker.q), y(marker.growth), 3.5 * density, 0, Math.PI * 2);
			context.fillStyle = '#fff3c7';
			context.fill();
			context.fillText(marker.label, x(marker.q) + 6 * density, y(marker.growth) - 5 * density);
		}
		context.fillStyle = '#e9e3d5';
		context.font = `${11 * density}px ui-monospace, monospace`;
		context.textAlign = 'center';
		context.fillText(
			'spatial wave number q (model-length⁻¹)',
			margin.left + plotWidth / 2,
			height - 10 * density
		);
		context.save();
		context.translate(14 * density, margin.top + plotHeight / 2);
		context.rotate(-Math.PI / 2);
		context.fillText('max Re λ(q)', 0, 0);
		context.restore();
	}
</script>

<section class="stability-panel" {id} aria-labelledby={`${id}-title`}>
	<header>
		<p class="eyebrow">Reaction Jacobian · spatial modes</p>
		<h3 id={`${id}-title`}>{title}</h3>
		<p>
			The classification asks a strict question: is a homogeneous reaction equilibrium stable at
			<i>q</i> = 0 yet unstable after diffusion modifies at least one non-zero spatial mode?
		</p>
	</header>

	{#if readings.length > 1}
		<div class="equilibrium-tabs" aria-label="Select homogeneous equilibrium">
			{#each readings as reading, index (`${reading.equilibrium.id}-${index}`)}
				<button type="button" aria-pressed={index === selected} onclick={() => onselect?.(index)}>
					{reading.equilibrium.id === 'feed'
						? 'Feed equilibrium'
						: `${reading.equilibrium.id} branch`}
				</button>
			{/each}
		</div>
	{/if}

	<div class="classification" data-classification={active.classification}>
		<span>{classificationLabel(active)}</span>
		{#if active.classification === 'linearly-stable'}
			<p>
				This run needs more than an infinitesimal perturbation around this tested equilibrium; a
				finite disturbance and nonlinear trajectory can still make structure.
			</p>
		{:else if active.classification === 'classical-diffusion-driven'}
			<p>
				The reaction equilibrium is stable without diffusion, while at least one non-zero spatial
				mode grows after diffusion is included.
			</p>
		{:else if active.classification === 'reaction-unstable'}
			<p>
				The homogeneous reaction system is already unstable at q = 0, so diffusion did not create
				the first instability.
			</p>
		{:else}
			<p>
				The largest growth rate lies close to the numerical tolerance. Small parameter or scan
				changes can alter the label.
			</p>
		{/if}
	</div>

	<div class="stability-grid">
		<div class="plot-card">
			<canvas
				bind:this={canvas}
				aria-label={`Dispersion plot. ${classificationLabel(active)}. Maximum growth rate ${active.maximumGrowthRate.toPrecision(4)}.`}
			></canvas>
			<p class="caption">
				The zero line separates decaying modes below from growing modes above. The scan extends
				across the displayed resolvable range.
			</p>
		</div>
		<dl class="readout">
			<div>
				<dt>Equilibrium (u*, v*)</dt>
				<dd>({active.equilibrium.u.toPrecision(5)}, {active.equilibrium.v.toPrecision(5)})</dd>
			</div>
			<div>
				<dt>trace J</dt>
				<dd>{active.jacobian.trace.toPrecision(5)}</dd>
			</div>
			<div>
				<dt>det J</dt>
				<dd>{active.jacobian.determinant.toPrecision(5)}</dd>
			</div>
			<div>
				<dt>λ₁(0)</dt>
				<dd>{formatComplex(active.jacobian.eigenvalues[0])}</dd>
			</div>
			<div>
				<dt>λ₂(0)</dt>
				<dd>{formatComplex(active.jacobian.eigenvalues[1])}</dd>
			</div>
			<div>
				<dt>max growth</dt>
				<dd>{active.maximumGrowthRate.toPrecision(5)}</dd>
			</div>
			<div>
				<dt>fastest q</dt>
				<dd>{active.fastestQ === null ? 'none' : active.fastestQ.toPrecision(5)}</dd>
			</div>
			<div>
				<dt>linear wavelength</dt>
				<dd>
					{active.linearWavelength === null
						? 'not meaningful'
						: `${active.linearWavelength.toPrecision(5)} model units`}
				</dd>
			</div>
		</dl>
	</div>

	<details>
		<summary>Dispersion values as a table</summary>
		<div class="table-scroll">
			<table>
				<caption>Representative samples from max Re λ(q)</caption>
				<thead><tr><th>q</th><th>Maximum real growth rate</th><th>Mode</th></tr></thead>
				<tbody>
					{#each tableSamples as sample (sample.q)}
						<tr
							><td>{sample.q.toPrecision(5)}</td><td>{sample.growthRate.toPrecision(5)}</td><td
								>{sample.growthRate > 0 ? 'growing' : 'decaying'}</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

<style>
	.stability-panel {
		--stable: #2f796c;
		margin-block: 2rem;
		border: 1px solid color-mix(in oklab, var(--essay-ink, #24302e) 22%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklab, var(--paper-raised, #faf6ec) 96%, #527d75);
		padding: clamp(1rem, 3vw, 1.7rem);
		color: var(--essay-ink, #24302e);
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: var(--stable);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h3 {
		margin: 0 0 0.6rem;
	}
	header p:last-child {
		max-width: 56rem;
	}
	.equilibrium-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-block: 1rem;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid currentColor;
		border-radius: 999px;
		background: transparent;
		padding: 0.45rem 0.8rem;
		color: inherit;
		font-weight: 750;
	}
	button[aria-pressed='true'] {
		background: var(--essay-ink, #24302e);
		color: var(--paper, #f6f0e4);
	}
	.classification {
		margin-block: 1rem;
		border-left: 0.32rem solid var(--stable);
		background: color-mix(in oklab, var(--stable) 9%, transparent);
		padding: 0.75rem 0.9rem;
	}
	.classification[data-classification='reaction-unstable'] {
		--stable: #a64f3f;
	}
	.classification[data-classification='classical-diffusion-driven'] {
		--stable: #8a6429;
	}
	.classification > span {
		font-weight: 850;
	}
	.classification p {
		margin: 0.3rem 0 0;
	}
	.stability-grid {
		display: grid;
		gap: 1rem;
	}
	.plot-card {
		min-width: 0;
	}
	canvas {
		display: block;
		width: 100%;
		height: 19rem;
		border-radius: 0.65rem;
		background: #111817;
	}
	.caption {
		margin: 0.55rem 0 0;
		font-size: 0.78rem;
		color: color-mix(in oklab, currentColor 72%, transparent);
	}
	.readout {
		display: grid;
		align-content: start;
		gap: 0;
		margin: 0;
		border: 1px solid color-mix(in oklab, currentColor 18%, transparent);
		border-radius: 0.7rem;
		overflow: hidden;
	}
	.readout div {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 0.8rem;
		border-bottom: 1px solid color-mix(in oklab, currentColor 14%, transparent);
		padding: 0.58rem 0.7rem;
	}
	.readout div:last-child {
		border-bottom: 0;
	}
	.readout dt {
		font-size: 0.75rem;
		font-weight: 700;
	}
	.readout dd {
		margin: 0;
		font:
			700 0.72rem/1.25 ui-monospace,
			monospace;
		text-align: right;
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
		min-width: 28rem;
		border-collapse: collapse;
		font-size: 0.76rem;
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
	th:last-child,
	td:last-child {
		text-align: left;
	}
	@media (min-width: 52rem) {
		.stability-grid {
			grid-template-columns: minmax(0, 1.5fr) minmax(16rem, 0.7fr);
		}
	}
	:global(html[data-theme='night']) .stability-panel,
	:global(html[data-theme='high-contrast']) .stability-panel {
		--stable: #8dd6c4;
	}
	:global(html[data-theme='high-contrast']) .stability-panel {
		border-width: 2px;
	}
</style>
