<script lang="ts">
	import { onMount } from 'svelte';
	import ReactionDiffusionField from './ReactionDiffusionField.svelte';
	import { gridSpacing } from '$lib/visualizations/reaction-diffusion/constants';
	import {
		createReactionDiffusionWorkspace,
		stepFieldInto,
		type ReactionDiffusionWorkspace
	} from '$lib/visualizations/reaction-diffusion/engine';
	import {
		cloneFieldState,
		createInitialField
	} from '$lib/visualizations/reaction-diffusion/initial';
	import { calculateFieldMetrics } from '$lib/visualizations/reaction-diffusion/metrics';
	import {
		findHomogeneousEquilibria,
		scanDispersion
	} from '$lib/visualizations/reaction-diffusion/stability';
	import { fivePointLaplacianAt } from '$lib/visualizations/reaction-diffusion/stencil';
	import type {
		FieldState,
		GrayScottSetup,
		StabilityClassification
	} from '$lib/visualizations/reaction-diffusion/types';

	type Props = {
		laboratoryHref?: string;
	};

	type TermMode = 'all' | 'diffusion' | 'reaction';
	type GuideStage = {
		id: string;
		title: string;
		subtitle: string;
		question: string;
		explanation: string;
		equations: readonly string[];
		activeTerms: readonly string[];
		description: string;
		steps: number;
		mode: TermMode;
		comparison?: boolean;
	};

	type IsolatedWorkspace = {
		k1u: Float64Array;
		k1v: Float64Array;
		k2u: Float64Array;
		k2v: Float64Array;
		predictorU: Float64Array;
		predictorV: Float64Array;
	};

	type Runner = {
		setup: GrayScottSetup;
		mode: TermMode;
		current: FieldState;
		next: FieldState;
		coreWorkspace: ReactionDiffusionWorkspace;
		isolatedWorkspace: IsolatedWorkspace;
		step: number;
	};

	let { laboratoryHref = '#reaction-diffusion-observatory' }: Props = $props();

	const GRID_SIZE = 72;
	const BASE_SETUP: GrayScottSetup = {
		feed: 0.051,
		kill: 0.0585,
		diffusionU: 0.16,
		diffusionV: 0.08,
		timestep: 0.5,
		gridSize: GRID_SIZE,
		domainWidth: GRID_SIZE,
		boundary: 'periodic',
		maskPreset: 'open-square',
		initialCondition: 'central-soft-disk',
		seed: 'guided-identical-patch-v1',
		integrator: 'heun'
	};
	const NEARBY_SETUP: GrayScottSetup = {
		...BASE_SETUP,
		feed: 0.052,
		kill: 0.058
	};
	const FEED_EQUILIBRIUM = findHomogeneousEquilibria(BASE_SETUP).find(
		(equilibrium) => equilibrium.id === 'feed'
	)!;
	const GUIDE_DISPERSION = scanDispersion(BASE_SETUP, FEED_EQUILIBRIUM, { samples: 128 });

	const STAGES: readonly GuideStage[] = [
		{
			id: 'equilibrium',
			title: 'The perfectly uneventful world',
			subtitle: 'A control before the experiment',
			question:
				'If every location begins at the feed state, where could a spatial feature come from?',
			explanation:
				'Nowhere. At u = 1 and v = 0, diffusion sees no gradients and every reaction term is exactly zero. The replay advances the same integrator used below; the uniform field is a result, not a frozen illustration.',
			equations: ['u(x,y,0) = 1,   v(x,y,0) = 0', '∂ₜu = 0,   ∂ₜv = 0'],
			activeTerms: ['diffusion', 'autocatalysis', 'feed', 'removal'],
			description:
				'A uniform dark-green square remains uniform from edge to edge. No peak, front, or wavelength appears.',
			steps: 48,
			mode: 'all'
		},
		{
			id: 'diffusion',
			title: 'Diffusion alone',
			subtitle: 'Spatial communication without chemistry',
			question: 'What happens to the sharp patch when neighbouring cells can exchange material?',
			explanation:
				'Only the five-point Laplacian is active. Material moves down concentration gradients: the patch broadens, its peak falls, and the variance of v decreases. There is no autocatalysis, feed, or removal in this plate.',
			equations: ['∂ₜu = Dᵤ∇²u', '∂ₜv = Dᵥ∇²v'],
			activeTerms: ['diffusion'],
			description:
				'A compact pale patch becomes wider and softer while retaining its centre. Its blurred edge is spatial transport made visible.',
			steps: 240,
			mode: 'diffusion'
		},
		{
			id: 'reaction',
			title: 'Reaction alone',
			subtitle: 'Chemistry without spatial communication',
			question: 'Can the patch change if every cell is isolated from all its neighbours?',
			explanation:
				'Yes, but only locally. Each cell follows the Gray–Scott reaction and reservoir terms from its own u and v values. The concentrations change while the original spatial footprint keeps its hard geographical memory.',
			equations: ['∂ₜu = −uv² + F(1−u)', '∂ₜv = uv² − (F+k)v'],
			activeTerms: ['autocatalysis', 'feed', 'removal'],
			description:
				'The patch changes tone but does not spread into neighbouring territory. Cells with equal starting values evolve identically.',
			steps: 180,
			mode: 'reaction'
		},
		{
			id: 'coupling',
			title: 'Coupling the two',
			subtitle: 'Local reaction meets spatial transport',
			question: 'What new behaviour appears when reaction and diffusion operate at the same time?',
			explanation:
				'Diffusion continually changes the local ingredients seen by the nonlinear reaction, while reaction rebuilds gradients for diffusion to act on. The advancing rim is an emergent consequence of that feedback, not a drawn contour.',
			equations: ['∂ₜu = Dᵤ∇²u − uv² + F(1−u)', '∂ₜv = Dᵥ∇²v + uv² − (F+k)v'],
			activeTerms: ['diffusion', 'autocatalysis', 'feed', 'removal'],
			description:
				'The seed develops a structured rim and an expanding concentration front unlike either isolated process.',
			steps: 620,
			mode: 'all'
		},
		{
			id: 'parameter-move',
			title: 'A small parameter move',
			subtitle: 'Identical beginnings, nearby rules',
			question: 'How far apart can two morphologies move when F and k move only a little?',
			explanation:
				'Both plates start from byte-for-byte identical fields and advance for the same model time. The right plate changes F by +0.001 and k by −0.0005. Their finite-time difference belongs to the equations and trajectory, not to different random seeds.',
			equations: ['A: F = 0.0510, k = 0.0585', 'B: F = 0.0520, k = 0.0580'],
			activeTerms: ['same seed', 'same grid', 'same Δt', 'nearby F,k'],
			description:
				'Two fields that initially match separate into visibly different fronts. The readout reports their root-mean-square v difference.',
			steps: 720,
			mode: 'all',
			comparison: true
		},
		{
			id: 'classification',
			title: 'The name problem',
			subtitle: 'Patterned does not automatically mean Turing-unstable',
			question: 'Does a visible pattern prove classical diffusion-driven linear instability?',
			explanation:
				'The strict test starts from a homogeneous equilibrium, forms its reaction Jacobian, and scans spatial wave numbers. Here the feed equilibrium is linearly stable across the scan, while a finite patch still launches nonlinear structure. “Reaction–diffusion pattern” is accurate; “classical Turing instability” is not.',
			equations: [
				'J(q) = Jₙₑₐᶜ − q² diag(Dᵤ,Dᵥ)',
				'maxₙ Re λ(q) = ' + GUIDE_DISPERSION.maximumGrowthRate.toPrecision(3)
			],
			activeTerms: ['equilibrium', 'Jacobian', 'dispersion scan', 'finite perturbation'],
			description:
				'A finite-amplitude field carries structure even though infinitesimal disturbances around the tested feed equilibrium decay.',
			steps: 720,
			mode: 'all'
		}
	];

	let activeIndex = $state(0);
	let fieldA = $state<FieldState | null>(null);
	let fieldB = $state<FieldState | null>(null);
	let fieldRevision = $state(0);
	let progress = $state(0);
	let running = $state(false);
	let status = $state('Preparing the deterministic initial field.');
	let initialVariance = $state(0);
	let currentVariance = $state(0);
	let comparisonDifference = $state(0);
	let reducedMotion = false;
	let replayToken = 0;
	let disposed = false;
	let root = $state<HTMLElement>();
	let offscreen = false;
	let intersectionObserver: IntersectionObserver | null = null;
	let releaseSuspension: (() => void) | null = null;

	let stage = $derived(STAGES[activeIndex]);
	let modelTime = $derived(stage.steps * BASE_SETUP.timestep * progress);
	let classification = $derived(classificationLabel(GUIDE_DISPERSION.classification));

	onMount(() => {
		disposed = false;
		reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const handleVisibility = () => {
			if (!document.hidden) wakeReplay();
		};
		document.addEventListener('visibilitychange', handleVisibility);
		if (typeof IntersectionObserver !== 'undefined') {
			intersectionObserver = new IntersectionObserver(
				(entries) => {
					offscreen = !entries.some((entry) => entry.isIntersecting);
					if (!offscreen) wakeReplay();
				},
				{ rootMargin: '160px 0px', threshold: 0.01 }
			);
			if (root) intersectionObserver.observe(root);
		}
		prepareStage(activeIndex);
		return () => {
			disposed = true;
			replayToken += 1;
			document.removeEventListener('visibilitychange', handleVisibility);
			intersectionObserver?.disconnect();
			intersectionObserver = null;
			wakeReplay();
		};
	});

	function stageSetup(index: number, comparison = false): GrayScottSetup {
		if (index === 0)
			return { ...BASE_SETUP, initialCondition: 'blank-feed', seed: 'guided-equilibrium-v1' };
		if (index === 1) return { ...BASE_SETUP, feed: 0, kill: 0 };
		if (index === 2) return { ...BASE_SETUP, diffusionU: 0, diffusionV: 0 };
		if (index === 4 && comparison) return { ...NEARBY_SETUP };
		return { ...BASE_SETUP };
	}

	function createRunner(index: number, comparison = false, sharedInitial?: FieldState): Runner {
		const setup = stageSetup(index, comparison);
		const current = sharedInitial ? cloneFieldState(sharedInitial) : createInitialField(setup);
		const length = current.u.length;
		return {
			setup,
			mode: STAGES[index].mode,
			current,
			next: cloneFieldState(current),
			coreWorkspace: createReactionDiffusionWorkspace(current.size),
			isolatedWorkspace: {
				k1u: new Float64Array(length),
				k1v: new Float64Array(length),
				k2u: new Float64Array(length),
				k2v: new Float64Array(length),
				predictorU: new Float64Array(length),
				predictorV: new Float64Array(length)
			},
			step: 0
		};
	}

	function prepareStage(index: number) {
		const runnerA = createRunner(index);
		fieldA = runnerA.current;
		fieldB = STAGES[index].comparison ? createRunner(index, true, runnerA.current).current : null;
		fieldRevision += 1;
		progress = 0;
		running = false;
		const metrics = calculateFieldMetrics(runnerA.current);
		initialVariance = metrics.varianceV;
		currentVariance = metrics.varianceV;
		comparisonDifference = 0;
		status =
			'Initial condition restored. Choose Replay observation to advance the exact model steps.';
	}

	async function replay() {
		const index = activeIndex;
		const definition = STAGES[index];
		const token = ++replayToken;
		const runnerA = createRunner(index);
		const runnerB = definition.comparison ? createRunner(index, true, runnerA.current) : null;
		fieldA = runnerA.current;
		fieldB = runnerB?.current ?? null;
		fieldRevision += 1;
		progress = 0;
		running = true;
		initialVariance = calculateFieldMetrics(runnerA.current).varianceV;
		currentVariance = initialVariance;
		comparisonDifference = 0;
		status = `Replaying observation ${index + 1} from its deterministic initial state.`;

		await nextFrame();
		const chunkSize = reducedMotion ? 64 : 12;
		while (!disposed && token === replayToken && runnerA.step < definition.steps) {
			await waitUntilActive(token, index);
			if (disposed || token !== replayToken) return;
			const count = Math.min(chunkSize, definition.steps - runnerA.step);
			advanceRunner(runnerA, count);
			if (runnerB) advanceRunner(runnerB, count);
			progress = runnerA.step / definition.steps;
			if (!reducedMotion || runnerA.step === definition.steps) {
				fieldA = runnerA.current;
				fieldB = runnerB?.current ?? null;
				fieldRevision += 1;
				updateReadouts(runnerA.current, runnerB?.current ?? null);
			}
			await nextFrame();
		}

		if (disposed || token !== replayToken) return;
		fieldA = runnerA.current;
		fieldB = runnerB?.current ?? null;
		fieldRevision += 1;
		progress = 1;
		running = false;
		updateReadouts(runnerA.current, runnerB?.current ?? null);
		status = `Observation ${index + 1} complete at model time ${(
			definition.steps * BASE_SETUP.timestep
		).toFixed(1)}.`;
	}

	async function waitUntilActive(token: number, index: number) {
		while (!disposed && token === replayToken && (document.hidden || offscreen)) {
			status = document.hidden
				? `Observation ${index + 1} is paused while this page is hidden.`
				: `Observation ${index + 1} is paused while the guided plate is offscreen.`;
			await new Promise<void>((resolve) => {
				releaseSuspension = resolve;
			});
		}
		if (!disposed && token === replayToken) {
			status = `Replaying observation ${index + 1} from its deterministic initial state.`;
		}
	}

	function wakeReplay() {
		const release = releaseSuspension;
		releaseSuspension = null;
		release?.();
	}

	function advanceRunner(runner: Runner, count: number) {
		for (let index = 0; index < count; index += 1) {
			if (runner.mode === 'all') {
				stepFieldInto(runner.current, runner.setup, runner.next, runner.coreWorkspace);
			} else {
				isolatedHeunStep(runner);
			}
			[runner.current, runner.next] = [runner.next, runner.current];
			runner.step += 1;
		}
	}

	function isolatedHeunStep(runner: Runner) {
		const { current, next, setup, isolatedWorkspace: workspace, mode } = runner;
		if (mode === 'all') throw new Error('The coupled system must use the shared core integrator.');
		calculateIsolatedRhs(current, setup, mode, workspace.k1u, workspace.k1v);
		for (let index = 0; index < current.u.length; index += 1) {
			workspace.predictorU[index] = current.u[index] + setup.timestep * workspace.k1u[index];
			workspace.predictorV[index] = current.v[index] + setup.timestep * workspace.k1v[index];
		}
		calculateIsolatedRhs(
			{
				size: current.size,
				u: workspace.predictorU,
				v: workspace.predictorV,
				mask: current.mask
			},
			setup,
			mode,
			workspace.k2u,
			workspace.k2v
		);
		for (let index = 0; index < current.u.length; index += 1) {
			next.u[index] =
				current.u[index] + (setup.timestep * (workspace.k1u[index] + workspace.k2u[index])) / 2;
			next.v[index] =
				current.v[index] + (setup.timestep * (workspace.k1v[index] + workspace.k2v[index])) / 2;
		}
		next.mask.set(current.mask);
	}

	function calculateIsolatedRhs(
		field: FieldState,
		setup: GrayScottSetup,
		mode: Exclude<TermMode, 'all'>,
		outU: Float64Array,
		outV: Float64Array
	) {
		const spacing = gridSpacing(setup);
		for (let row = 0; row < field.size; row += 1) {
			for (let column = 0; column < field.size; column += 1) {
				const index = row * field.size + column;
				if (!field.mask[index]) {
					outU[index] = 0;
					outV[index] = 0;
					continue;
				}
				const u = field.u[index];
				const v = field.v[index];
				if (mode === 'diffusion') {
					outU[index] =
						setup.diffusionU *
						fivePointLaplacianAt(
							field.u,
							field.mask,
							field.size,
							row,
							column,
							setup.boundary,
							spacing,
							1
						);
					outV[index] =
						setup.diffusionV *
						fivePointLaplacianAt(
							field.v,
							field.mask,
							field.size,
							row,
							column,
							setup.boundary,
							spacing,
							0
						);
				} else {
					const autocatalysis = u * v * v;
					outU[index] = -autocatalysis + setup.feed * (1 - u);
					outV[index] = autocatalysis - (setup.feed + setup.kill) * v;
				}
			}
		}
	}

	function updateReadouts(first: FieldState, second: FieldState | null) {
		currentVariance = calculateFieldMetrics(first).varianceV;
		comparisonDifference = second ? rootMeanSquareDifference(first.v, second.v) : 0;
	}

	function rootMeanSquareDifference(first: Float64Array, second: Float64Array) {
		let sum = 0;
		for (let index = 0; index < first.length; index += 1) {
			const difference = first[index] - second[index];
			sum += difference * difference;
		}
		return Math.sqrt(sum / first.length);
	}

	async function selectStage(index: number) {
		if (index < 0 || index >= STAGES.length || index === activeIndex) return;
		replayToken += 1;
		activeIndex = index;
		prepareStage(index);
		await replay();
	}

	function nextFrame() {
		return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	}

	function classificationLabel(value: StabilityClassification) {
		if (value === 'classical-diffusion-driven') return 'Classical diffusion-driven instability';
		if (value === 'reaction-unstable') return 'Reaction-unstable at q = 0';
		if (value === 'near-boundary') return 'Near a linear-stability boundary';
		return 'Linearly stable; finite-amplitude patterning remains possible';
	}

	function formatScientific(value: number) {
		return value === 0 ? '0' : value.toExponential(2);
	}
