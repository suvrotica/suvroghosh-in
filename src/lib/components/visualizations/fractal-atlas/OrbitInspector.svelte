<script lang="ts">
	import { onDestroy } from 'svelte';
	import type {
		ComplexValue,
		DecimalComplexValue,
		EscapeOrbitResult,
		FractalFamily,
		NewtonOrbitResult,
		OrbitPoint
	} from '$lib/visualizations/fractal-atlas/types';

	type Props = {
		result: EscapeOrbitResult | NewtonOrbitResult | null;
		selected: ComplexValue;
		family: FractalFamily;
		juliaC: ComplexValue;
	};

	let { result, selected, family, juliaC }: Props = $props();
	let cursor = $state(0);
	let playing = $state(false);
	let playbackDelay = $state(320);
	let logarithmicMagnitude = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	let orbit = $derived(result?.orbit ?? []);
	let visibleOrbit = $derived(orbit.slice(0, Math.min(orbit.length, cursor + 1)));
	let visiblePlotOrbit = $derived(
		visibleOrbit.filter(
			(point) => Number.isFinite(point.value.re) && Number.isFinite(point.value.im)
		)
	);
	let escapeResult = $derived(result && 'plane' in result ? result : null);
	let newtonResult = $derived(result && 'residual' in result ? result : null);
	let exactPixel = $derived(escapeResult?.pixelDecimal);
	let exactC = $derived(escapeResult?.cDecimal);
	let exactOrbit = $derived(Boolean(escapeResult?.decimalPrecision));
	let periodDetection = $derived(escapeResult?.periodDetection);
	let rootMarkers = $derived.by(() => {
		if (!newtonResult) return [];
		if (newtonResult.roots.length) return newtonResult.roots;
		return newtonResult.root ? [newtonResult.root] : [];
	});
	let plotBounds = $derived.by(() => boundsFor(orbit, rootMarkers, escapeResult?.bailout ?? 0));
	let maximumRadius = $derived(result?.maximumMagnitude ?? 0);
	let pixelRole = $derived.by(() => {
		if (newtonResult) return 'starting guess z₀';
		return escapeResult?.plane === 'parameter' ? 'parameter c' : 'starting value z₀';
	});
	let status = $derived.by(() => {
		if (!result) return 'Select a point on the canvas to calculate its orbit.';
		const iterations = `${result.iterations} iteration${result.iterations === 1 ? '' : 's'}`;
		if (newtonResult?.status === 'converged') {
			const root =
				newtonResult.rootIndex === undefined ? 'a root' : `root ${newtonResult.rootIndex + 1}`;
			return `Converged to ${root} after ${iterations}; residual ${format(newtonResult.residual)}.`;
		}
		if (newtonResult?.status === 'derivative-zero') {
			return `Stopped after ${iterations}: the derivative was numerically zero; residual ${format(newtonResult.residual)}.`;
		}
		if (newtonResult) {
			return `${newtonResult.status.replaceAll('-', ' ')} after ${iterations}; residual ${format(newtonResult.residual)}.`;
		}
		return `${result.status.replaceAll('-', ' ')} after ${iterations}.`;
	});
	let plotDescription = $derived.by(() => {
		if (!result) return `Complex-plane orbit plot. ${status}`;
		if (newtonResult) {
			return `Newton convergence path. ${rootMarkers.length} known root${rootMarkers.length === 1 ? '' : 's'} marked. ${status}`;
		}
		return `Escape orbit with a labelled unit circle and a dashed bailout circle of radius ${format(escapeResult?.bailout ?? 0)}. ${status}`;
	});
	let tableCaption = $derived(
		`Calculated ${newtonResult ? 'Newton convergence' : 'escape'} orbit values for the selected ${pixelRole}`
	);
	let visibleMagnitudes = $derived(
		visibleOrbit.map((point) => Math.hypot(point.value.re, point.value.im))
	);
	let visibleArguments = $derived(
		visibleOrbit.map((point) => Math.atan2(point.value.im, point.value.re))
	);
	let magnitudeTrace = $derived(
		tracePoints(
			visibleMagnitudes.map((value) =>
				logarithmicMagnitude ? Math.log10(Math.max(Number.MIN_VALUE, value)) : value
			),
			false
		)
	);
	let argumentTrace = $derived(tracePoints(visibleArguments, true));
	let rootDistanceTrace = $derived(
		logDiagnosticTrace(visibleOrbit.map((point) => point.nearestRootDistance))
	);
	let derivativeTrace = $derived(
		logDiagnosticTrace(visibleOrbit.map((point) => point.derivativeMagnitude))
	);

	$effect(() => {
		void result;
		cursor = 0;
		stopPlayback();
	});

	$effect(() => {
		if (cursor >= Math.max(0, orbit.length - 1)) {
			playing = false;
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		}
	});

	function tracePoints(values: number[], fixedArgumentRange: boolean) {
		const finite = values.map((value) => (Number.isFinite(value) ? value : 0));
		if (!finite.length) return '';
		const minimum = fixedArgumentRange ? -Math.PI : Math.min(...finite);
		const maximum = fixedArgumentRange ? Math.PI : Math.max(...finite);
		const range = Math.max(1e-12, maximum - minimum);
		return finite
			.map((value, index) => {
				const x = 7 + (index / Math.max(1, finite.length - 1)) * 186;
				const y = 73 - ((value - minimum) / range) * 66;
				return `${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function logDiagnosticTrace(values: Array<number | undefined>) {
		if (!values.some((value) => value !== undefined && Number.isFinite(value))) return '';
		return tracePoints(
			values.map((value) =>
				value !== undefined && Number.isFinite(value)
					? Math.log10(Math.max(Number.MIN_VALUE, value))
					: Number.NaN
			),
			false
		);
	}

	function boundsFor(
		points: OrbitPoint[],
		markers: readonly ComplexValue[],
		referenceRadius: number
	) {
		const finite = [...points.map((point) => point.value), ...markers].filter(
			(point) => Number.isFinite(point.re) && Number.isFinite(point.im)
		);
		if (!finite.length) return { minRe: -2, maxRe: 2, minIm: -2, maxIm: 2 };
		const re = finite.map((point) => point.re);
		const im = finite.map((point) => point.im);
		const maximum = Math.max(
			2,
			Number.isFinite(referenceRadius) ? referenceRadius : 0,
			...re.map(Math.abs),
			...im.map(Math.abs)
		);
		return { minRe: -maximum, maxRe: maximum, minIm: -maximum, maxIm: maximum };
	}

	function plotX(value: number) {
		return 8 + ((value - plotBounds.minRe) / (plotBounds.maxRe - plotBounds.minRe)) * 184;
	}

	function plotY(value: number) {
		return 192 - ((value - plotBounds.minIm) / (plotBounds.maxIm - plotBounds.minIm)) * 184;
	}

	function plotRadius(value: number) {
		return (value / (plotBounds.maxRe - plotBounds.minRe)) * 184;
	}

	function togglePlay() {
		if (playing) {
			stopPlayback();
			return;
		}
		if (cursor >= orbit.length - 1) cursor = 0;
		playing = true;
		startPlaybackTimer();
	}

	function startPlaybackTimer() {
		if (timer) clearInterval(timer);
		timer = setInterval(() => {
			cursor = Math.min(orbit.length - 1, cursor + 1);
		}, playbackDelay);
	}

	function stopPlayback() {
		playing = false;
		if (timer) clearInterval(timer);
		timer = null;
	}

	function setPlaybackDelay(event: Event) {
		playbackDelay = Number((event.currentTarget as HTMLSelectElement).value);
		if (playing) startPlaybackTimer();
	}

	function format(value: number) {
		if (!Number.isFinite(value)) return 'not finite';
		if (Math.abs(value) >= 1e5 || (Math.abs(value) > 0 && Math.abs(value) < 1e-5)) {
			return value.toExponential(4);
		}
		return value.toFixed(6);
	}

	function formatComplex(value: ComplexValue) {
		return `${format(value.re)} ${value.im < 0 ? '−' : '+'} ${format(Math.abs(value.im))}i`;
	}

	function formatDecimalComplex(value: DecimalComplexValue) {
		const imaginary = value.im.trim();
		const negative = imaginary.startsWith('-') && !/^-(?:0+(?:\.0*)?|0*\.0+)$/.test(imaginary);
		return `${value.re} ${negative ? '−' : '+'} ${negative ? imaginary.slice(1) : imaginary}i`;
	}

	function formatAuthoritative(exact: DecimalComplexValue | undefined, shadow: ComplexValue) {
		return exact ? formatDecimalComplex(exact) : formatComplex(shadow);
	}

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});
</script>

<section class="orbit-inspector" aria-labelledby="orbit-inspector-heading">
	<div class="inspector-heading">
		<div>
			<p>Probe instrument</p>
			<h3 id="orbit-inspector-heading">One pixel's paperwork</h3>
		</div>
		<span>{family}</span>
	</div>

	<div class="status" aria-live="polite">{status}</div>

	<dl class="summary">
		<div>
			<dt>Pixel value</dt>
			<dd class:exact-coordinate={exactPixel}>{formatAuthoritative(exactPixel, selected)}</dd>
		</div>
		<div>
			<dt>Pixel role</dt>
			<dd>{pixelRole}</dd>
		</div>
		{#if escapeResult?.plane === 'parameter'}
			<div>
				<dt>Varies per pixel</dt>
				<dd class:exact-coordinate={exactPixel}>c = {formatAuthoritative(exactPixel, selected)}</dd>
			</div>
			<div>
				<dt>Fixed start</dt>
				<dd>z₀ = 0 + 0i</dd>
			</div>
		{:else if escapeResult?.plane === 'dynamical'}
			<div>
				<dt>Varies per pixel</dt>
				<dd class:exact-coordinate={exactPixel}>
					z₀ = {formatAuthoritative(exactPixel, selected)}
				</dd>
			</div>
			<div>
				<dt>Fixed c</dt>
				<dd class:exact-coordinate={exactC}>
					{formatAuthoritative(exactC, escapeResult.c ?? juliaC)}
				</dd>
			</div>
		{:else if newtonResult}
			<div>
				<dt>Varies per pixel</dt>
				<dd>initial guess z₀ = {formatComplex(selected)}</dd>
			</div>
			<div>
				<dt>Fixed test</dt>
				<dd>|f(zₙ)| ≤ {format(newtonResult.convergenceTolerance)}</dd>
			</div>
			<div>
				<dt>Relaxation</dt>
				<dd>λ = {format(newtonResult.relaxation)}</dd>
			</div>
		{/if}
		{#if result}
			<div>
				<dt>Final z</dt>
				<dd class:exact-coordinate={escapeResult?.valueDecimal}>
					{formatAuthoritative(escapeResult?.valueDecimal, result.value)}
				</dd>
			</div>
			<div>
				<dt>Maximum radius</dt>
				<dd>{format(maximumRadius)}</dd>
			</div>
		{/if}
		{#if escapeResult?.decimalPrecision}
			<div>
				<dt>Orbit arithmetic</dt>
				<dd>
					Decimal · {escapeResult.decimalPrecision} significant digits; coordinate and iterate strings
					are authoritative, while derived display metrics are rounded
				</dd>
			</div>
		{/if}
		{#if family === 'phoenix' && escapeResult?.previous}
			<div>
				<dt>Final previous z</dt>
				<dd>{formatComplex(escapeResult.previous)}</dd>
			</div>
		{/if}
		{#if result && 'period' in result && result.period}
			<div>
				<dt>Apparent period</dt>
				<dd>
					{result.period} · tolerance {format(periodDetection?.tolerance ?? 1e-12)} ·
					{periodDetection?.matchingCycles ?? 1} matching cycle{periodDetection?.matchingCycles ===
					1
						? ''
						: 's'} after {periodDetection?.transientIterations ?? 0} transient iterations · numerical
					estimate, not proof
				</dd>
			</div>
		{:else if escapeResult}
			<div>
				<dt>Period check</dt>
				{#if periodDetection?.enabled === false}
					<dd>Disabled for this probe</dd>
				{:else if escapeResult.status === 'max-iterations'}
					<dd>
						No period detected at tolerance {format(periodDetection?.tolerance ?? 1e-12)} after
						{periodDetection?.transientIterations ?? 0} transient iterations; 0 matching cycles of
						{periodDetection?.requiredMatchingCycles ?? 3} required. Unresolved is not proof of aperiodicity.
					</dd>
				{:else}
					<dd>
						No period detected before {escapeResult.status.replaceAll('-', ' ')} at tolerance
						{format(periodDetection?.tolerance ?? 1e-12)}
					</dd>
				{/if}
			</div>
		{/if}
		{#if result && 'rootIndex' in result && result.rootIndex !== undefined}
			<div>
				<dt>Final root</dt>
				<dd>Root {result.rootIndex + 1}; residual {format(result.residual)}</dd>
			</div>
		{/if}
	</dl>

	<div class="plot-grid">
		<svg viewBox="0 0 200 200" role="img" aria-label={plotDescription}>
			<rect width="200" height="200" />
			<line x1="0" y1={plotY(0)} x2="200" y2={plotY(0)} class="axis" />
			<line x1={plotX(0)} y1="0" x2={plotX(0)} y2="200" class="axis" />
			{#if escapeResult}
				<circle cx={plotX(0)} cy={plotY(0)} r={plotRadius(1)} class="unit-circle">
					<title>Unit circle reference, |z| equals 1</title>
				</circle>
				<text x={Math.min(144, plotX(0) + plotRadius(1) + 3)} y={plotY(0) - 3} class="circle-label"
					>unit · |z| = 1</text
				>
				<circle cx={plotX(0)} cy={plotY(0)} r={plotRadius(escapeResult.bailout)} class="bailout">
					<title>Configured bailout circle, |z| equals {format(escapeResult.bailout)}</title>
				</circle>
				<text
					x={plotX(0) + 4}
					y={Math.max(12, plotY(0) - plotRadius(escapeResult.bailout) + 9)}
					class="circle-label bailout-label">escape · |z| = {format(escapeResult.bailout)}</text
				>
			{:else if newtonResult}
				{#each rootMarkers as root, index (`${root.re}:${root.im}:${index}`)}
					<g class="root-marker">
						<title
							>Root R{index + 1} at {format(root.re)}
							{root.im < 0 ? 'minus' : 'plus'}
							{format(Math.abs(root.im))} imaginary</title
						>
						<circle cx={plotX(root.re)} cy={plotY(root.im)} r="4.2" />
						<line
							x1={plotX(root.re) - 2.2}
							y1={plotY(root.im)}
							x2={plotX(root.re) + 2.2}
							y2={plotY(root.im)}
						/>
						<line
							x1={plotX(root.re)}
							y1={plotY(root.im) - 2.2}
							x2={plotX(root.re)}
							y2={plotY(root.im) + 2.2}
						/>
						<text
							x={Math.min(184, Math.max(6, plotX(root.re) + 6))}
							y={Math.min(194, Math.max(10, plotY(root.im) - 5))}
							class="root-label">R{index + 1}</text
						>
					</g>
				{/each}
			{/if}
			{#if visiblePlotOrbit.length > 1}
				<polyline
					points={visiblePlotOrbit
						.map((point) => `${plotX(point.value.re)},${plotY(point.value.im)}`)
						.join(' ')}
					class="orbit-line"
				/>
			{/if}
			{#each visiblePlotOrbit as point, index (point.iteration)}
				<circle
					cx={plotX(point.value.re)}
					cy={plotY(point.value.im)}
					r={index === 0 || index === visiblePlotOrbit.length - 1 ? 3.2 : 1.8}
					class:start={index === 0}
					class:end={index === visiblePlotOrbit.length - 1}
				/>
			{/each}
		</svg>
		{#if newtonResult}
			<p class="plot-key">
				Ringed crosses mark known roots; the numbered path follows Newton's convergence steps.
			</p>
		{:else if escapeResult}
			<p class="plot-key">
				The fine dotted circle marks |z| = 1. The wider dashed circle is the configured escape
				radius, not a boundary of the fractal.
				{#if exactOrbit}
					Plot positions, magnitudes, and arguments are Number shadows; exact coordinates and Re/Im
					table cells retain the Decimal calculation.{/if}
			</p>
		{/if}
		<div class="transport">
			<button
				type="button"
				onclick={() => (cursor = Math.max(0, cursor - 1))}
				disabled={!orbit.length || cursor === 0}>Back</button
			>
			<button type="button" onclick={togglePlay} disabled={orbit.length < 2}
				>{playing ? 'Pause' : 'Play'}</button
			>
			<button
				type="button"
				onclick={() => (cursor = Math.min(orbit.length - 1, cursor + 1))}
				disabled={!orbit.length || cursor >= orbit.length - 1}>Step</button
			>
			<button type="button" onclick={() => (cursor = 0)} disabled={!orbit.length}>Reset</button>
		</div>
		<label class="speed-field">
			<span>Playback speed (presentation only)</span>
			<select value={playbackDelay} onchange={setPlaybackDelay}>
				<option value="800">Slow · 0.8 s / step</option>
				<option value="320">Measured · 0.32 s / step</option>
				<option value="120">Fast · 0.12 s / step</option>
			</select>
		</label>
		<label>
			<span
				>Displayed through iteration {orbit[Math.min(cursor, Math.max(0, orbit.length - 1))]
					?.iteration ?? 0}</span
			>
			<input
				type="range"
				min="0"
				max={Math.max(0, orbit.length - 1)}
				step="1"
				bind:value={cursor}
				aria-label="Last displayed orbit point"
				aria-valuetext={`Iteration ${orbit[Math.min(cursor, Math.max(0, orbit.length - 1))]?.iteration ?? 0}`}
				disabled={orbit.length < 2}
			/>
		</label>
	</div>

	<div class="trace-grid">
		<figure>
			<figcaption>
				<b>|zₙ| {logarithmicMagnitude ? '· log₁₀ scale' : '· linear scale'}</b>
				<label>
					<input type="checkbox" bind:checked={logarithmicMagnitude} />
					Log scale
				</label>
			</figcaption>
			<svg viewBox="0 0 200 80" role="img" aria-label="Magnitude of each visible orbit value">
				<rect width="200" height="80" />
				<line x1="7" y1="73" x2="193" y2="73" class="axis" />
				{#if magnitudeTrace}<polyline points={magnitudeTrace} class="trace magnitude" />{/if}
			</svg>
		</figure>
		<figure>
			<figcaption><b>arg(zₙ) · −π to π</b><span>radians</span></figcaption>
			<svg viewBox="0 0 200 80" role="img" aria-label="Argument of each visible orbit value">
				<rect width="200" height="80" />
				<line x1="7" y1="40" x2="193" y2="40" class="axis" />
				{#if argumentTrace}<polyline points={argumentTrace} class="trace argument" />{/if}
			</svg>
		</figure>
		{#if newtonResult}
			<figure>
				<figcaption><b>Distance to nearest root · log₁₀</b><span>Euclidean</span></figcaption>
				<svg
					viewBox="0 0 200 80"
					role="img"
					aria-label="Logarithmic distance from each visible Newton iterate to its nearest known root"
				>
					<rect width="200" height="80" />
					<line x1="7" y1="73" x2="193" y2="73" class="axis" />
					{#if rootDistanceTrace}<polyline
							points={rootDistanceTrace}
							class="trace root-distance"
						/>{/if}
				</svg>
			</figure>
			<figure>
				<figcaption><b>|f′(zₙ)| · log₁₀</b><span>before next step</span></figcaption>
				<svg
					viewBox="0 0 200 80"
					role="img"
					aria-label="Logarithmic derivative magnitude calculated at each visible Newton iterate"
				>
					<rect width="200" height="80" />
					<line x1="7" y1="73" x2="193" y2="73" class="axis" />
					{#if derivativeTrace}<polyline points={derivativeTrace} class="trace derivative" />{/if}
				</svg>
			</figure>
		{/if}
	</div>

	<details>
		<summary>Orbit values as a table ({orbit.length} calculated)</summary>
		<div class="table-wrap">
			<table>
				<caption>{tableCaption}</caption>
				<thead>
					<tr>
						<th scope="col">n</th>
						<th scope="col">Re(zₙ)</th>
						<th scope="col">Im(zₙ)</th>
						<th scope="col">|zₙ|</th>
						<th scope="col">arg(zₙ)</th>
						{#if newtonResult}
							<th scope="col">|f′(zₙ)|</th>
							<th scope="col">Residual |f(zₙ)|</th>
							<th scope="col">Nearest root</th>
							<th scope="col">Root distance</th>
						{/if}
						<th scope="col">Status</th>
						{#if family === 'phoenix'}
							<th scope="col">Re(zₙ₋₁)</th>
							<th scope="col">Im(zₙ₋₁)</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each orbit.slice(0, 80) as point (point.iteration)}
						<tr>
							<th scope="row">{point.iteration}</th>
							<td class:exact-coordinate={point.valueDecimal}
								>{point.valueDecimal?.re ?? format(point.value.re)}</td
							>
							<td class:exact-coordinate={point.valueDecimal}
								>{point.valueDecimal?.im ?? format(point.value.im)}</td
							>
							<td>{format(Math.hypot(point.value.re, point.value.im))}</td>
							<td>{format(Math.atan2(point.value.im, point.value.re))}</td>
							{#if newtonResult}
								<td
									>{point.derivativeMagnitude === undefined
										? '—'
										: format(point.derivativeMagnitude)}</td
								>
								<td>{point.residual === undefined ? '—' : format(point.residual)}</td>
								<td
									>{point.nearestRootIndex === undefined
										? '—'
										: `Root ${point.nearestRootIndex + 1}`}</td
								>
								<td
									>{point.nearestRootDistance === undefined
										? '—'
										: format(point.nearestRootDistance)}</td
								>
							{/if}
							<td>
								{point.iteration === result?.iterations
									? result.status.replaceAll('-', ' ')
									: 'iterating'}
							</td>
							{#if family === 'phoenix'}
								<td>{point.previous ? format(point.previous.re) : '—'}</td>
								<td>{point.previous ? format(point.previous.im) : '—'}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
			{#if orbit.length > 80}<p>Table limited to the first 80 calculated values.</p>{/if}
		</div>
	</details>
</section>

<style>
	.orbit-inspector {
		border: 1px solid var(--atlas-rule, #353846);
		border-radius: 0.45rem;
		background: var(--atlas-panel, #11131b);
		padding: 0.85rem;
		color: var(--atlas-text, #f0ece3);
	}

	.inspector-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.7rem;
	}

	.inspector-heading p {
		margin: 0;
		color: var(--atlas-brass, #d1a65d);
		font: 700 0.62rem/1.2 var(--font-sans);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0.24rem 0 0;
		font: 750 1rem/1.2 var(--font-sans);
	}

	.inspector-heading > span {
		border: 1px solid var(--atlas-rule, #353846);
		border-radius: 999px;
		padding: 0.27rem 0.45rem;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.58rem/1.2 var(--font-mono);
	}

	.status {
		margin-top: 0.7rem;
		border-left: 3px solid var(--atlas-brass, #d1a65d);
		background: #0b0d14;
		padding: 0.55rem 0.65rem;
		font: 0.68rem/1.4 var(--font-mono);
	}

	.summary {
		display: grid;
		gap: 0.3rem;
		margin: 0.7rem 0;
		font: 0.62rem/1.35 var(--font-mono);
	}

	.summary div {
		display: grid;
		grid-template-columns: 6.4rem minmax(0, 1fr);
		gap: 0.4rem;
	}

	dt {
		color: var(--atlas-muted, #aaa6b5);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
		text-align: right;
	}

	.exact-coordinate {
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	svg {
		display: block;
		width: 100%;
		max-height: 15rem;
		border: 1px solid var(--atlas-rule, #353846);
		border-radius: 0.35rem;
		background: #070811;
	}

	svg rect {
		fill: #070811;
	}

	.axis {
		stroke: #4a4d5d;
		stroke-width: 0.8;
	}

	.bailout {
		fill: none;
		stroke: #665b7d;
		stroke-width: 0.7;
		stroke-dasharray: 3 2;
	}

	.unit-circle {
		fill: none;
		stroke: #6cc3d6;
		stroke-width: 0.65;
		stroke-dasharray: 1 2;
	}

	.circle-label {
		fill: #83cddd;
		font: 5.2px/1 var(--font-mono);
		paint-order: stroke;
		stroke: #070811;
		stroke-width: 2px;
		stroke-linejoin: round;
	}

	.circle-label.bailout-label {
		fill: #998daf;
	}

	.orbit-line {
		fill: none;
		stroke: #d4a95f;
		stroke-width: 1.25;
	}

	svg circle:not(.bailout):not(.unit-circle) {
		fill: #6cc3d6;
		stroke: #070811;
		stroke-width: 1;
	}

	svg circle.start {
		fill: #8bd6b5;
	}

	svg circle.end {
		fill: #ed765d;
	}

	svg .root-marker circle {
		fill: #070811;
		stroke: #8bd6b5;
		stroke-width: 1.4;
	}

	svg .root-marker line {
		stroke: #8bd6b5;
		stroke-width: 1.2;
	}

	svg .root-marker .root-label {
		fill: #d9f1e7;
		font: 700 7px/1 var(--font-mono);
		paint-order: stroke;
		stroke: #070811;
		stroke-width: 2px;
	}

	.plot-key {
		margin: 0.35rem 0 0;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.58rem/1.35 var(--font-sans);
	}

	.transport {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.35rem;
		margin-top: 0.5rem;
	}

	button {
		min-height: 2.75rem;
		border: 1px solid #5a5d6c;
		border-radius: 0.3rem;
		background: #171924;
		color: #eee9de;
		font: 650 0.62rem/1.2 var(--font-sans);
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	label {
		display: grid;
		gap: 0.25rem;
		margin-top: 0.55rem;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.62rem/1.2 var(--font-sans);
	}

	input {
		width: 100%;
		accent-color: #d4a95f;
	}

	.speed-field select {
		min-height: 2.75rem;
		border: 1px solid #5a5d6c;
		border-radius: 0.3rem;
		background: #0b0d14;
		padding: 0.42rem 0.5rem;
		color: #eee9de;
		font: 0.62rem/1.2 var(--font-mono);
	}

	.trace-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.7rem;
	}

	.trace-grid figure {
		min-width: 0;
		margin: 0;
	}

	.trace-grid figcaption {
		display: flex;
		min-height: 2.2rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.56rem/1.25 var(--font-sans);
	}

	.trace-grid figcaption b {
		color: #d8d0c0;
	}

	.trace-grid figcaption label {
		display: flex;
		align-items: center;
		gap: 0.28rem;
		margin: 0;
		white-space: nowrap;
	}

	.trace-grid figcaption input {
		width: auto;
	}

	.trace-grid svg {
		max-height: 7.5rem;
	}

	.trace {
		fill: none;
		stroke-width: 1.5;
	}

	.trace.magnitude {
		stroke: #d4a95f;
	}

	.trace.argument {
		stroke: #6cc3d6;
	}

	.trace.root-distance {
		stroke: #8bd6b5;
	}

	.trace.derivative {
		stroke: #ed765d;
	}

	details {
		margin-top: 0.65rem;
		border-top: 1px solid var(--atlas-rule, #353846);
		padding-top: 0.45rem;
	}

	summary {
		min-height: 2.5rem;
		font: 650 0.68rem/1.3 var(--font-sans);
		cursor: pointer;
	}

	.table-wrap {
		max-height: 16rem;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font: 0.58rem/1.35 var(--font-mono);
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
		border-bottom: 1px solid var(--atlas-rule, #353846);
		padding: 0.32rem 0.38rem;
		text-align: right;
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	.table-wrap p {
		color: var(--atlas-muted, #aaa6b5);
		font: 0.62rem/1.35 var(--font-sans);
	}

	@media (prefers-reduced-motion: reduce) {
		.transport button:nth-child(2) {
			display: none;
		}

		.transport {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (max-width: 36rem) {
		.trace-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
