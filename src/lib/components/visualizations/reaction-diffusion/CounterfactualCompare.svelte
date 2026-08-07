<script lang="ts">
	import { onMount } from 'svelte';
	import ReactionDiffusionField from './ReactionDiffusionField.svelte';
	import { ReactionDiffusionCpuEngine } from '$lib/visualizations/reaction-diffusion/engine';
	import { scheduleFixedWork } from '$lib/visualizations/reaction-diffusion/fixed-work-scheduler';
	import { calculateFieldMetrics } from '$lib/visualizations/reaction-diffusion/metrics';
	import type {
		BoundaryCondition,
		BrushTarget,
		FieldState,
		GrayScottSetup,
		InitialConditionRecipe,
		Intervention
	} from '$lib/visualizations/reaction-diffusion/types';
	import type { SpectrumWorkerClient } from '$lib/visualizations/reaction-diffusion/workers/spectrum-client';
	import type { SpectrumWorkerResponse } from '$lib/visualizations/reaction-diffusion/workers/spectrum-protocol';
	import type { MorphospaceSelection } from './MorphospaceAtlas.svelte';

	type ComparisonKind =
		| 'feed'
		| 'kill'
		| 'diffusion'
		| 'boundary'
		| 'initial'
		| 'timestep'
		| 'atlas';
	type DifferenceView = 'signed' | 'absolute';
	type DifferenceSample = { time: number; l2: number; meanAbsolute: number };
	type DifferenceMetrics = {
		l2: number;
		meanAbsolute: number;
		meanV: number;
		varianceV: number;
		wavelength: number | null;
	};
	type ClockSnapshot = {
		modelTime: number;
		stepA: number;
		stepB: number;
	};
	type PendingSpectrumComparison = {
		step: number;
		phase: 'a' | 'b';
		fieldB: Float64Array;
		maskB: Uint8Array;
		setupB: GrayScottSetup;
		wavelengthA: number | null;
	};
	type Props = { baseSetup: GrayScottSetup };

	let { baseSetup }: Props = $props();
	let kind = $state<ComparisonKind>('feed');
	let target = $state<BrushTarget>('both');
	let differenceView = $state<DifferenceView>('signed');
	let running = $state(false);
	let engineA = $state.raw<ReactionDiffusionCpuEngine | null>(null);
	let engineB = $state.raw<ReactionDiffusionCpuEngine | null>(null);
	let fieldA = $state<FieldState | null>(null);
	let fieldB = $state<FieldState | null>(null);
	let revision = $state(0);
	let candidateFeed = $state(0);
	let candidateKill = $state(0);
	let selectedPoint = $state<readonly [number, number]>([0.5, 0.5]);
	let status = $state('A and B are ready at the same initial model time.');
	let animationFrame = 0;
	let lastFrameAt = 0;
	let scheduledQuantumCarry = 0;
	let disposed = false;
	let sequence = 0;
	let history = $state<DifferenceSample[]>([]);
	let metrics = $state<DifferenceMetrics | null>(null);
	let setupSignature = '';
	let root = $state<HTMLElement>();
	let intersectionObserver: IntersectionObserver | null = null;
	let offscreen = false;
	let spectrumWorker: SpectrumWorkerClient | null = null;
	let unsubscribeSpectrumWorker: (() => void) | null = null;
	let pendingSpectrum: PendingSpectrumComparison | null = null;
	let spectrumBusy = false;
	let nextSpectrumStep = 80;
	let wavelengthDifference: number | null = null;
	let clock = $state<ClockSnapshot>({ modelTime: 0, stepA: 0, stepB: 0 });

	let setupB = $derived(buildSetupB());
	let graphMaximum = $derived(Math.max(...history.map((entry) => entry.l2), 1e-12));
	let graphPoints = $derived(
		history.length < 2
			? ''
			: history
					.map(
						(sample, index) =>
							`${18 + (index / (history.length - 1)) * 98},${40 - (sample.l2 / graphMaximum) * 34}`
					)
					.join(' ')
	);

	$effect(() => {
		const signature = currentSetupSignature();
		if (!engineA || signature === setupSignature) return;
		reset();
	});

	$effect(() => {
		if (running) startLoop();
		else stopLoop();
	});

	onMount(() => {
		disposed = false;
		candidateFeed = baseSetup.feed + 0.001;
		candidateKill = baseSetup.kill;
		document.addEventListener('visibilitychange', handleVisibilityChange);
		if (typeof IntersectionObserver !== 'undefined') {
			intersectionObserver = new IntersectionObserver(
				(entries) => {
					offscreen = !entries.some((entry) => entry.isIntersecting);
					if (offscreen) stopLoop();
					else if (running && !document.hidden) startLoop();
				},
				{ rootMargin: '160px 0px', threshold: 0.01 }
			);
			if (root) intersectionObserver.observe(root);
		}
		void import('$lib/visualizations/reaction-diffusion/workers/spectrum-client')
			.then((module) => {
				if (disposed) return;
				spectrumWorker = module.createSpectrumWorkerClient();
				unsubscribeSpectrumWorker = spectrumWorker.subscribe(handleSpectrumWorkerResponse);
			})
			.catch((error) => {
				if (disposed) return;
				status = `Field comparison remains available, but wavelength comparison is unavailable: ${error instanceof Error ? error.message : 'the spectrum Worker could not start'}`;
			});
		reset();
		return () => {
			disposed = true;
			stopLoop();
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			intersectionObserver?.disconnect();
			intersectionObserver = null;
			unsubscribeSpectrumWorker?.();
			unsubscribeSpectrumWorker = null;
			spectrumWorker?.dispose();
			spectrumWorker = null;
			pendingSpectrum = null;
			spectrumBusy = false;
			engineA = null;
			engineB = null;
		};
	});

	function reducedSetup(source: GrayScottSetup): GrayScottSetup {
		return { ...source, gridSize: 64, domainWidth: 64, integrator: 'heun' };
	}

	function buildSetupB(): GrayScottSetup {
		const source = reducedSetup(baseSetup);
		if (kind === 'feed') return { ...source, feed: Math.min(0.2, source.feed + 0.001) };
		if (kind === 'kill') return { ...source, kill: Math.min(0.2, source.kill + 0.001) };
		if (kind === 'diffusion') return { ...source, diffusionV: source.diffusionV / 2 };
		if (kind === 'boundary') {
			const boundary: BoundaryCondition = source.boundary === 'periodic' ? 'no-flux' : 'periodic';
			return { ...source, boundary };
		}
		if (kind === 'initial') {
			const initialCondition: InitialConditionRecipe =
				source.initialCondition === 'ring' ? 'central-soft-disk' : 'ring';
			return { ...source, initialCondition };
		}
		if (kind === 'timestep') return { ...source, timestep: source.timestep / 2 };
		return { ...source, feed: candidateFeed, kill: candidateKill };
	}

	function currentSetupSignature() {
		return JSON.stringify([baseSetup, kind, candidateFeed, candidateKill]);
	}

	function reset() {
		stopLoop();
		cancelPendingSpectrum();
		setupSignature = currentSetupSignature();
		const a = reducedSetup(baseSetup);
		const b = buildSetupB();
		engineA = new ReactionDiffusionCpuEngine(a);
		engineB = new ReactionDiffusionCpuEngine(b);
		fieldA = engineA.state as FieldState;
		fieldB = engineB.state as FieldState;
		publishClock();
		revision += 1;
		history = [];
		sequence = 0;
		nextSpectrumStep = 80;
		wavelengthDifference = null;
		measure();
		status =
			kind === 'initial'
				? 'Only the initial disturbance differs; the exception is explicit.'
				: 'A and B share the same seeded initial field and exact model time.';
		if (running) startLoop();
	}

	function stepsForEqualTime() {
		if (!engineA || !engineB) return [1, 1] as const;
		const dtA = engineA.setup.timestep;
		const dtB = engineB.setup.timestep;
		const quantum = Math.max(dtA, dtB);
		return [Math.round(quantum / dtA), Math.round(quantum / dtB)] as const;
	}

	function publishClock() {
		clock = {
			modelTime: engineA?.modelTime ?? 0,
			stepA: engineA?.stepIndex ?? 0,
			stepB: engineB?.stepIndex ?? 0
		};
	}

	function advance(quanta = 1) {
		if (!engineA || !engineB) return;
		try {
			const [aSteps, bSteps] = stepsForEqualTime();
			for (let index = 0; index < quanta; index += 1) {
				engineA.step(aSteps);
				engineB.step(bSteps);
			}
			if (Math.abs(engineA.modelTime - engineB.modelTime) > 1e-10) {
				throw new Error('The synchronized clocks no longer agree.');
			}
			publishClock();
			fieldA = engineA.state as FieldState;
			fieldB = engineB.state as FieldState;
			revision += 1;
			measure();
		} catch (error) {
			running = false;
			status = `Comparison stopped without clamping: ${error instanceof Error ? error.message : 'numerical failure'}`;
		}
	}

	function startLoop() {
		if (animationFrame || disposed || offscreen || document.hidden || !running) return;
		scheduledQuantumCarry = 0;
		lastFrameAt = performance.now();
		animationFrame = requestAnimationFrame(loop);
	}

	function stopLoop() {
		if (animationFrame) cancelAnimationFrame(animationFrame);
		animationFrame = 0;
	}

	function loop(now: number) {
		animationFrame = 0;
		if (!running || disposed || document.hidden || offscreen) return;
		const elapsed = Math.min(0.1, Math.max(0, (now - lastFrameAt) / 1000));
		lastFrameAt = now;
		const scheduled = scheduleFixedWork(scheduledQuantumCarry, elapsed, 120, 8, 16);
		scheduledQuantumCarry = scheduled.carry;
		if (scheduled.work > 0) advance(scheduled.work);
		animationFrame = requestAnimationFrame(loop);
	}

	function handleVisibilityChange() {
		if (document.hidden) stopLoop();
		else if (running && !offscreen) startLoop();
	}

	function measure() {
		if (!fieldA || !fieldB) return;
		let squared = 0;
		let absolute = 0;
		let count = 0;
		for (let index = 0; index < fieldA.v.length; index += 1) {
			if (!fieldA.mask[index] || !fieldB.mask[index]) continue;
			const delta = fieldB.v[index] - fieldA.v[index];
			squared += delta * delta;
			absolute += Math.abs(delta);
			count += 1;
		}
		const aMetrics = calculateFieldMetrics(fieldA);
		const bMetrics = calculateFieldMetrics(fieldB);
		metrics = {
			l2: Math.sqrt(squared / Math.max(1, count)),
			meanAbsolute: absolute / Math.max(1, count),
			meanV: bMetrics.meanV - aMetrics.meanV,
			varianceV: bMetrics.varianceV - aMetrics.varianceV,
			wavelength: wavelengthDifference
		};
		if (history.length === 0 || (engineA?.stepIndex ?? 0) % 10 === 0) {
			history = [
				...history.slice(-79),
				{ time: clock.modelTime, l2: metrics.l2, meanAbsolute: metrics.meanAbsolute }
			];
		}
		requestSpectrumIfDue();
	}

	function requestSpectrumIfDue() {
		if (!spectrumWorker || spectrumBusy || !fieldA || !fieldB || !engineA || !engineB) return;
		const step = engineA.stepIndex;
		if (step < nextSpectrumStep) return;
		nextSpectrumStep = (Math.floor(step / 80) + 1) * 80;
		pendingSpectrum = {
			step,
			phase: 'a',
			fieldB: new Float64Array(fieldB.v),
			maskB: new Uint8Array(fieldB.mask),
			setupB: { ...engineB.setup },
			wavelengthA: null
		};
		spectrumBusy = true;
		try {
			spectrumWorker.analyze({
				size: fieldA.size,
				domainWidth: engineA.setup.domainWidth,
				boundary: engineA.setup.boundary,
				field: new Float64Array(fieldA.v),
				mask: new Uint8Array(fieldA.mask),
				window: 'auto'
			});
		} catch (error) {
			finishSpectrumError(error instanceof Error ? error.message : 'the spectrum request failed');
		}
	}

	function handleSpectrumWorkerResponse(response: SpectrumWorkerResponse) {
		const pending = pendingSpectrum;
		if (!pending) return;
		if (response.type === 'ERROR') {
			finishSpectrumError(response.message);
			return;
		}
		if (response.type !== 'SPECTRUM_RESULT') return;
		if (pending.phase === 'a') {
			pending.phase = 'b';
			pending.wavelengthA = response.result.dominantWavelength;
			const worker = spectrumWorker;
			if (!worker) {
				finishSpectrumError('the spectrum Worker ended before the second field was measured');
				return;
			}
			try {
				worker.analyze({
					size: pending.setupB.gridSize,
					domainWidth: pending.setupB.domainWidth,
					boundary: pending.setupB.boundary,
					field: pending.fieldB,
					mask: pending.maskB,
					window: 'auto'
				});
			} catch (error) {
				finishSpectrumError(
					error instanceof Error ? error.message : 'the second spectrum request failed'
				);
			}
			return;
		}
		const wavelengthB = response.result.dominantWavelength;
		wavelengthDifference =
			pending.wavelengthA === null || wavelengthB === null
				? null
				: wavelengthB - pending.wavelengthA;
		if (metrics) metrics = { ...metrics, wavelength: wavelengthDifference };
		pendingSpectrum = null;
		spectrumBusy = false;
	}

	function finishSpectrumError(message: string) {
		pendingSpectrum = null;
		spectrumBusy = false;
		wavelengthDifference = null;
		if (metrics) metrics = { ...metrics, wavelength: null };
		status = `Field comparison remains synchronized, but the periodic wavelength measurement failed: ${message}`;
	}

	function cancelPendingSpectrum() {
		if (pendingSpectrum && spectrumWorker) {
			try {
				spectrumWorker.cancel();
			} catch {
				// Teardown or Worker failure already makes the pending measurement irrelevant.
			}
		}
		pendingSpectrum = null;
		spectrumBusy = false;
	}

	function applyStroke(from: readonly [number, number], to: readonly [number, number]) {
		if (!engineA || !engineB) return;
		const makeEvent = (step: number): Intervention => ({
			schemaVersion: 1,
			sequence: sequence++,
			step,
			kind: 'brush',
			tool: 'add-v',
			shape: 'soft-disk',
			target: 'both',
			from,
			to,
			radius: 0.045,
			strength: 0.2,
			falloff: 1.5
		});
		if (target === 'both' || target === 'a')
			engineA.appendIntervention(makeEvent(engineA.stepIndex));
		if (target === 'both' || target === 'b')
			engineB.appendIntervention(makeEvent(engineB.stepIndex));
		advance(1);
		status = `The disturbance was applied to ${target === 'both' ? 'both panes' : target.toUpperCase() + ' only'} immediately before the next synchronized step.`;
	}

	export function loadCandidate(selection: MorphospaceSelection) {
		candidateFeed = selection.feed;
		candidateKill = selection.kill;
		kind = 'atlas';
		reset();
	}

	function drawDifference(
		node: HTMLCanvasElement,
		input: {
			a: FieldState | null;
			b: FieldState | null;
			revision: number;
			view: DifferenceView;
		}
	) {
		const render = (value: typeof input) => {
			if (!value.a || !value.b) return;
			const size = value.a.size;
			node.width = size;
			node.height = size;
			const context = node.getContext('2d', { alpha: false });
			if (!context) return;
			const image = context.createImageData(size, size);
			for (let index = 0; index < value.a.v.length; index += 1) {
				const delta = value.b.v[index] - value.a.v[index];
				const magnitude = Math.min(1, Math.abs(delta) * 12);
				const offset = index * 4;
				if (value.view === 'absolute') {
					image.data[offset] = Math.round(238 * magnitude + 24 * (1 - magnitude));
					image.data[offset + 1] = Math.round(190 * magnitude + 29 * (1 - magnitude));
					image.data[offset + 2] = Math.round(70 * magnitude + 31 * (1 - magnitude));
				} else if (delta >= 0) {
					image.data[offset] = Math.round(220 * magnitude + 28 * (1 - magnitude));
					image.data[offset + 1] = Math.round(91 * magnitude + 31 * (1 - magnitude));
					image.data[offset + 2] = Math.round(60 * magnitude + 34 * (1 - magnitude));
				} else {
					image.data[offset] = Math.round(40 * magnitude + 28 * (1 - magnitude));
					image.data[offset + 1] = Math.round(109 * magnitude + 31 * (1 - magnitude));
					image.data[offset + 2] = Math.round(166 * magnitude + 34 * (1 - magnitude));
				}
				image.data[offset + 3] = 255;
			}
			context.putImageData(image, 0, 0);
		};
		render(input);
		return { update: render };
	}

	function format(value: number | null | undefined) {
		if (value === null || value === undefined) return 'not jointly measurable';
		return Math.abs(value) < 1e-4 ? value.toExponential(3) : value.toPrecision(5);
	}