</script>

<section
	bind:this={root}
	class="guided"
	aria-labelledby="guided-title"
	aria-describedby="guided-intro"
>
	<header class="guided-header">
		<div>
			<p class="eyebrow">Guided observation · six controlled experiments</p>
			<h2 id="guided-title">Six things to notice before touching every knob</h2>
			<p id="guided-intro">
				Each plate starts from a declared field, advances a fixed-step Heun calculation, and can be
				replayed exactly. Nothing here is a video loop.
			</p>
		</div>
		<div class="method-stamp" aria-label="Numerical method">
			<span>CPU reference</span>
			<strong>72 × 72</strong>
			<small>Δt 0.5 · periodic</small>
		</div>
	</header>

	<nav class="stage-index" aria-label="Guided observation stages">
		{#each STAGES as item, index (item.id)}
			<button
				type="button"
				class:current={index === activeIndex}
				aria-current={index === activeIndex ? 'step' : undefined}
				onclick={() => selectStage(index)}
			>
				<span>{String(index + 1).padStart(2, '0')}</span>
				<small>{item.title}</small>
			</button>
		{/each}
	</nav>

	<div class="instrument" aria-busy={running}>
		<div class="visual-column">
			<div class:comparison={stage.comparison} class="fields">
				<figure>
					{#if stage.comparison}<figcaption>A · F 0.0510 / k 0.0585</figcaption>{/if}
					<ReactionDiffusionField
						field={fieldA}
						setup={stageSetup(activeIndex)}
						revision={fieldRevision}
						displayMode="v"
						palette="mineral"
						interactive={false}
						label={`Observation ${activeIndex + 1}. ${stage.description}`}
					/>
				</figure>
				{#if stage.comparison}
					<figure>
						<figcaption>B · F 0.0520 / k 0.0580</figcaption>
						<ReactionDiffusionField
							field={fieldB}
							setup={stageSetup(activeIndex, true)}
							revision={fieldRevision}
							displayMode="v"
							palette="mineral"
							interactive={false}
							label={`Nearby-parameter comparison. ${stage.description}`}
						/>
					</figure>
				{/if}
			</div>

			<div class="transport" aria-label="Replay progress">
				<progress value={progress} max="1">{Math.round(progress * 100)}%</progress>
				<div>
					<span>step {Math.round(stage.steps * progress)} / {stage.steps}</span>
					<span>model time {modelTime.toFixed(1)}</span>
				</div>
			</div>

			<dl class="measurement-strip">
				<div>
					<dt>initial var(v)</dt>
					<dd>{formatScientific(initialVariance)}</dd>
				</div>
				<div>
					<dt>current var(v)</dt>
					<dd>{formatScientific(currentVariance)}</dd>
				</div>
				<div>
					<dt>{stage.comparison ? 'RMS Δv' : 'active terms'}</dt>
					<dd>
						{stage.comparison ? formatScientific(comparisonDifference) : stage.activeTerms.length}
					</dd>
				</div>
			</dl>
		</div>

		<article class="observation-card">
			<p class="stage-count">Observation {activeIndex + 1} of {STAGES.length}</p>
			<h3>{stage.title}</h3>
			<p class="subtitle">{stage.subtitle}</p>

			<div class="question">
				<span>Look for</span>
				<p>{stage.question}</p>
			</div>

			<p class="explanation">{stage.explanation}</p>

			<div class="equation-card" aria-label="Active equations and terms">
				<p>Active equation</p>
				{#each stage.equations as equation (equation)}
					<code>{equation}</code>
				{/each}
				<div class="term-chips">
					{#each stage.activeTerms as term (term)}<span>{term}</span>{/each}
				</div>
			</div>

			{#if activeIndex === 5}
				<div class="classification" data-kind={GUIDE_DISPERSION.classification}>
					<span>Inspector classification</span>
					<strong>{classification}</strong>
					<small>q = 0 growth {GUIDE_DISPERSION.qZeroGrowthRate.toPrecision(3)}</small>
				</div>
			{/if}

			<div class="visible-description">
				<span aria-hidden="true">↳</span>
				<p><strong>Visible state.</strong> {stage.description}</p>
			</div>
		</article>
	</div>

	<footer class="guided-footer">
		<div class="controls" aria-label="Guided sequence controls">
			<button
				type="button"
				onclick={() => selectStage(activeIndex - 1)}
				disabled={activeIndex === 0}
			>
				<span aria-hidden="true">←</span> Previous
			</button>
			<button type="button" class="replay" onclick={replay} disabled={running}>
				<span aria-hidden="true">↻</span>
				{running ? 'Calculating…' : 'Replay observation'}
			</button>
			<button
				type="button"
				onclick={() => selectStage(activeIndex + 1)}
				disabled={activeIndex === STAGES.length - 1}
			>
				Next <span aria-hidden="true">→</span>
			</button>
		</div>
		<!-- laboratoryHref deliberately supports a same-document exhibit fragment. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="open-lab" href={laboratoryHref}
			>Open in full laboratory controls <span aria-hidden="true">↘</span></a
		>
	</footer>

	<p class="status" role="status" aria-live="polite">{status}</p>

	<noscript>
		<div class="no-script">
			<img
				src="/images/visualizations/reaction-diffusion/guided-observations.png"
				alt="Six labelled Gray–Scott solver plates: homogeneous equilibrium, diffusion alone, reaction alone, coupled reaction and diffusion, nearby parameter runs, and linear-stability classification."
			/>
			<div>
				<h3>The six observations, without JavaScript</h3>
				<ol>
					{#each STAGES as item (item.id)}
						<li><strong>{item.title}:</strong> {item.description}</li>
					{/each}
				</ol>
				<p>The poster is a solver-generated field, not an artist’s reconstruction.</p>
			</div>
		</div>
	</noscript>
</section>

<style>
	.guided {
		--guide-ink: var(--essay-ink, #24302e);
		--guide-paper: var(--paper-raised, #f7f1e4);
		--guide-teal: #276f67;
		--guide-gold: #a7792b;
		width: min(74rem, calc(100vw - 1.5rem));
		max-width: none;
		margin-block: clamp(2.5rem, 7vw, 5.5rem);
		margin-inline: 50%;
		translate: -50% 0;
		border: 1px solid color-mix(in oklab, var(--guide-ink) 24%, transparent);
		border-radius: 1.25rem;
		background:
			linear-gradient(
					90deg,
					color-mix(in oklab, var(--guide-teal) 4%, transparent) 1px,
					transparent 1px
				)
				0 0 / 2.3rem 2.3rem,
			linear-gradient(color-mix(in oklab, var(--guide-teal) 4%, transparent) 1px, transparent 1px) 0
				0 / 2.3rem 2.3rem,
			var(--guide-paper);
		box-shadow: 0 2rem 5rem rgb(28 38 35 / 0.13);
		color: var(--guide-ink);
		overflow: hidden;
	}
	.guided-header {
		display: grid;
		gap: 1rem;
		padding: clamp(1.1rem, 3vw, 2rem);
		border-bottom: 1px solid color-mix(in oklab, var(--guide-ink) 17%, transparent);
	}
	.eyebrow,
	.stage-count,
	.equation-card > p {
		margin: 0 0 0.4rem;
		color: var(--guide-teal);
		font:
			800 0.75rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	h2 {
		max-width: 49rem;
		margin: 0;
		font-size: clamp(1.7rem, 4vw, 3.2rem);
		line-height: 1.02;
		letter-spacing: -0.035em;
	}
	#guided-intro {
		max-width: 48rem;
		margin: 0.8rem 0 0;
		font-size: clamp(0.92rem, 1.4vw, 1.04rem);
		line-height: 1.55;
	}
	.method-stamp {
		align-self: start;
		display: grid;
		width: fit-content;
		min-width: 10.5rem;
		border: 1px solid color-mix(in oklab, var(--guide-ink) 28%, transparent);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--guide-paper) 90%, white);
		padding: 0.7rem 0.8rem;
		box-shadow: 0.25rem 0.25rem 0 color-mix(in oklab, var(--guide-gold) 18%, transparent);
		font-family: ui-monospace, monospace;
	}
	.method-stamp span {
		color: var(--guide-teal);
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.method-stamp strong {
		font-size: 1.15rem;
	}
	.method-stamp small {
		opacity: 0.72;
	}
	.stage-index {
		display: grid;
		grid-template-columns: repeat(6, minmax(8.5rem, 1fr));
		overflow-x: auto;
		border-bottom: 1px solid color-mix(in oklab, var(--guide-ink) 17%, transparent);
		background: color-mix(in oklab, var(--guide-paper) 82%, white);
		scrollbar-width: thin;
	}
	.stage-index button {
		display: grid;
		min-height: 4.25rem;
		border: 0;
		border-right: 1px solid color-mix(in oklab, var(--guide-ink) 14%, transparent);
		background: transparent;
		padding: 0.65rem 0.75rem;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.stage-index button:last-child {
		border-right: 0;
	}
	.stage-index button:hover {
		background: color-mix(in oklab, var(--guide-teal) 7%, transparent);
	}
	.stage-index button.current {
		background: var(--guide-ink);
		color: var(--guide-paper);
	}
	.stage-index span {
		color: var(--guide-gold);
		font:
			800 0.75rem/1 ui-monospace,
			monospace;
	}
	.stage-index small {
		align-self: end;
		font-size: 0.8rem;
		font-weight: 760;
		line-height: 1.15;
	}
	button:focus-visible,
	a:focus-visible {
		outline: 3px solid var(--guide-gold);
		outline-offset: -3px;
	}
	.instrument {
		display: grid;
		gap: clamp(1.2rem, 3vw, 2rem);
		padding: clamp(1rem, 3vw, 2rem);
	}
	.visual-column {
		min-width: 0;
	}
	.fields {
		display: grid;
		gap: 0.7rem;
	}
	.fields.comparison {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	figure {
		min-width: 0;
		margin: 0;
	}
	figcaption {
		margin-bottom: 0.35rem;
		font:
			750 0.8rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.03em;
	}
	.transport {
		margin-top: 0.85rem;
	}
	progress {
		display: block;
		width: 100%;
		height: 0.42rem;
		border: 0;
		border-radius: 999px;
		accent-color: var(--guide-teal);
		overflow: hidden;
	}
	progress::-webkit-progress-bar {
		background: color-mix(in oklab, var(--guide-ink) 12%, transparent);
	}
	progress::-webkit-progress-value {
		background: var(--guide-teal);
	}
	.transport > div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.35rem;
		font:
			700 0.8rem/1.2 ui-monospace,
			monospace;
	}
	.measurement-strip {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 0.8rem 0 0;
		border: 1px solid color-mix(in oklab, var(--guide-ink) 16%, transparent);
		border-radius: 0.55rem;
		overflow: hidden;
	}
	.measurement-strip div {
		min-width: 0;
		padding: 0.5rem 0.6rem;
		border-right: 1px solid color-mix(in oklab, var(--guide-ink) 14%, transparent);
	}
	.measurement-strip div:last-child {
		border-right: 0;
	}
	.measurement-strip dt {
		overflow: hidden;
		color: color-mix(in oklab, var(--guide-ink) 65%, transparent);
		font-size: 0.75rem;
		font-weight: 750;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.measurement-strip dd {
		margin: 0.2rem 0 0;
		font:
			800 0.875rem/1.2 ui-monospace,
			monospace;
	}
	.observation-card {
		align-self: start;
		border-left: 0.3rem solid var(--guide-teal);
		background: color-mix(in oklab, var(--guide-paper) 87%, white);
		padding: clamp(1rem, 2.6vw, 1.5rem);
		box-shadow: 0 0.8rem 2rem rgb(33 43 40 / 0.08);
	}
	.observation-card h3 {
		margin: 0;
		font-size: clamp(1.45rem, 3vw, 2.2rem);
		line-height: 1.06;
		letter-spacing: -0.025em;
	}
	.subtitle {
		margin: 0.35rem 0 1rem;
		color: var(--guide-gold);
		font-size: 0.875rem;
		font-weight: 800;
	}
	.question {
		margin-block: 1rem;
		border-block: 1px solid color-mix(in oklab, var(--guide-ink) 15%, transparent);
		padding-block: 0.75rem;
	}
	.question span {
		color: var(--guide-teal);
		font:
			800 0.75rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.question p {
		margin: 0.25rem 0 0;
		font-size: 1.02rem;
		font-weight: 760;
		line-height: 1.38;
	}
	.explanation {
		font-size: 0.92rem;
		line-height: 1.55;
	}
	.equation-card {
		margin-top: 1rem;
		border: 1px solid color-mix(in oklab, var(--guide-ink) 18%, transparent);
		border-radius: 0.6rem;
		background: color-mix(in oklab, var(--guide-teal) 5%, transparent);
		padding: 0.8rem;
	}
	.equation-card code {
		display: block;
		overflow-x: auto;
		padding-block: 0.18rem;
		background: transparent;
		color: inherit;
		font:
			700 0.875rem/1.35 ui-monospace,
			monospace;
		white-space: nowrap;
	}
	.term-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.6rem;
	}
	.term-chips span {
		border-radius: 999px;
		background: var(--guide-ink);
		padding: 0.22rem 0.48rem;
		color: var(--guide-paper);
		font:
			750 0.75rem/1.2 ui-monospace,
			monospace;
	}
	.classification {
		display: grid;
		gap: 0.25rem;
		margin-top: 1rem;
		border-left: 0.25rem solid var(--guide-gold);
		background: color-mix(in oklab, var(--guide-gold) 10%, transparent);
		padding: 0.7rem 0.8rem;
	}
	.classification span {
		font:
			800 0.75rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.classification strong {
		font-size: 0.88rem;
	}
	.classification small {
		font-family: ui-monospace, monospace;
	}
	.visible-description {
		display: flex;
		gap: 0.55rem;
		margin-top: 1rem;
		color: color-mix(in oklab, var(--guide-ink) 76%, transparent);
	}
	.visible-description > span {
		color: var(--guide-gold);
		font-weight: 900;
	}
	.visible-description p {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.45;
	}
	.guided-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		border-top: 1px solid color-mix(in oklab, var(--guide-ink) 17%, transparent);
		padding: 1rem clamp(1rem, 3vw, 2rem);
		background: color-mix(in oklab, var(--guide-paper) 82%, white);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.controls button,
	.open-lab {
		min-height: 2.75rem;
		border: 1px solid color-mix(in oklab, var(--guide-ink) 38%, transparent);
		border-radius: 999px;
		background: transparent;
		padding: 0.58rem 0.85rem;
		color: inherit;
		font-size: 0.875rem;
		font-weight: 800;
		line-height: 1.2;
		text-decoration: none;
		cursor: pointer;
	}
	.controls .replay {
		border-color: var(--guide-teal);
		background: var(--guide-teal);
		color: #fffdf4;
	}
	.controls button:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}
	.open-lab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border-color: var(--guide-gold);
	}
	.status {
		margin: 0;
		border-top: 1px dashed color-mix(in oklab, var(--guide-ink) 18%, transparent);
		padding: 0.65rem clamp(1rem, 3vw, 2rem);
		color: color-mix(in oklab, var(--guide-ink) 70%, transparent);
		font:
			650 0.875rem/1.4 ui-monospace,
			monospace;
	}
	.no-script {
		display: grid;
		gap: 1rem;
		border-top: 2px solid var(--guide-gold);
		padding: 1rem;
	}
	.no-script img {
		width: 100%;
		border-radius: 0.65rem;
	}
	.no-script h3 {
		margin-top: 0;
	}
	.no-script li {
		margin-block: 0.4rem;
	}
	@media (min-width: 46rem) {
		.guided-header {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.no-script {
			grid-template-columns: minmax(14rem, 0.7fr) minmax(0, 1.3fr);
		}
	}
	@media (min-width: 58rem) {
		.instrument {
			grid-template-columns: minmax(0, 1.4fr) minmax(19rem, 0.82fr);
		}
	}
	@media (max-width: 40rem) {
		.guided {
			width: calc(100vw - 0.75rem);
			border-radius: 0.8rem;
		}
		.fields.comparison {
			gap: 0.4rem;
		}
		.measurement-strip dt {
			font-size: 0.875rem;
		}
		.guided-footer {
			align-items: stretch;
		}
		.controls {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			width: 100%;
		}
		.controls button {
			padding-inline: 0.45rem;
		}
		.open-lab {
			justify-content: center;
			width: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
		}
	}
	@media print {
		.guided {
			width: 100%;
			margin-inline: 0;
			translate: none;
			box-shadow: none;
		}
		.stage-index,
		.guided-footer,
		.status {
			display: none;
		}
	}
	:global(html[data-theme='night']) .guided {
		--guide-teal: #7dcab9;
		--guide-gold: #e3bd70;
	}
	:global(html[data-theme='high-contrast']) .guided {
		--guide-teal: currentColor;
		--guide-gold: #ffd44d;
		border-width: 2px;
	}
</style>
