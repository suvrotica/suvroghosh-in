<script lang="ts">
	import { gridSpacing } from '$lib/visualizations/bz/constants';
	import { getBZPreset } from '$lib/visualizations/bz/presets';
	import { scanSchnakenbergDispersion } from '$lib/visualizations/bz/stability';
	import type { BZPreset, DispersionSample, SchnakenbergSetup } from '$lib/visualizations/bz/types';

	type SchnakenbergPreset = BZPreset & { readonly setup: SchnakenbergSetup };
	type ParameterKey = 'a' | 'b' | 'gamma' | 'diffusionU' | 'diffusionV';
	type InstabilityBand = { readonly start: number; readonly end: number };

	const PRESET_OPTIONS = [
		{ id: 'stable-uniform-state', label: 'Stable uniform control' },
		{ id: 'diffusion-driven-spots', label: 'Diffusion-driven spots' },
		{ id: 'diffusion-driven-stripes', label: 'Diffusion-driven stripes' },
		{ id: 'labyrinth', label: 'Labyrinth candidate' }
	] as const;
	const GROWTH_TOLERANCE = 1e-9;
	const CHART = { width: 760, height: 310, left: 66, right: 20, top: 24, bottom: 48 } as const;

	function getSchnakenbergPreset(id: string): SchnakenbergPreset {
		const preset = getBZPreset(id);
		if (preset.setup.model !== 'schnakenberg') {
			throw new RangeError(`Turing inspector requires a Schnakenberg preset, received ${id}.`);
		}
		return preset as SchnakenbergPreset;
	}

	const initialPreset = getSchnakenbergPreset('diffusion-driven-spots');
	let presetId = $state(initialPreset.id);
	let a = $state(initialPreset.setup.parameters.a);
	let b = $state(initialPreset.setup.parameters.b);
	let gamma = $state(initialPreset.setup.parameters.gamma);
	let diffusionU = $state(initialPreset.setup.diffusionU);
	let diffusionV = $state(initialPreset.setup.diffusionV);

	let preset = $derived(getSchnakenbergPreset(presetId));
	let setup = $derived.by(
		(): SchnakenbergSetup => ({
			...preset.setup,
			parameters: { a, b, gamma },
			diffusionU,
			diffusionV
		})
	);
	let maximumDisplayedWavenumber = $derived(Math.min(Math.PI / gridSpacing(setup), 10));
	let reading = $derived(
		scanSchnakenbergDispersion(setup, {
			samples: 481,
			maximumWavenumber: maximumDisplayedWavenumber,
			tolerance: GROWTH_TOLERANCE
		})
	);
	let bands = $derived(findInstabilityBands(reading.samples, GROWTH_TOLERANCE));
	let plot = $derived(buildPlot(reading.samples, bands, reading.fastestWavenumber));
	let homogeneousStable = $derived(reading.zeroModeGrowth < -GROWTH_TOLERANCE);
	let spatiallyUnstable = $derived(
		reading.maximumGrowth > GROWTH_TOLERANCE && reading.fastestWavenumber !== null
	);
	let isClassicalTuring = $derived(homogeneousStable && spatiallyUnstable);

	function choosePreset(event: Event): void {
		const next = getSchnakenbergPreset((event.currentTarget as HTMLSelectElement).value);
		presetId = next.id;
		a = next.setup.parameters.a;
		b = next.setup.parameters.b;
		gamma = next.setup.parameters.gamma;
		diffusionU = next.setup.diffusionU;
		diffusionV = next.setup.diffusionV;
	}

	function updateParameter(key: ParameterKey, event: Event): void {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(value)) return;
		if (key === 'a') a = value;
		else if (key === 'b') b = value;
		else if (key === 'gamma') gamma = value;
		else if (key === 'diffusionU') diffusionU = value;
		else diffusionV = value;
	}

	function interpolateZero(left: DispersionSample, right: DispersionSample): number {
		const difference = right.growthRate - left.growthRate;
		if (Math.abs(difference) <= Number.EPSILON) {
			return (left.wavenumber + right.wavenumber) / 2;
		}
		const fraction = -left.growthRate / difference;
		return left.wavenumber + fraction * (right.wavenumber - left.wavenumber);
	}

	function findInstabilityBands(
		samples: readonly DispersionSample[],
		tolerance: number
	): readonly InstabilityBand[] {
		const result: InstabilityBand[] = [];
		let start: number | null = null;
		for (let index = 0; index < samples.length; index += 1) {
			const sample = samples[index];
			const growing = sample.growthRate > tolerance;
			if (growing && start === null) {
				const previous = samples[index - 1];
				start = previous ? interpolateZero(previous, sample) : sample.wavenumber;
			}
			if (!growing && start !== null) {
				const previous = samples[index - 1];
				result.push({
					start,
					end: previous ? interpolateZero(previous, sample) : sample.wavenumber
				});
				start = null;
			}
		}
		if (start !== null && samples.length > 0) {
			result.push({ start, end: samples[samples.length - 1].wavenumber });
		}
		return result;
	}

	function buildPlot(
		samples: readonly DispersionSample[],
		instabilityBands: readonly InstabilityBand[],
		fastestWavenumber: number | null
	) {
		const innerWidth = CHART.width - CHART.left - CHART.right;
		const innerHeight = CHART.height - CHART.top - CHART.bottom;
		const xMaximum = Math.max(samples.at(-1)?.wavenumber ?? 1, Number.EPSILON);
		const growthRates = samples.map((sample) => sample.growthRate);
		const rawMinimum = Math.min(0, ...growthRates);
		const rawMaximum = Math.max(0, ...growthRates);
		const rawSpan = Math.max(rawMaximum - rawMinimum, 1e-6);
		const yMinimum = rawMinimum - rawSpan * 0.08;
		const yMaximum = rawMaximum + rawSpan * 0.12;
		const ySpan = yMaximum - yMinimum;
		const x = (value: number) => CHART.left + (value / xMaximum) * innerWidth;
		const y = (value: number) => CHART.top + ((yMaximum - value) / ySpan) * innerHeight;
		const path = samples
			.map(
				(sample, index) =>
					`${index === 0 ? 'M' : 'L'}${x(sample.wavenumber).toFixed(2)},${y(sample.growthRate).toFixed(2)}`
			)
			.join(' ');
		const xTicks = Array.from({ length: 6 }, (_, index) => {
			const value = (xMaximum * index) / 5;
			return { value, x: x(value) };
		});
		const yTicks = Array.from({ length: 5 }, (_, index) => {
			const value = yMinimum + (ySpan * index) / 4;
			return { value, y: y(value) };
		}).reverse();
		const bandRects = instabilityBands.map((band) => ({
			...band,
			x: x(band.start),
			width: Math.max(0, x(band.end) - x(band.start))
		}));
		const fastest =
			fastestWavenumber === null
				? null
				: {
						x: x(fastestWavenumber),
						y: y(Math.max(...growthRates))
					};
		return {
			path,
			xTicks,
			yTicks,
			bandRects,
			fastest,
			zeroY: y(0),
			plotTop: CHART.top,
			plotBottom: CHART.height - CHART.bottom,
			plotLeft: CHART.left,
			plotRight: CHART.width - CHART.right
		};
	}

	function formatNumber(value: number, digits = 3): string {
		if (!Number.isFinite(value)) return 'not finite';
		if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 1_000)) {
			return value.toExponential(2);
		}
		return value.toFixed(digits);
	}

	function formatComplex(value: { readonly real: number; readonly imaginary: number }): string {
		if (Math.abs(value.imaginary) < 1e-10) return formatNumber(value.real, 4);
		return `${formatNumber(value.real, 4)} ${value.imaginary < 0 ? '−' : '+'} ${formatNumber(Math.abs(value.imaginary), 4)}i`;
	}

	function formatBand(band: InstabilityBand): string {
		return `${formatNumber(band.start, 2)} < k < ${formatNumber(band.end, 2)}`;
	}

	function classificationLabel(classification: typeof reading.classification): string {
		if (classification === 'classical-diffusion-driven') return 'Classical diffusion-driven onset';
		if (classification === 'reaction-unstable') return 'Reaction-only state already unstable';
		if (classification === 'linearly-stable') return 'No growing mode in the scanned range';
		return 'Near a linear-stability boundary';
	}
