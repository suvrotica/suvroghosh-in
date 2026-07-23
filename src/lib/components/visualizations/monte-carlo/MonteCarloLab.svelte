<script lang="ts">
	import { onMount } from 'svelte';
	import ConvergenceChart from './ConvergenceChart.svelte';
	import { MonteCarloRenderer } from '$lib/visualizations/monte-carlo/engine';
	import { MonteCarloExperiment } from '$lib/visualizations/monte-carlo/experiment';
	import { calculateStatistics } from '$lib/visualizations/monte-carlo/statistics';
	import type {
		ChartMode,
		ConvergenceObservation,
		ErrorDisplay,
		MonteCarloStatistics,
		SamplingMethod
	} from '$lib/visualizations/monte-carlo/types';
	import { TARGET_SAMPLE_OPTIONS } from '$lib/visualizations/monte-carlo/types';

	const methodDescriptions: Record<SamplingMethod, string> = {
		pseudorandom:
			'A seeded Mulberry32 generator produces independent-looking uniform samples. The sequence is pseudorandom and exactly reproducible.',
		stratified:
			'The square is divided into equal cells. One jittered sample visits each cell before the cycle repeats, deliberately spreading coverage.',
		halton:
			'A base-2/base-3 Halton sequence receives a reproducible seed-generated shift. It is randomized quasi-Monte Carlo: deterministic once the seed is fixed.'
	};

	let canvas = $state<HTMLCanvasElement>();
	let canvasHost: HTMLDivElement;
	let laboratory: HTMLElement;
	let renderer: MonteCarloRenderer | null = null;
	let experiment: MonteCarloExperiment | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;

	let seed = $state(20_260_721);
	let seedDraft = $state('20260721');
	let method = $state<SamplingMethod>('pseudorandom');
	let targetSamples = $state(100_000);
	let sampleRate = $state(10_000);
	let visiblePointCap = $state(320_000);
	let pointSize = $state(3.2);
	let pointOpacity = $state(0.68);
	let showOutside = $state(true);
	let showGrid = $state(true);
	let showCircle = $state(true);
	let showTrail = $state(true);
	let animationEnabled = $state(true);
	let confidenceEnabled = $state(true);
	let theoreticalGuide = $state(true);
	let chartMode = $state<ChartMode>('estimate');
	let errorDisplay = $state<ErrorDisplay>('absolute');
	let running = $state(false);
	let reducedMotion = $state(false);
	let webglAvailable = $state(true);
	let status = $state('Preparing the laboratory…');
	let contextMessage = $state('');
	let statistics = $state<MonteCarloStatistics>(calculateStatistics('pseudorandom', 0, 0, 0));
	let observations = $state<ConvergenceObservation[]>([]);
	let liveSummary = $state('No samples have been calculated yet.');

	let mounted = false;
	let visible = true;
	let pageVisible = true;
	let frameId = 0;
	let previousTimestamp = 0;
	let sampleCarry = 0;
	let pendingBatch = 0;
	let lastPublishedAt = 0;
	let lastAnnouncedAt = 0;
	let lastRenderedAt = 0;

	let progress = $derived(
		targetSamples > 0 ? Math.min(100, (statistics.totalSamples / targetSamples) * 100) : 0
	);
	let selectedErrorLabel = $derived(
		errorDisplay === 'absolute' ? 'Selected absolute error' : 'Selected percentage error'
	);
	let selectedErrorValue = $derived(
		errorDisplay === 'absolute'
			? formatError(statistics.absoluteError)
			: formatPercentage(statistics.percentageError)
	);
	let runState = $derived(
		statistics.totalSamples >= targetSamples
			? 'completed'
			: running
				? 'running'
				: statistics.totalSamples === 0
					? 'reset'
					: 'paused'
	);

	function rendererOptions() {
		return { pointSize, pointOpacity, showOutside, showGrid, showCircle };
	}

	function redraw() {
		if (!renderer) return;
		renderer.setOptions(rendererOptions());
		renderer.draw();
	}

	function formatEstimate(value: number | null) {
		return value === null ? '—' : value.toFixed(7);
	}

	function formatError(value: number | null) {
		if (value === null) return '—';
		if (value > 0 && value < 0.000_1) return value.toExponential(3);
		return value.toFixed(value < 0.01 ? 6 : 5);
	}

	function formatPercentage(value: number | null) {
		if (value === null) return '—';
		if (value > 0 && value < 0.001) return `${value.toExponential(2)}%`;
		return `${value.toFixed(value < 0.1 ? 4 : 3)}%`;
	}

	function formatInterval() {
		const interval = statistics.confidenceInterval;
		if (!interval) return 'Not yet available';
		return `${interval.lower.toFixed(6)} – ${interval.upper.toFixed(6)}`;
	}

	function publish(force = false, timestamp = performance.now()) {
		if (!experiment) return;
		if (!force && timestamp - lastPublishedAt < (animationEnabled ? 100 : 450)) return;
		statistics = experiment.statistics();
		observations = [...experiment.observations];
		lastPublishedAt = timestamp;

		if (force || timestamp - lastAnnouncedAt >= 1_500) {
			liveSummary =
				statistics.estimate === null
					? 'The experiment is reset with no calculated samples.'
					: `${runState}. ${statistics.totalSamples.toLocaleString('en-IN')} samples give a pi estimate of ${statistics.estimate.toFixed(7)}, with absolute error ${formatError(statistics.absoluteError)}.`;
			lastAnnouncedAt = timestamp;
		}
	}

	function cancelLoop() {
		if (frameId) cancelAnimationFrame(frameId);
		frameId = 0;
		previousTimestamp = 0;
	}

	function schedule() {
		if (!mounted || !visible || !pageVisible || frameId) return;
		if (!running && pendingBatch <= 0) return;
		frameId = requestAnimationFrame(frame);
	}

	function frame(timestamp: number) {
		frameId = 0;
		if (!experiment || !visible || !pageVisible) return;
		if (previousTimestamp === 0) previousTimestamp = timestamp;
		const elapsed = Math.min(0.25, Math.max(0, (timestamp - previousTimestamp) / 1_000));
		previousTimestamp = timestamp;

		let requested = 0;
		if (pendingBatch > 0) {
			requested = Math.min(2_048, pendingBatch);
			pendingBatch -= requested;
		} else if (running) {
			sampleCarry = Math.min(sampleRate * 0.25, sampleCarry + sampleRate * elapsed);
			requested = Math.min(8_192, Math.floor(sampleCarry));
			sampleCarry -= requested;
		}

		if (requested > 0) {
			const result = experiment.generate(requested);
			if (renderer && result.visibleEnd > result.visibleStart) {
				renderer.append(experiment.visiblePoints, result.visibleStart, result.visibleEnd);
			}

			const shouldRender =
				animationEnabled || timestamp - lastRenderedAt >= 500 || result.completed;
			if (shouldRender) {
				redraw();
				lastRenderedAt = timestamp;
			}
			publish(result.completed, timestamp);

			if (result.completed) {
				running = false;
				pendingBatch = 0;
				status = `Completed ${targetSamples.toLocaleString('en-IN')} samples.`;
				publish(true, timestamp);
			}
		}

		if (running || pendingBatch > 0) schedule();
	}

	function resetExperiment(message: string) {
		cancelLoop();
		experiment = new MonteCarloExperiment({
			seed,
			method,
			targetSamples,
			visiblePointCap
		});
		renderer?.replace(experiment.visiblePoints, 0);
		sampleCarry = 0;
		pendingBatch = 0;
		lastPublishedAt = 0;
		lastAnnouncedAt = 0;
		lastRenderedAt = 0;
		statistics = experiment.statistics();
		observations = [];
		status = message;
		redraw();
		publish(true);
		if (running) schedule();
	}

	function toggleRun() {
		if (statistics.totalSamples >= targetSamples) return;
		running = !running;
		status = running ? 'Sampling is running.' : 'Sampling paused.';
		if (running) schedule();
		else cancelLoop();
		publish(true);
	}

	function addBatch() {
		if (!experiment || experiment.completed) return;
		running = false;
		pendingBatch += Math.min(500, targetSamples - experiment.totalSamples);
		status = 'Calculating one batch of up to 500 samples.';
		schedule();
	}

	function applySeed() {
		const parsed = Number(seedDraft);
		seed = Number.isFinite(parsed) ? Math.max(0, Math.min(4_294_967_295, Math.floor(parsed))) : 0;
		seedDraft = String(seed);
		resetExperiment(`Seed ${seed.toLocaleString('en-IN')} applied; previous samples were cleared.`);
	}

	function newSeed() {
		const values = new Uint32Array(1);
		crypto.getRandomValues(values);
		seed = values[0];
		seedDraft = String(seed);
		resetExperiment(`New pseudorandom seed ${seed.toLocaleString('en-IN')} applied.`);
	}

	function changeMethod(nextMethod: SamplingMethod) {
		if (method === nextMethod) return;
		method = nextMethod;
		resetExperiment(`${methodLabel(method)} selected; incompatible samples were cleared.`);
	}

	function changeTarget(nextTarget: number) {
		if (targetSamples === nextTarget) return;
		targetSamples = nextTarget;
		resetExperiment(
			`Target changed to ${targetSamples.toLocaleString('en-IN')}; the experiment was reset.`
		);
	}

	function methodLabel(value: SamplingMethod) {
		if (value === 'pseudorandom') return 'Pseudorandom sampling';
		if (value === 'stratified') return 'Stratified sampling';
		return 'Shifted Halton sequence';
	}

	function updateVisualSetting(callback: () => void) {
		callback();
		redraw();
	}

	onMount(() => {
		mounted = true;
		const query = new URLSearchParams(window.location.search);
		reducedMotion =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			query.get('motion') === 'reduce';
		animationEnabled = !reducedMotion;
		running = !reducedMotion;
		visiblePointCap = window.matchMedia('(max-width: 48rem)').matches ? 140_000 : 320_000;
		pageVisible = !document.hidden;

		if (query.get('webgl') === 'off') {
			webglAvailable = false;
			contextMessage =
				'WebGL2 rendering is disabled. The reproducible CPU calculation remains available.';
		} else {
			try {
				renderer = new MonteCarloRenderer(canvas!, visiblePointCap, {
					onContextLost: () => {
						contextMessage = 'The WebGL context was lost. Calculation is paused until it returns.';
						running = false;
						cancelLoop();
					},
					onContextRestored: () => {
						if (renderer && experiment) {
							renderer.replace(experiment.visiblePoints, experiment.displayedSamples);
							redraw();
						}
						contextMessage =
							'WebGL2 was restored. The retained sample field has been uploaded again.';
					}
				});
			} catch (error) {
				webglAvailable = false;
				contextMessage =
					error instanceof Error
						? `${error.message} The reproducible CPU calculation remains available.`
						: 'WebGL2 is unavailable. The reproducible CPU calculation remains available.';
			}
		}

		resetExperiment(
			reducedMotion
				? 'Reset and paused because reduced motion is requested.'
				: webglAvailable
					? 'Sampling is running.'
					: 'CPU sampling is running with a static visual fallback.'
		);

		resizeObserver = new ResizeObserver(() => {
			if (!renderer || !canvasHost) return;
			const bounds = canvasHost.getBoundingClientRect();
			const ratio = Math.min(
				2,
				window.devicePixelRatio || 1,
				window.matchMedia('(max-width: 48rem)').matches ? 1.5 : 2
			);
			renderer.resize(bounds.width, bounds.height, ratio);
		});
		resizeObserver.observe(canvasHost);

		intersectionObserver = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				if (visible) schedule();
				else cancelLoop();
			},
			{ rootMargin: '160px' }
		);
		intersectionObserver.observe(laboratory);

		const handleVisibility = () => {
			pageVisible = !document.hidden;
			if (pageVisible) schedule();
			else cancelLoop();
		};
		document.addEventListener('visibilitychange', handleVisibility);
		schedule();

		return () => {
			mounted = false;
			cancelLoop();
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			renderer?.destroy();
			renderer = null;
			experiment = null;
		};
	});