</script>

<section bind:this={root} class="compare" aria-labelledby="compare-title">
	<header>
		<div>
			<p class="eyebrow">Same clock · controlled counterfactual</p>
			<h3 id="compare-title">Synchronized comparison</h3>
			<p>
				Different evolution is called sensitivity here—not chaos. Both panes advance to exactly the
				same model time.
			</p>
		</div>
		<div class="transport">
			<button type="button" class="primary" onclick={() => (running = !running)}
				>{running ? 'Pause both' : 'Run both'}</button
			>
			<button type="button" onclick={() => advance(1)}>Step</button>
			<button type="button" onclick={() => advance(10)}>Step ×10</button>
			<button type="button" onclick={reset}>Reset shared start</button>
		</div>
	</header>

	<div class="compare-controls">
		<label
			>Change only
			<select bind:value={kind}>
				<option value="feed">F by +0.001</option><option value="kill">k by +0.001</option><option
					value="diffusion">halve Dᵥ</option
				><option value="boundary">boundary seam/wall</option><option value="initial"
					>disk versus ring</option
				><option value="timestep">same physics, Δt/2</option>{#if kind === 'atlas'}<option
						value="atlas">selected atlas F and k</option
					>{/if}
			</select>
		</label>
		<label
			>Brush target
			<select bind:value={target}
				><option value="both">both panes</option><option value="a">A only</option><option value="b"
					>B only</option
				></select
			>
		</label>
		<label
			>Difference map
			<select bind:value={differenceView}
				><option value="signed">signed B − A</option><option value="absolute"
					>absolute |B − A|</option
				></select
			>
		</label>
		<div class="clock">
			<span>Model time</span><strong>{clock.modelTime.toFixed(2)}</strong><small
				>A step {clock.stepA} · B step {clock.stepB}</small
			>
		</div>
		<p class="brush-instructions">
			Tap either field to apply one soft V disturbance to the chosen target. With a field focused,
			move the shared marker with the arrow keys and press Enter to apply it.
		</p>
	</div>

	<div class="fields">
		<figure>
			<ReactionDiffusionField
				field={fieldA}
				setup={reducedSetup(baseSetup)}
				{revision}
				interactive={true}
				interactionMode="paint"
				applicationMode="once"
				selected={selectedPoint}
				label="Counterfactual A concentration field"
				onselect={(point) => (selectedPoint = point)}
				onstroke={applyStroke}
			/>
			<figcaption>
				<b>A · reference</b> F {reducedSetup(baseSetup).feed.toFixed(5)}, k {reducedSetup(
					baseSetup
				).kill.toFixed(5)}, Δt {reducedSetup(baseSetup).timestep}
			</figcaption>
		</figure>
		<figure>
			<ReactionDiffusionField
				field={fieldB}
				setup={setupB}
				{revision}
				interactive={true}
				interactionMode="paint"
				applicationMode="once"
				selected={selectedPoint}
				label="Counterfactual B concentration field"
				onselect={(point) => (selectedPoint = point)}
				onstroke={applyStroke}
			/>
			<figcaption>
				<b>B · one controlled change</b> F {setupB.feed.toFixed(5)}, k {setupB.kill.toFixed(5)}, Δt {setupB.timestep}
			</figcaption>
		</figure>
		<figure class="difference difference-card">
			<canvas
				use:drawDifference={{ a: fieldA, b: fieldB, revision, view: differenceView }}
				aria-label={differenceView === 'signed'
					? `Signed V delta visualization. Red means B has more V; blue means B has less. L2 difference ${metrics?.l2 ?? 0}.`
					: `Absolute V delta visualization. Dark means little difference; amber means a larger magnitude. Mean absolute difference ${metrics?.meanAbsolute ?? 0}.`}
			></canvas>
			<figcaption>
				{#if differenceView === 'signed'}
					<b>Signed V difference · B − A</b> Blue is negative, red is positive; sign is also stated here.
				{:else}
					<b>Absolute V difference · |B − A|</b> Dark means little difference; brighter amber means a
					larger magnitude.
				{/if}
			</figcaption>
		</figure>
	</div>

	<div class="measurement-grid">
		<dl>
			<div>
				<dt>L² field difference</dt>
				<dd>{format(metrics?.l2)}</dd>
			</div>
			<div>
				<dt>mean absolute difference</dt>
				<dd>{format(metrics?.meanAbsolute)}</dd>
			</div>
			<div>
				<dt>difference in mean V</dt>
				<dd>{format(metrics?.meanV)}</dd>
			</div>
			<div>
				<dt>difference in variance V</dt>
				<dd>{format(metrics?.varianceV)}</dd>
			</div>
			<div>
				<dt>difference in dominant λ</dt>
				<dd>{format(metrics?.wavelength)}</dd>
			</div>
		</dl>
		<div class="trace">
			<strong>L² difference through time</strong>
			<svg
				viewBox="0 0 120 54"
				role="img"
				aria-label="L2 field difference over dimensionless model time. The horizontal axis is model time and the vertical axis is dimensionless L2 difference."
				><title>L² field difference over dimensionless model time</title><path
					class="axis"
					d="M18 5V40H116"
				/><path class="zero" d="M18 40H116" /><polyline points={graphPoints} /><text
					x="67"
					y="51"
					text-anchor="middle">model time</text
				><text transform="translate(6 27) rotate(-90)" text-anchor="middle">L² difference</text
				><path class="legend-line" d="M79 8H87" /><text x="89" y="10">B − A field norm</text></svg
			>
			<p>
				Zero is the lower horizontal line. {history.length} synchronized samples; latest {format(
					metrics?.l2
				)}.
			</p>
			<details class="trace-table">
				<summary>Timeline data table</summary>
				<div class="table-scroll">
					<table>
						<caption>
							Synchronized Compare measurements. Model time and field differences are dimensionless.
						</caption>
						<thead>
							<tr
								><th scope="col">sample</th><th scope="col">model time</th><th scope="col"
									>L² difference</th
								><th scope="col">mean absolute difference</th></tr
							>
						</thead>
						<tbody>
							{#each history as sample, index (`${sample.time}-${index}`)}
								<tr
									><th scope="row">{index + 1}</th><td>{sample.time.toFixed(4)}</td><td
										>{format(sample.l2)}</td
									><td>{format(sample.meanAbsolute)}</td></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
			</details>
		</div>
	</div>
	<p class="status" role="status">{status}</p>
</section>

<style>
	.compare {
		color: inherit;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	header > div:first-child {
		max-width: 48rem;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: #337b70;
		font-size: 0.7rem;
		font-weight: 850;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h3 {
		margin: 0 0 0.4rem;
	}
	header p:last-child {
		margin: 0;
	}
	.transport {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	button,
	select {
		min-height: 2.7rem;
		border: 1px solid color-mix(in oklab, currentColor 27%, transparent);
		border-radius: 0.5rem;
		background: var(--paper, #f5f0e5);
		padding: 0.5rem 0.72rem;
		color: inherit;
		font: 750 0.74rem/1.2 inherit;
	}
	button {
		cursor: pointer;
	}
	button.primary {
		border-color: #337b70;
		background: #337b70;
		color: white;
	}
	button:focus-visible,
	select:focus-visible {
		outline: 3px solid #e5b94f;
		outline-offset: 2px;
	}
	.compare-controls {
		display: grid;
		gap: 0.7rem;
		margin-block: 1rem;
	}
	.compare-controls label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.7rem;
		font-weight: 800;
	}
	.brush-instructions {
		grid-column: 1 / -1;
		margin: 0;
		font-size: 0.7rem;
	}
	.clock {
		display: grid;
		border-left: 3px solid #337b70;
		padding-left: 0.7rem;
	}
	.clock span,
	.clock small {
		font-size: 0.67rem;
	}
	.clock strong {
		font:
			800 1.2rem/1.25 ui-monospace,
			monospace;
	}
	.fields {
		display: grid;
		gap: 0.8rem;
	}
	figure {
		min-width: 0;
		margin: 0;
	}
	figcaption {
		margin-top: 0.45rem;
		font-size: 0.69rem;
	}
	.difference canvas {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		border-radius: 0.8rem;
		background: #1c2021;
		image-rendering: pixelated;
	}
	.measurement-grid {
		display: grid;
		gap: 0.8rem;
		margin-top: 1rem;
	}
	dl {
		margin: 0;
		border: 1px solid color-mix(in oklab, currentColor 17%, transparent);
		border-radius: 0.6rem;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		gap: 0.7rem;
		border-bottom: 1px solid color-mix(in oklab, currentColor 13%, transparent);
		padding: 0.46rem 0.6rem;
	}
	dl div:last-child {
		border-bottom: 0;
	}
	dt {
		font-size: 0.7rem;
	}
	dd {
		margin: 0;
		font:
			700 0.68rem/1.2 ui-monospace,
			monospace;
		text-align: right;
	}
	.trace {
		border: 1px solid color-mix(in oklab, currentColor 17%, transparent);
		border-radius: 0.6rem;
		padding: 0.65rem;
	}
	.trace strong,
	.trace p {
		font-size: 0.7rem;
	}
	.trace p {
		margin: 0;
	}
	svg {
		display: block;
		width: 100%;
		height: 6rem;
		background: #101817;
	}
	svg .axis,
	svg .zero,
	svg .legend-line {
		fill: none;
		stroke: rgb(255 255 255 / 0.22);
		stroke-width: 0.5;
	}
	svg .zero {
		stroke-dasharray: 2 2;
	}
	svg .legend-line {
		stroke: #e4c36d;
		stroke-width: 1.4;
	}
	svg polyline {
		fill: none;
		stroke: #e4c36d;
		stroke-width: 1.4;
		vector-effect: non-scaling-stroke;
	}
	svg text {
		fill: #f3efe4;
		font-size: 3.3px;
	}
	.trace-table {
		margin-top: 0.55rem;
		font-size: 0.68rem;
	}
	.trace-table summary {
		cursor: pointer;
		font-weight: 760;
	}
	.table-scroll {
		overflow-x: auto;
		margin-top: 0.45rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font:
			600 0.62rem/1.35 ui-monospace,
			monospace;
	}
	caption {
		padding-bottom: 0.35rem;
		text-align: left;
	}
	th,
	td {
		border: 1px solid color-mix(in oklab, currentColor 17%, transparent);
		padding: 0.28rem 0.35rem;
		text-align: right;
		white-space: nowrap;
	}
	thead th:first-child,
	tbody th {
		text-align: left;
	}
	.status {
		border-left: 3px solid #337b70;
		padding-left: 0.65rem;
		font-size: 0.73rem;
	}
	@media (min-width: 42rem) {
		.compare-controls {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 68rem) {
		.compare-controls {
			grid-template-columns: 1fr 1fr 1fr 0.9fr;
		}
	}
	@media (min-width: 52rem) {
		.fields {
			grid-template-columns: 1fr 1fr 1fr;
		}
		.measurement-grid {
			grid-template-columns: 1fr 1.2fr;
		}
	}
	:global(html[data-theme='high-contrast']) .fields figure {
		outline: 1px solid currentColor;
	}
</style>