</script>

<section class="turing-inspector article-breakout" aria-labelledby="bz-turing-inspector-title">
	<header class="inspector-header">
		<div>
			<p class="eyebrow">Live Schnakenberg stability inspector</p>
			<h3 id="bz-turing-inspector-title">Does diffusion create a growing spatial mode?</h3>
		</div>
		<label class="preset-control" for="bz-turing-preset">
			<span>Declared setup</span>
			<select id="bz-turing-preset" value={presetId} onchange={choosePreset}>
				{#each PRESET_OPTIONS as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
		</label>
	</header>

	<div class="criteria" aria-live="polite">
		<article data-pass={homogeneousStable}>
			<span>Criterion 1 · k = 0</span>
			<strong
				>{homogeneousStable
					? 'Pass: homogeneous disturbances decay'
					: 'Fail: reaction-only stability is absent'}</strong
			>
			<p>Largest real eigenvalue: {formatNumber(reading.zeroModeGrowth, 5)}</p>
		</article>
		<article data-pass={spatiallyUnstable}>
			<span>Criterion 2 · k &gt; 0</span>
			<strong
				>{spatiallyUnstable
					? 'Pass: a non-zero band grows'
					: 'Fail: no non-zero growing band'}</strong
			>
			<p>Maximum sampled growth: {formatNumber(reading.maximumGrowth, 5)}</p>
		</article>
		<article class="verdict" data-pass={isClassicalTuring}>
			<span>Classification</span>
			<strong>{classificationLabel(reading.classification)}</strong>
			<p>
				{isClassicalTuring
					? 'Both necessary linear tests pass.'
					: 'Do not label this setup a classical Turing onset.'}
			</p>
		</article>
	</div>

	<div class="inspector-layout">
		<div class="chart-panel">
			<svg
				viewBox={`0 0 ${CHART.width} ${CHART.height}`}
				role="img"
				aria-labelledby="bz-dispersion-title bz-dispersion-description"
			>
				<title id="bz-dispersion-title">Schnakenberg dispersion relation</title>
				<desc id="bz-dispersion-description">
					Largest real eigenvalue of J minus k squared times the diffusion matrix, from k zero to {formatNumber(
						maximumDisplayedWavenumber,
						2
					)}. {bands.length > 0
						? `Positive growth occurs in ${bands.map(formatBand).join(' and ')}.`
						: 'No positive-growth band occurs in the scanned range.'}
				</desc>

				{#each plot.bandRects as band (band.start)}
					<rect
						class="unstable-band"
						x={band.x}
						y={plot.plotTop}
						width={band.width}
						height={plot.plotBottom - plot.plotTop}
					/>
				{/each}
				{#each plot.yTicks as tick (tick.value)}
					<line class="grid-line" x1={plot.plotLeft} x2={plot.plotRight} y1={tick.y} y2={tick.y} />
					<text class="axis-tick" x={plot.plotLeft - 10} y={tick.y + 4} text-anchor="end">
						{formatNumber(tick.value, 2)}
					</text>
				{/each}
				{#each plot.xTicks as tick (tick.value)}
					<line
						class="tick-mark"
						x1={tick.x}
						x2={tick.x}
						y1={plot.plotBottom}
						y2={plot.plotBottom + 6}
					/>
					<text class="axis-tick" x={tick.x} y={plot.plotBottom + 23} text-anchor="middle">
						{formatNumber(tick.value, 1)}
					</text>
				{/each}
				<line
					class="axis"
					x1={plot.plotLeft}
					x2={plot.plotRight}
					y1={plot.plotBottom}
					y2={plot.plotBottom}
				/>
				<line
					class="axis"
					x1={plot.plotLeft}
					x2={plot.plotLeft}
					y1={plot.plotTop}
					y2={plot.plotBottom}
				/>
				<line
					class="zero-line"
					x1={plot.plotLeft}
					x2={plot.plotRight}
					y1={plot.zeroY}
					y2={plot.zeroY}
				/>
				<path class="dispersion-line" d={plot.path} />
				{#if plot.fastest}
					<line
						class="fastest-guide"
						x1={plot.fastest.x}
						x2={plot.fastest.x}
						y1={plot.fastest.y}
						y2={plot.plotBottom}
					/>
					<circle class="fastest-point" cx={plot.fastest.x} cy={plot.fastest.y} r="5" />
					<text
						class="direct-label"
						x={Math.min(plot.fastest.x + 9, plot.plotRight - 116)}
						y={plot.fastest.y - 10}
					>
						fastest k = {formatNumber(reading.fastestWavenumber ?? 0, 2)}
					</text>
				{/if}
				<text
					class="axis-label"
					x={(plot.plotLeft + plot.plotRight) / 2}
					y={CHART.height - 7}
					text-anchor="middle"
				>
					wave number k
				</text>
				<text
					class="axis-label"
					transform={`translate(16 ${(plot.plotTop + plot.plotBottom) / 2}) rotate(-90)`}
					text-anchor="middle"
				>
					largest Re(λ)
				</text>
			</svg>
			<div class="legend" aria-hidden="true">
				<span><i class="line-key"></i>largest eigenvalue</span>
				<span><i class="band-key"></i>positive-growth band</span>
				<span><i class="zero-key"></i>zero growth</span>
			</div>
			<p class="chart-note">
				Eigenvalues are evaluated analytically for each sampled <i>k</i>; band endpoints are
				linearly interpolated between neighbouring samples. This is a linear onset test, not a
				measurement of the mature field.
			</p>
		</div>

		<fieldset class="parameter-controls">
			<legend>Reaction and diffusion parameters</legend>
			<label for="bz-ti-a">
				<span><i>a</i> · feed term <strong>{a.toFixed(2)}</strong></span>
				<input
					id="bz-ti-a"
					type="range"
					min="0.01"
					max="0.6"
					step="0.01"
					value={a}
					oninput={(event) => updateParameter('a', event)}
				/>
			</label>
			<label for="bz-ti-b">
				<span><i>b</i> · feed term <strong>{b.toFixed(2)}</strong></span>
				<input
					id="bz-ti-b"
					type="range"
					min="0.1"
					max="1.5"
					step="0.01"
					value={b}
					oninput={(event) => updateParameter('b', event)}
				/>
			</label>
			<label for="bz-ti-gamma">
				<span><i>γ</i> · reaction scale <strong>{gamma.toFixed(1)}</strong></span>
				<input
					id="bz-ti-gamma"
					type="range"
					min="0.1"
					max="5"
					step="0.1"
					value={gamma}
					oninput={(event) => updateParameter('gamma', event)}
				/>
			</label>
			<label for="bz-ti-du">
				<span
					><i>D</i><sub>u</sub> · activator diffusion <strong>{diffusionU.toFixed(3)}</strong></span
				>
				<input
					id="bz-ti-du"
					type="range"
					min="0.001"
					max="0.2"
					step="0.001"
					value={diffusionU}
					oninput={(event) => updateParameter('diffusionU', event)}
				/>
			</label>
			<label for="bz-ti-dv">
				<span
					><i>D</i><sub>v</sub> · inhibitor diffusion <strong>{diffusionV.toFixed(3)}</strong></span
				>
				<input
					id="bz-ti-dv"
					type="range"
					min="0.001"
					max="0.6"
					step="0.001"
					value={diffusionV}
					oninput={(event) => updateParameter('diffusionV', event)}
				/>
			</label>
			<p>
				The controls alter the declared Schnakenberg equations only. They do not rename a
				finite-field texture or guarantee its eventual spot, stripe or labyrinth morphology.
			</p>
		</fieldset>
	</div>

	<div class="table-wrap">
		<table>
			<caption>Analytical and sampled stability evidence</caption>
			<thead>
				<tr
					><th scope="col">Quantity</th><th scope="col">Result</th><th scope="col"
						>Why it matters</th
					></tr
				>
			</thead>
			<tbody>
				<tr>
					<th scope="row">Homogeneous equilibrium</th>
					<td
						><i>u</i>* = {formatNumber(reading.equilibrium.u)}, <i>v</i>* = {formatNumber(
							reading.equilibrium.v
						)}</td
					>
					<td>Both local reaction terms vanish here.</td>
				</tr>
				<tr>
					<th scope="row">Reaction Jacobian</th>
					<td class="mono"
						>[{reading.jacobian.matrix.map((value) => formatNumber(value, 3)).join(', ')}]</td
					>
					<td
						>Trace {formatNumber(reading.jacobian.trace)}; determinant {formatNumber(
							reading.jacobian.determinant
						)}.</td
					>
				</tr>
				<tr>
					<th scope="row">Reaction eigenvalues</th>
					<td class="mono">{reading.jacobian.eigenvalues.map(formatComplex).join('; ')}</td>
					<td>Both real parts must be negative at <i>k</i> = 0.</td>
				</tr>
				<tr>
					<th scope="row">Positive-growth band</th>
					<td
						>{bands.length > 0 ? bands.map(formatBand).join('; ') : 'None in the scanned range'}</td
					>
					<td>A classical diffusion-driven onset needs growth at non-zero <i>k</i>.</td>
				</tr>
				<tr>
					<th scope="row">Fastest mode</th>
					<td
						>{reading.fastestWavenumber === null
							? 'Not applicable'
							: `k = ${formatNumber(reading.fastestWavenumber, 3)}`}</td
					>
					<td
						>{reading.predictedWavelength === null
							? 'No linear wavelength is claimed.'
							: `Predicted λ = ${formatNumber(reading.predictedWavelength, 3)}.`}</td
					>
				</tr>
				<tr>
					<th scope="row">Grid resolution</th>
					<td
						>{reading.fastestWavenumber === null
							? 'Not applicable'
							: reading.resolved
								? 'Fastest mode is resolved'
								: 'Fastest mode is not resolved'}</td
					>
					<td>Grid Nyquist limit: {formatNumber(reading.nyquistWavenumber, 2)}.</td>
				</tr>
			</tbody>
		</table>
	</div>

	<p class="plain-language">
		<strong>In plain language.</strong> First ask whether a well-mixed nudge dies. Then ask whether
		diffusion makes some finite spatial wavelength grow. Only the combination—stable at <i>k</i> =
		0, unstable for a band with <i>k</i> &gt; 0—earns the classical diffusion-driven label used here.
	</p>
</section>

<style>
	.turing-inspector {
		--cyan: #6de6ef;
		--gold: #f5c66a;
		--green: #77d5b8;
		--orange: #f0a37d;
		width: min(74rem, calc(100vw - 2rem));
		margin-block: 2.5rem;
		padding: clamp(1rem, 2.4vw, 1.75rem);
		border: 1px solid #3b515b;
		border-radius: 1.25rem;
		background: linear-gradient(145deg, #0b171d, #071015 72%);
		color: #eaf5f8;
		box-shadow: 0 1.5rem 3.5rem rgb(2 8 12 / 24%);
	}

	.inspector-header,
	.criteria,
	.inspector-layout {
		display: grid;
		gap: 1rem;
	}

	.inspector-header {
		grid-template-columns: 1fr minmax(14rem, 20rem);
		align-items: end;
		margin-bottom: 1rem;
	}

	h3,
	p {
		margin: 0;
	}

	h3 {
		color: #fff;
		font-size: clamp(1.25rem, 2vw, 1.7rem);
	}

	.eyebrow {
		margin-bottom: 0.3rem;
		color: var(--cyan);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.preset-control,
	.parameter-controls label {
		display: grid;
		gap: 0.35rem;
		color: #c5d4da;
		font-size: 0.82rem;
		font-weight: 700;
	}

	select {
		min-height: 2.75rem;
		width: 100%;
		border: 1px solid #526b76;
		border-radius: 0.7rem;
		background: #101f26;
		padding: 0.55rem 0.7rem;
		color: #fff;
	}

	.criteria {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-bottom: 1rem;
	}

	.criteria article {
		min-width: 0;
		border: 1px solid #435861;
		border-left: 4px solid var(--orange);
		border-radius: 0.85rem;
		background: rgb(15 30 37 / 86%);
		padding: 0.85rem;
	}

	.criteria article[data-pass='true'] {
		border-left-color: var(--green);
	}

	.criteria article.verdict {
		border-left-color: var(--gold);
	}

	.criteria span {
		display: block;
		margin-bottom: 0.35rem;
		color: #9fb2ba;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.criteria strong {
		display: block;
		color: #fff;
		font-size: 0.92rem;
	}

	.criteria p {
		margin-top: 0.35rem;
		color: #b8c7cd;
		font-size: 0.78rem;
		line-height: 1.45;
	}

	.inspector-layout {
		grid-template-columns: minmax(0, 1.6fr) minmax(15rem, 0.7fr);
		align-items: start;
	}

	.chart-panel,
	.parameter-controls {
		border: 1px solid #30464f;
		border-radius: 1rem;
		background: rgb(7 16 21 / 72%);
	}

	.chart-panel {
		min-width: 0;
		padding: 0.6rem 0.6rem 0.8rem;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}

	.grid-line,
	.tick-mark,
	.axis,
	.zero-line,
	.fastest-guide {
		vector-effect: non-scaling-stroke;
	}

	.grid-line {
		stroke: #31454e;
		stroke-width: 1;
	}

	.tick-mark,
	.axis {
		stroke: #8498a1;
		stroke-width: 1.2;
	}

	.zero-line {
		stroke: #b9c8ce;
		stroke-width: 1.3;
		stroke-dasharray: 5 5;
	}

	.unstable-band {
		fill: rgb(245 198 106 / 13%);
	}

	.dispersion-line {
		fill: none;
		stroke: var(--cyan);
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}

	.fastest-guide {
		stroke: var(--gold);
		stroke-width: 1.5;
		stroke-dasharray: 4 4;
	}

	.fastest-point {
		fill: var(--gold);
		stroke: #071015;
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}

	.axis-tick,
	.axis-label,
	.direct-label {
		fill: #bdcbd1;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}

	.axis-tick {
		font-size: 11px;
	}

	.axis-label {
		font-size: 12px;
		font-weight: 700;
	}

	.direct-label {
		fill: #ffe4a6;
		font-size: 11px;
		font-weight: 700;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		padding-inline: 0.5rem;
		color: #b9c8ce;
		font-size: 0.75rem;
	}

	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.legend i {
		display: inline-block;
		width: 1.5rem;
		height: 0.45rem;
	}

	.line-key {
		border-top: 3px solid var(--cyan);
	}

	.band-key {
		background: rgb(245 198 106 / 30%);
	}

	.zero-key {
		border-top: 1px dashed #b9c8ce;
	}

	.chart-note,
	.parameter-controls p,
	.plain-language {
		color: #b9c8ce;
		font-size: 0.82rem;
		line-height: 1.55;
	}

	.chart-note {
		margin: 0.7rem 0.5rem 0;
	}

	.parameter-controls {
		display: grid;
		gap: 0.85rem;
		margin: 0;
		padding: 1rem;
	}

	.parameter-controls legend {
		padding-inline: 0.35rem;
		color: #fff;
		font-size: 0.9rem;
		font-weight: 800;
	}

	.parameter-controls label span {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.parameter-controls strong {
		color: #fff;
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-variant-numeric: tabular-nums;
	}

	input {
		width: 100%;
		min-height: 1.6rem;
		accent-color: var(--cyan);
	}

	.parameter-controls p {
		border-left: 3px solid var(--gold);
		padding-left: 0.7rem;
	}

	.table-wrap {
		margin-top: 1rem;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	caption {
		padding: 0 0 0.55rem;
		color: #fff;
		font-weight: 800;
		text-align: left;
	}

	th,
	td {
		border-bottom: 1px solid #344950;
		padding: 0.55rem;
		text-align: left;
		vertical-align: top;
	}

	thead th {
		color: #9fb2ba;
		font-size: 0.68rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	tbody th,
	tbody td:first-of-type {
		color: #ecf5f7;
	}

	tbody td:last-child {
		color: #b8c7cd;
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-variant-numeric: tabular-nums;
	}

	.plain-language {
		margin-top: 1rem;
		border-left: 3px solid var(--gold);
		background: rgb(245 198 106 / 8%);
		padding: 0.7rem 0.85rem;
	}

	.plain-language strong {
		color: #fff0c6;
	}

	:global(html[data-theme='high-contrast']) .turing-inspector {
		border: 2px solid currentColor;
		background: #000;
		box-shadow: none;
	}

	@media (max-width: 58rem) {
		.inspector-layout {
			grid-template-columns: 1fr;
		}

		.parameter-controls {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.parameter-controls legend,
		.parameter-controls p {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 44rem) {
		.inspector-header,
		.criteria,
		.parameter-controls {
			grid-template-columns: 1fr;
		}

		.parameter-controls legend,
		.parameter-controls p {
			grid-column: auto;
		}

		.chart-panel {
			overflow-x: auto;
		}

		svg {
			min-width: 38rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		select,
		input {
			scroll-behavior: auto;
		}
	}

	@media (forced-colors: active) {
		.turing-inspector,
		.criteria article,
		.chart-panel,
		.parameter-controls {
			border: 1px solid CanvasText;
			background: Canvas;
			color: CanvasText;
			box-shadow: none;
		}

		.dispersion-line,
		.fastest-guide,
		.grid-line,
		.axis,
		.zero-line {
			stroke: CanvasText;
		}
	}
</style>