</script>

<section
	bind:this={laboratory}
	class="monte-carlo-lab article-breakout not-prose relative my-10 w-[min(80rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-950 text-neutral-100 shadow-2xl shadow-black/30"
	aria-labelledby="monte-carlo-lab-heading"
>
	<header class="lab-header">
		<div>
			<p class="lab-kicker">Scientific instrument · GPU field / CPU statistics</p>
			<h2 id="monte-carlo-lab-heading">Monte Carlo π laboratory</h2>
			<p class="lab-subtitle">Uniform samples in [−1, 1]² estimate a known area ratio.</p>
		</div>
		<div class="toolbar" aria-label="Experiment actions">
			<button
				type="button"
				class="toolbar-button primary"
				onclick={toggleRun}
				disabled={statistics.totalSamples >= targetSamples}
			>
				{running ? 'Pause' : 'Run'}
			</button>
			<button
				type="button"
				class="toolbar-button"
				onclick={addBatch}
				disabled={statistics.totalSamples >= targetSamples}
			>
				Add 500
			</button>
			<button
				type="button"
				class="toolbar-button"
				onclick={() => resetExperiment('Reset with the current settings.')}
			>
				Reset
			</button>
		</div>
	</header>

	<div class="status-row">
		<span class={`status-badge ${runState}`}><i></i>{runState}</span>
		<p>{status}</p>
		<p class="selected-error"><span>{selectedErrorLabel}:</span> {selectedErrorValue}</p>
	</div>

	{#if contextMessage}
		<p class="context-message" role="status">{contextMessage}</p>
	{/if}

	<div class="laboratory-grid">
		<div class="field-column">
			<figure class="sample-figure">
				<div bind:this={canvasHost} class="canvas-host">
					{#if webglAvailable}
						<canvas
							bind:this={canvas}
							aria-label="A square coordinate field containing a unit circle. Circular teal samples are inside the circle; dim coral diamond samples are outside."
						>
							The interactive field requires WebGL2. The statistics and data table remain available.
						</canvas>
					{:else}
						<img
							src="/images/monte-carlo-laboratory.svg"
							alt="Static Monte Carlo field showing a circle inside a square with classified sample points"
						/>
					{/if}
					<span class="coordinate top">y = 1</span>
					<span class="coordinate bottom">y = −1</span>
					<span class="coordinate left">−1</span>
					<span class="coordinate right">1</span>
					<div class="field-legend" role="list" aria-label="Sample classification legend">
						<span role="listitem"><i class="inside-symbol"></i>inside: circle</span>
						<span role="listitem"><i class="outside-symbol"></i>outside: diamond</span>
					</div>
				</div>
				<figcaption>
					<span>{statistics.totalSamples.toLocaleString('en-IN')} calculated</span>
					<span>{statistics.displayedSamples.toLocaleString('en-IN')} displayed</span>
					<span>{methodLabel(method)}</span>
				</figcaption>
			</figure>

			<div class="progress-block">
				<div><span>Sample budget</span><output>{progress.toFixed(1)}%</output></div>
				<progress max="100" value={progress}>{progress.toFixed(1)}%</progress>
			</div>

			<section class="metrics" aria-labelledby="live-statistics-heading">
				<h3 id="live-statistics-heading" class="sr-only">Live statistics</h3>
				<div class="metric featured">
					<span>Current π̂</span><strong>{formatEstimate(statistics.estimate)}</strong>
				</div>
				<div class="metric"><span>Actual π</span><strong>{Math.PI.toFixed(7)}</strong></div>
				<div class="metric">
					<span>Total samples</span><strong
						>{statistics.totalSamples.toLocaleString('en-IN')}</strong
					>
				</div>
				<div class="metric">
					<span>Inside circle</span><strong
						>{statistics.insideSamples.toLocaleString('en-IN')}</strong
					>
				</div>
				<div class="metric">
					<span>Absolute error</span><strong>{formatError(statistics.absoluteError)}</strong>
				</div>
				<div class="metric">
					<span>Percentage error</span><strong
						>{formatPercentage(statistics.percentageError)}</strong
					>
				</div>
				{#if method === 'pseudorandom'}
					<div class="metric">
						<span>Approx. IID standard error</span><strong
							>{formatError(statistics.standardError)}</strong
						>
					</div>
				{:else}
					<div class="metric">
						<span>IID reference SE · not method uncertainty</span><strong
							>{formatError(statistics.iidReferenceStandardError)}</strong
						>
					</div>
				{/if}
				{#if confidenceEnabled && method === 'pseudorandom'}
					<div class="metric interval">
						<span>Approx. IID 95% confidence interval</span><strong>{formatInterval()}</strong>
					</div>
				{/if}
			</section>
			{#if method !== 'pseudorandom'}
				<p class="confidence-note">
					{methodLabel(method)} does not produce independent Bernoulli trials. The IID reference above
					is a comparison scale, not a standard error or confidence interval for this method. Replicated
					designs are required to estimate its uncertainty.
				</p>
			{:else if confidenceEnabled && statistics.totalSamples > 0 && !statistics.confidenceInterval}
				<p class="confidence-note">
					The normal-approximation interval appears after 30 samples; before that it can be
					misleading.
				</p>
			{/if}
		</div>

		<aside class="controls" aria-labelledby="controls-heading">
			<div class="controls-heading">
				<div>
					<p>Instrument panel</p>
					<h3 id="controls-heading">Experiment controls</h3>
				</div>
				<span>seeded</span>
			</div>

			<fieldset>
				<legend>Sampling</legend>
				<label for="sampling-method">Method</label>
				<select
					id="sampling-method"
					value={method}
					onchange={(event) => changeMethod(event.currentTarget.value as SamplingMethod)}
				>
					<option value="pseudorandom">Pseudorandom</option>
					<option value="stratified">Stratified</option>
					<option value="halton">Halton (quasi-Monte Carlo)</option>
				</select>
				<p class="control-help">{methodDescriptions[method]}</p>

				<label for="seed">Numerical seed</label>
				<div class="seed-row">
					<input id="seed" type="number" min="0" max="4294967295" step="1" bind:value={seedDraft} />
					<button type="button" onclick={applySeed}>Apply</button>
				</div>
				<button type="button" class="wide-button" onclick={newSeed}>New random seed</button>
				<p class="control-help">
					Applying a seed explicitly resets the experiment. The resulting sample stream is
					pseudorandom, not physical randomness.
				</p>

				<label for="target-samples">Target sample count</label>
				<select
					id="target-samples"
					value={targetSamples}
					onchange={(event) => changeTarget(Number(event.currentTarget.value))}
				>
					{#each TARGET_SAMPLE_OPTIONS as option (option)}
						<option value={option}>{option.toLocaleString('en-IN')}</option>
					{/each}
				</select>

				<div class="range-heading">
					<label for="sample-rate">Sample rate</label><output for="sample-rate"
						>{sampleRate.toLocaleString('en-IN')}/s</output
					>
				</div>
				<input
					id="sample-rate"
					type="range"
					min="1000"
					max="50000"
					step="1000"
					bind:value={sampleRate}
				/>
			</fieldset>

			<fieldset>
				<legend>Visual field</legend>
				<div class="range-heading">
					<label for="point-size">Point size</label><output for="point-size"
						>{pointSize.toFixed(1)} px</output
					>
				</div>
				<input
					id="point-size"
					type="range"
					min="1.5"
					max="7"
					step="0.1"
					value={pointSize}
					oninput={(event) =>
						updateVisualSetting(() => (pointSize = Number(event.currentTarget.value)))}
				/>
				<div class="range-heading">
					<label for="point-opacity">Point opacity</label><output for="point-opacity"
						>{Math.round(pointOpacity * 100)}%</output
					>
				</div>
				<input
					id="point-opacity"
					type="range"
					min="0.15"
					max="1"
					step="0.05"
					value={pointOpacity}
					oninput={(event) =>
						updateVisualSetting(() => (pointOpacity = Number(event.currentTarget.value)))}
				/>

				<label class="check-row"
					><input
						type="checkbox"
						checked={showOutside}
						onchange={(event) =>
							updateVisualSetting(() => (showOutside = event.currentTarget.checked))}
					/><span>Show outside samples</span></label
				>
				<label class="check-row"
					><input
						type="checkbox"
						checked={showGrid}
						onchange={(event) =>
							updateVisualSetting(() => (showGrid = event.currentTarget.checked))}
					/><span>Show Cartesian grid</span></label
				>
				<label class="check-row"
					><input
						type="checkbox"
						checked={showCircle}
						onchange={(event) =>
							updateVisualSetting(() => (showCircle = event.currentTarget.checked))}
					/><span>Show circle boundary</span></label
				>
				<label class="check-row"
					><input type="checkbox" bind:checked={showTrail} /><span>Show convergence trail</span
					></label
				>
				<label class="check-row"
					><input type="checkbox" bind:checked={animationEnabled} /><span
						>Animate progressive updates</span
					></label
				>
				{#if reducedMotion}<p class="control-help">
						Your device requested reduced motion, so progressive animation began off and the
						experiment began paused.
					</p>{/if}
			</fieldset>

			<fieldset>
				<legend>Statistics</legend>
				<label for="error-display">Headline error</label>
				<select id="error-display" bind:value={errorDisplay}>
					<option value="absolute">Absolute error</option>
					<option value="percentage">Percentage error</option>
				</select>
				<label for="chart-mode">Convergence chart</label>
				<select id="chart-mode" bind:value={chartMode}>
					<option value="estimate">π estimate</option>
					<option value="error">Absolute error (log scale)</option>
				</select>
				<label class="check-row"
					><input
						type="checkbox"
						bind:checked={confidenceEnabled}
						disabled={method !== 'pseudorandom'}
					/><span>Show IID 95% confidence interval (pseudorandom only)</span></label
				>
				<label class="check-row"
					><input
						type="checkbox"
						bind:checked={theoreticalGuide}
						disabled={method !== 'pseudorandom'}
					/><span>Show IID 1/√N guide (pseudorandom only)</span></label
				>
			</fieldset>
		</aside>
	</div>

	<ConvergenceChart
		{observations}
		mode={chartMode}
		{targetSamples}
		{showTrail}
		showGuide={theoreticalGuide && method === 'pseudorandom'}
	/>

	<footer>
		<p>
			π̂ = 4 × inside / total. The estimate is calculated from coordinates, never from rendered
			pixels.
		</p>
		<p>
			Visible-point cap: {visiblePointCap.toLocaleString('en-IN')}. Counts continue to the full
			target after the field reaches that cap.
		</p>
	</footer>

	<p class="sr-only" aria-live="polite" aria-atomic="true">{liveSummary}</p>
</section>

<style>
	.monte-carlo-lab {
		color-scheme: dark;
		font-variant-numeric: tabular-nums;
	}

	.lab-header {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		border-bottom: 1px solid #404040;
		padding: 1rem;
		background: #0a0a0a;
	}

	.lab-kicker,
	.lab-subtitle,
	.status-row p,
	.context-message,
	footer p {
		margin: 0;
	}

	.lab-kicker {
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #5eead4;
	}

	.lab-header h2 {
		margin: 0.25rem 0 0.2rem;
		font-size: clamp(1.25rem, 3vw, 1.75rem);
		color: #fff;
	}

	.lab-subtitle {
		font-size: 0.82rem;
		color: #a3a3a3;
	}

	.toolbar {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
	}

	button,
	select,
	input {
		font: inherit;
	}

	.toolbar-button,
	.controls button {
		min-height: 2.75rem;
		border: 1px solid #525252;
		border-radius: 0.5rem;
		background: #171717;
		padding: 0.55rem 0.75rem;
		font-size: 0.76rem;
		font-weight: 800;
		color: #f5f5f5;
		cursor: pointer;
	}

	.toolbar-button:hover,
	.controls button:hover {
		border-color: #a3a3a3;
		background: #262626;
	}

	.toolbar-button.primary {
		border-color: #5eead4;
		background: #99f6e4;
		color: #042f2e;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}

	.status-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.65rem 1rem;
		border-bottom: 1px solid #262626;
		padding: 0.65rem 1rem;
		background: #171717;
		font-size: 0.72rem;
		color: #d4d4d4;
	}

	.status-row > p:not(.selected-error) {
		flex: 1 1 18rem;
	}

	.selected-error span {
		color: #a3a3a3;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.status-badge i {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: #a3a3a3;
	}

	.status-badge.running i {
		background: #5eead4;
		box-shadow: 0 0 0 3px rgb(94 234 212 / 18%);
	}

	.status-badge.completed i {
		background: #fbbf24;
	}

	.context-message {
		border-bottom: 1px solid #713f12;
		background: #422006;
		padding: 0.75rem 1rem;
		font-size: 0.76rem;
		color: #fde68a;
	}

	.laboratory-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}

	.field-column {
		min-width: 0;
		padding: 0.75rem;
	}

	.sample-figure {
		margin: 0;
	}

	.canvas-host {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		overflow: hidden;
		border: 1px solid #525252;
		border-radius: 0.75rem;
		background: #07101d;
	}

	.canvas-host canvas,
	.canvas-host > img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.coordinate {
		position: absolute;
		z-index: 2;
		border-radius: 0.2rem;
		background: rgb(0 0 0 / 68%);
		padding: 0.12rem 0.28rem;
		font-family: ui-monospace, monospace;
		font-size: 0.58rem;
		color: #d4d4d4;
		pointer-events: none;
	}

	.coordinate.top {
		top: 0.35rem;
		left: 50%;
		transform: translateX(-50%);
	}

	.coordinate.bottom {
		bottom: 2.35rem;
		left: 50%;
		transform: translateX(-50%);
	}

	.coordinate.left {
		top: 50%;
		left: 0.35rem;
	}

	.coordinate.right {
		top: 50%;
		right: 0.35rem;
	}

	.field-legend {
		position: absolute;
		right: 0.45rem;
		bottom: 0.45rem;
		left: 0.45rem;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem 0.9rem;
		border: 1px solid rgb(115 115 115 / 58%);
		border-radius: 0.45rem;
		background: rgb(0 0 0 / 76%);
		padding: 0.4rem 0.55rem;
		font-size: 0.61rem;
		color: #e5e5e5;
		backdrop-filter: blur(5px);
	}

	.field-legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.inside-symbol,
	.outside-symbol {
		display: inline-block;
		width: 0.55rem;
		height: 0.55rem;
		background: #5eead4;
	}

	.inside-symbol {
		border-radius: 999px;
	}

	.outside-symbol {
		transform: rotate(45deg) scale(0.76);
		background: #fb9279;
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.3rem 0.8rem;
		padding: 0.55rem 0.15rem 0;
		font-family: ui-monospace, monospace;
		font-size: 0.65rem;
		color: #a3a3a3;
	}

	.progress-block {
		margin-top: 0.55rem;
	}

	.progress-block div {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.3rem;
		font-size: 0.66rem;
		font-weight: 700;
		color: #d4d4d4;
	}

	progress {
		display: block;
		width: 100%;
		height: 0.4rem;
		accent-color: #5eead4;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.75rem;
	}

	.metric {
		min-width: 0;
		border: 1px solid #404040;
		border-radius: 0.55rem;
		background: #171717;
		padding: 0.58rem;
	}

	.metric.featured {
		border-color: #2dd4bf;
		background: #0f2928;
	}

	.metric.interval {
		grid-column: 1 / -1;
	}

	.metric span {
		display: block;
		margin-bottom: 0.25rem;
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #a3a3a3;
	}

	.metric strong {
		display: block;
		overflow-wrap: anywhere;
		font-family: ui-monospace, monospace;
		font-size: clamp(0.72rem, 2.5vw, 0.96rem);
		font-weight: 700;
		color: #f5f5f5;
	}

	.metric.featured strong {
		color: #99f6e4;
	}

	.confidence-note {
		margin: 0.55rem 0 0;
		font-size: 0.68rem;
		line-height: 1.45;
		color: #a3a3a3;
	}

	.controls {
		min-width: 0;
		border-top: 1px solid #404040;
		background: #101010;
		padding: 0.9rem;
	}

	.controls-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.8rem;
	}

	.controls-heading p {
		margin: 0;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: #5eead4;
	}

	.controls-heading h3 {
		margin: 0.18rem 0 0;
		font-size: 1rem;
		color: #fff;
	}

	.controls-heading > span {
		border: 1px solid #525252;
		border-radius: 999px;
		padding: 0.28rem 0.5rem;
		font-family: ui-monospace, monospace;
		font-size: 0.6rem;
		color: #d4d4d4;
	}

	fieldset {
		margin: 0 0 0.85rem;
		border: 1px solid #404040;
		border-radius: 0.65rem;
		padding: 0.75rem;
	}

	fieldset:last-child {
		margin-bottom: 0;
	}

	legend {
		padding: 0 0.35rem;
		font-size: 0.66rem;
		font-weight: 800;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: #d4d4d4;
	}

	.controls label:not(.check-row),
	.range-heading label {
		display: block;
		margin: 0.65rem 0 0.32rem;
		font-size: 0.7rem;
		font-weight: 800;
		color: #e5e5e5;
	}

	.controls select,
	.controls input[type='number'] {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid #525252;
		border-radius: 0.45rem;
		background: #171717;
		padding: 0.5rem 0.6rem;
		font-size: 0.75rem;
		color: #f5f5f5;
	}

	.controls input[type='range'] {
		width: 100%;
		min-height: 2.4rem;
		accent-color: #5eead4;
	}

	.seed-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
	}

	.seed-row button {
		min-width: 4.5rem;
	}

	.wide-button {
		width: 100%;
		margin-top: 0.45rem;
	}

	.control-help {
		margin: 0.4rem 0 0;
		font-size: 0.65rem;
		line-height: 1.45;
		color: #a3a3a3;
	}

	.range-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.8rem;
	}

	.range-heading output {
		font-family: ui-monospace, monospace;
		font-size: 0.65rem;
		color: #99f6e4;
	}

	.check-row {
		display: grid;
		grid-template-columns: 1.15rem minmax(0, 1fr);
		align-items: center;
		gap: 0.55rem;
		min-height: 2.75rem;
		font-size: 0.7rem;
		font-weight: 700;
		color: #e5e5e5;
	}

	.check-row input {
		width: 1rem;
		height: 1rem;
		accent-color: #5eead4;
	}

	footer {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border-top: 1px solid #404040;
		padding: 0.75rem 1rem;
		font-size: 0.66rem;
		line-height: 1.45;
		color: #a3a3a3;
	}

	@media (min-width: 640px) {
		.lab-header {
			padding: 1.1rem 1.25rem;
		}

		.field-column {
			padding: 1rem;
		}

		.metrics {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.metric.interval {
			grid-column: span 2;
		}

		.controls {
			padding: 1rem;
		}
	}

	@media (min-width: 900px) {
		.lab-header {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}

		.toolbar {
			min-width: 18rem;
		}

		.laboratory-grid {
			grid-template-columns: minmax(0, 1fr) minmax(19rem, 22rem);
		}

		.controls {
			border-top: 0;
			border-left: 1px solid #404040;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		*,
		*::before,
		*::after {
			scroll-behavior: auto !important;
			transition: none !important;
			animation: none !important;
		}
	}
</style>
