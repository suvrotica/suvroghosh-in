<script lang="ts">
	import { onMount } from 'svelte';
	import {
		bobPositionsInto,
		createRk4Workspace,
		lowerBobSeparation as measureLowerBobSeparation,
		rk4StepInto,
		type BobPositions,
		type PendulumParameters,
		type PendulumState
	} from '$lib/visualizations/double-pendulum';

	type TrailPoint = { x: number; y: number };
	type StoryStep = {
		title: string;
		copy: string;
		note: string;
	};

	const FIXED_STEP = 1 / 240;
	const PERTURBATION_DEGREES = 0.000001;
	const PERTURBATION_RADIANS = (PERTURBATION_DEGREES * Math.PI) / 180;
	const AGREEMENT_END = 6;
	const LOSS_START = 12;
	const LOSS_END = 24;
	const MAX_TRAIL_POINTS = 360;
	const TRAIL_SAMPLE_STRIDE = 4;

	const PARAMETERS: PendulumParameters = {
		m1: 1,
		m2: 1,
		l1: 1,
		l2: 1,
		g: 9.81
	};

	const INITIAL_STATE: PendulumState = {
		theta1: (120 * Math.PI) / 180,
		theta2: (-10 * Math.PI) / 180,
		omega1: 0,
		omega2: 0
	};

	const STEPS: readonly StoryStep[] = [
		{
			title: 'One machine',
			copy: '“No dice were thrown.”',
			note: 'One state waits at 120° and −10°. The equations, not a random source, decide what follows.'
		},
		{
			title: 'One future, copied',
			copy: '“Same masses. Same lengths. Same gravity. Same four starting numbers.”',
			note: 'The cool dashed shadow is an exact state copy. At reset, its lower bob occupies the same point.'
		},
		{
			title: 'The nudge',
			copy: '“One angle has moved by less than your cursor can sensibly point.”',
			note: 'Only θ₁ changes: exactly 0.000001°. The inset magnifies that offset ten million times; the calculation does not.'
		},
		{
			title: 'Agreement',
			copy: '“For a while, the futures agree.”',
			note: 'Both states advance with the same fixed 1/240 s RK4 step. Their physical separation remains in the readout.'
		},
		{
			title: 'Loss',
			copy: '“Then the machine misplaces tomorrow.”',
			note: 'The calculation has no random branch. The visible split is the evolved consequence of the original one-millionth-degree difference.'
		}
	];

	let storyRoot: HTMLElement;
	let stageHost: HTMLDivElement;
	let canvas = $state<HTMLCanvasElement>();
	let context: CanvasRenderingContext2D | null = null;
	let frameId = 0;
	let previousFrameTime = 0;
	let accumulator = 0;
	let width = 1;
	let height = 1;
	let pixelRatio = 1;
	let visible = true;
	let integrationSteps = 0;
	let lastReadoutAt = -Infinity;
	let primaryState: PendulumState = { ...INITIAL_STATE };
	let primaryNext: PendulumState = { ...INITIAL_STATE };
	let shadowState: PendulumState = { ...INITIAL_STATE };
	let shadowNext: PendulumState = { ...INITIAL_STATE };
	let primaryTrail: TrailPoint[] = [];
	let shadowTrail: TrailPoint[] = [];
	const primaryWorkspace = createRk4Workspace();
	const shadowWorkspace = createRk4Workspace();
	const primaryPosition: BobPositions = { x1: 0, y1: 0, x2: 0, y2: 0 };
	const shadowPosition: BobPositions = { x1: 0, y1: 0, x2: 0, y2: 0 };
	const drawPosition: BobPositions = { x1: 0, y1: 0, x2: 0, y2: 0 };

	let activeStep = $state(0);
	let canvasAvailable = $state(true);
	let ready = $state(false);
	let reducedMotion = $state(false);
	let simulatedTime = $state(0);
	let separation = $state(0);

	function copyInitialState(perturbed: boolean): PendulumState {
		return {
			...INITIAL_STATE,
			theta1: INITIAL_STATE.theta1 + (perturbed ? PERTURBATION_RADIANS : 0)
		};
	}

	function lowerBobSeparation(): number {
		return measureLowerBobSeparation(primaryState, shadowState, PARAMETERS);
	}

	function formatDistance(value: number): string {
		if (value === 0) return '0 m';
		if (value < 1e-6) return `${(value * 1e9).toFixed(value < 1e-8 ? 2 : 1)} nm`;
		if (value < 1e-3) return `${(value * 1e6).toFixed(value < 1e-5 ? 2 : 1)} µm`;
		if (value < 0.01) return `${(value * 1000).toFixed(2)} mm`;
		if (value < 1) return `${(value * 100).toFixed(1)} cm`;
		return `${value.toFixed(2)} m`;
	}

	function publishReadout(now = performance.now(), force = false) {
		if (!force && now - lastReadoutAt < 120) return;
		simulatedTime = integrationSteps * FIXED_STEP;
		separation = lowerBobSeparation();
		lastReadoutAt = now;
	}

	function appendTrailPoint() {
		bobPositionsInto(primaryState, PARAMETERS, primaryPosition);
		bobPositionsInto(shadowState, PARAMETERS, shadowPosition);
		primaryTrail.push({ x: primaryPosition.x2, y: primaryPosition.y2 });
		shadowTrail.push({ x: shadowPosition.x2, y: shadowPosition.y2 });
		if (primaryTrail.length > MAX_TRAIL_POINTS + 32) primaryTrail.splice(0, 33);
		if (shadowTrail.length > MAX_TRAIL_POINTS + 32) shadowTrail.splice(0, 33);
	}

	function resetStates(perturbed: boolean) {
		primaryState = copyInitialState(false);
		primaryNext = copyInitialState(false);
		shadowState = copyInitialState(perturbed);
		shadowNext = copyInitialState(perturbed);
		integrationSteps = 0;
		accumulator = 0;
		previousFrameTime = 0;
		primaryTrail = [];
		shadowTrail = [];
		if (activeStep >= 3) appendTrailPoint();
		publishReadout(performance.now(), true);
	}

	function integrateOneStep() {
		rk4StepInto(primaryState, PARAMETERS, FIXED_STEP, primaryNext, primaryWorkspace);
		rk4StepInto(shadowState, PARAMETERS, FIXED_STEP, shadowNext, shadowWorkspace);
		const previousPrimary = primaryState;
		primaryState = primaryNext;
		primaryNext = previousPrimary;
		const previousShadow = shadowState;
		shadowState = shadowNext;
		shadowNext = previousShadow;
		integrationSteps += 1;
		if (activeStep >= 3 && integrationSteps % TRAIL_SAMPLE_STRIDE === 0) appendTrailPoint();
	}

	function advanceTo(targetTime: number) {
		const targetSteps = Math.round(targetTime / FIXED_STEP);
		while (integrationSteps < targetSteps) integrateOneStep();
		publishReadout(performance.now(), true);
	}

	function drawTrail(
		trail: readonly TrailPoint[],
		stroke: string,
		lineWidth: number,
		dashed: boolean,
		scale: number,
		pivotX: number,
		pivotY: number
	) {
		if (!context || trail.length < 2) return;
		context.save();
		context.beginPath();
		for (let index = 0; index < trail.length; index += 1) {
			const x = pivotX + trail[index].x * scale;
			const y = pivotY + trail[index].y * scale;
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.strokeStyle = stroke;
		context.lineWidth = lineWidth;
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.setLineDash(dashed ? [7, 8] : []);
		context.stroke();
		context.restore();
	}

	function drawMechanism(
		state: PendulumState,
		identity: 'primary' | 'shadow',
		scale: number,
		pivotX: number,
		pivotY: number
	) {
		if (!context) return;
		bobPositionsInto(state, PARAMETERS, drawPosition);
		const upperX = pivotX + drawPosition.x1 * scale;
		const upperY = pivotY + drawPosition.y1 * scale;
		const lowerX = pivotX + drawPosition.x2 * scale;
		const lowerY = pivotY + drawPosition.y2 * scale;
		const radius = Math.max(7, Math.min(13, width / 58));

		context.save();
		context.beginPath();
		context.moveTo(pivotX, pivotY);
		context.lineTo(upperX, upperY);
		context.lineTo(lowerX, lowerY);
		context.lineCap = 'round';
		context.lineJoin = 'round';
		if (identity === 'shadow') {
			context.strokeStyle = '#83cbe5';
			context.lineWidth = 6;
			context.setLineDash([8, 7]);
		} else {
			context.strokeStyle = '#e9e1d2';
			context.lineWidth = 3.6;
			context.setLineDash([]);
		}
		context.stroke();

		if (identity === 'shadow') {
			context.translate(lowerX, lowerY);
			context.rotate(Math.PI / 4);
			context.fillStyle = '#081017';
			context.strokeStyle = '#9adcf1';
			context.lineWidth = 2.5;
			context.setLineDash([4, 3]);
			context.fillRect(-radius * 0.78, -radius * 0.78, radius * 1.56, radius * 1.56);
			context.strokeRect(-radius * 0.78, -radius * 0.78, radius * 1.56, radius * 1.56);
		} else {
			context.beginPath();
			context.arc(upperX, upperY, radius * 0.88, 0, Math.PI * 2);
			context.fillStyle = '#a9a9aa';
			context.fill();
			context.beginPath();
			context.arc(lowerX, lowerY, radius * 1.08, 0, Math.PI * 2);
			context.fillStyle = '#db6c49';
			context.fill();
			context.fillStyle = 'rgb(255 248 233 / 0.75)';
			context.beginPath();
			context.arc(lowerX - radius * 0.34, lowerY - radius * 0.38, radius * 0.23, 0, Math.PI * 2);
			context.fill();
		}
		context.restore();
	}

	function drawBackground() {
		if (!context) return;
		context.fillStyle = '#0b0d13';
		context.fillRect(0, 0, width, height);

		context.save();
		context.strokeStyle = 'rgba(202, 213, 223, 0.075)';
		context.lineWidth = 1;
		const grid = Math.max(36, Math.round(width / 13));
		for (let x = grid; x < width; x += grid) {
			context.beginPath();
			context.moveTo(x, 0);
			context.lineTo(x, height);
			context.stroke();
		}
		for (let y = grid; y < height; y += grid) {
			context.beginPath();
			context.moveTo(0, y);
			context.lineTo(width, y);
			context.stroke();
		}

		context.strokeStyle = 'rgba(139, 168, 188, 0.12)';
		for (let ring = 0; ring < 3; ring += 1) {
			context.beginPath();
			context.ellipse(
				width * 0.17,
				height * 0.48,
				width * (0.1 + ring * 0.027),
				height * (0.22 + ring * 0.045),
				-0.35,
				0,
				Math.PI * 2
			);
			context.stroke();
		}
		context.restore();
	}

	function draw() {
		if (!context || !canvasAvailable || width <= 1 || height <= 1) return;
		context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		context.clearRect(0, 0, width, height);
		drawBackground();

		const pivotX = width * 0.53;
		const pivotY = height * 0.24;
		const scale = Math.min(width * 0.205, height * 0.31);
		context.save();
		context.beginPath();
		context.moveTo(pivotX, pivotY + 13);
		context.lineTo(pivotX, height * 0.93);
		context.strokeStyle = 'rgba(230, 224, 211, 0.17)';
		context.lineWidth = 1;
		context.setLineDash([5, 10]);
		context.stroke();
		context.restore();

		if (activeStep >= 3) {
			drawTrail(shadowTrail, 'rgba(125, 205, 234, 0.58)', 2.1, true, scale, pivotX, pivotY);
			drawTrail(primaryTrail, 'rgba(242, 97, 63, 0.63)', 2.5, false, scale, pivotX, pivotY);
		}

		if (activeStep >= 1) {
			drawMechanism(shadowState, 'shadow', scale, pivotX, pivotY);
		}
		drawMechanism(primaryState, 'primary', scale, pivotX, pivotY);

		context.beginPath();
		context.arc(pivotX, pivotY, 8, 0, Math.PI * 2);
		context.fillStyle = '#eee5d5';
		context.fill();
		context.beginPath();
		context.arc(pivotX, pivotY, 3, 0, Math.PI * 2);
		context.fillStyle = '#52555d';
		context.fill();
		if (!ready) ready = true;
	}

	function resize() {
		if (!stageHost || !canvas || !context) return;
		const bounds = stageHost.getBoundingClientRect();
		width = Math.max(1, bounds.width);
		height = Math.max(1, bounds.height);
		pixelRatio = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.round(width * pixelRatio);
		canvas.height = Math.round(height * pixelRatio);
		draw();
	}

	function stopAnimation() {
		cancelAnimationFrame(frameId);
		frameId = 0;
	}

	function shouldAnimate() {
		return (
			!reducedMotion &&
			visible &&
			!document.hidden &&
			activeStep >= 3 &&
			simulatedTime < (activeStep === 3 ? AGREEMENT_END : LOSS_END)
		);
	}

	function scheduleAnimation() {
		if (frameId || !shouldAnimate()) return;
		frameId = requestAnimationFrame(animate);
	}

	function animate(timestamp: number) {
		frameId = 0;
		if (!shouldAnimate()) return;
		if (previousFrameTime === 0) previousFrameTime = timestamp;
		const elapsed = Math.min(0.1, Math.max(0, (timestamp - previousFrameTime) / 1000));
		previousFrameTime = timestamp;
		const speed = activeStep === 3 ? 1.6 : 2;
		const endTime = activeStep === 3 ? AGREEMENT_END : LOSS_END;
		accumulator += elapsed * speed;
		let stepsThisFrame = 0;

		while (
			accumulator >= FIXED_STEP &&
			integrationSteps * FIXED_STEP < endTime &&
			stepsThisFrame < 48
		) {
			integrateOneStep();
			accumulator -= FIXED_STEP;
			stepsThisFrame += 1;
		}
		if (stepsThisFrame === 48 && accumulator >= FIXED_STEP) accumulator = 0;

		draw();
		publishReadout(timestamp);
		scheduleAnimation();
	}

	function configureStage(index: number) {
		const next = Math.max(0, Math.min(STEPS.length - 1, index));
		activeStep = next;
		stopAnimation();
		resetStates(next >= 2);

		if (next === 3 && reducedMotion) advanceTo(5);
		if (next === 4) advanceTo(reducedMotion ? 18 : LOSS_START);
		draw();
		scheduleAnimation();
	}

	function goToStage(index: number) {
		configureStage(index);
		const target = storyRoot?.querySelector<HTMLElement>(`[data-step="${index}"]`);
		target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
	}

	onMount(() => {
		context = canvas?.getContext('2d', { alpha: false }) ?? null;
		if (!context) {
			canvasAvailable = false;
			return;
		}

		const queryReduced = new URLSearchParams(window.location.search).get('motion') === 'reduce';
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotionPreference = () => {
			const next =
				queryReduced || motionQuery.matches || document.documentElement.dataset.motion === 'still';
			if (next === reducedMotion) return;
			reducedMotion = next;
			configureStage(activeStep);
		};
		reducedMotion =
			queryReduced || motionQuery.matches || document.documentElement.dataset.motion === 'still';

		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(stageHost);

		const stepObserver = new IntersectionObserver(
			(entries) => {
				if (reducedMotion) return;
				const current = entries
					.filter((entry) => entry.isIntersecting)
					.sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
				if (!current) return;
				const index = Number((current.target as HTMLElement).dataset.step);
				if (Number.isInteger(index) && index !== activeStep) configureStage(index);
			},
			{ rootMargin: '-18% 0px -47% 0px', threshold: [0.08, 0.3, 0.58] }
		);
		storyRoot.querySelectorAll<HTMLElement>('[data-step]').forEach((step) => {
			stepObserver.observe(step);
		});

		const viewportObserver = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				if (!visible) stopAnimation();
				else {
					previousFrameTime = 0;
					scheduleAnimation();
				}
			},
			{ rootMargin: '180px 0px' }
		);
		viewportObserver.observe(storyRoot);

		const handleVisibility = () => {
			if (document.hidden) stopAnimation();
			else {
				previousFrameTime = 0;
				scheduleAnimation();
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);
		motionQuery.addEventListener('change', updateMotionPreference);
		window.addEventListener('site-motion-change', updateMotionPreference);
		const motionPreferenceObserver = new MutationObserver(updateMotionPreference);
		motionPreferenceObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});

		configureStage(0);
		resize();

		return () => {
			stopAnimation();
			resizeObserver.disconnect();
			stepObserver.disconnect();
			viewportObserver.disconnect();
			motionPreferenceObserver.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			motionQuery.removeEventListener('change', updateMotionPreference);
			window.removeEventListener('site-motion-change', updateMotionPreference);
		};
	});
</script>

<section
	bind:this={storyRoot}
	class="pendulum-story article-breakout not-prose"
	aria-labelledby="pendulum-story-title"
>
	<header class="story-header">
		<div>
			<p class="eyebrow">Guided observation · fixed-step RK4</p>
			<h2 id="pendulum-story-title">Two futures, one invisible nudge</h2>
		</div>
		<p class="introduction">
			Five short observations. Scroll normally, or use the stage controls. Nothing here captures the
			page or changes the physics clock to suit the animation.
		</p>
	</header>

	<div class="story-grid">
		<div class="visual-column">
			<div bind:this={stageHost} class="stage" data-active-step={activeStep + 1}>
				<img
					src="/images/double-pendulum-chaos.svg"
					alt={ready
						? ''
						: 'A double pendulum with warm and cool paths that begin together and later diverge'}
					width="1600"
					height="900"
					class:concealed={ready && canvasAvailable}
				/>
				{#if canvasAvailable}
					<canvas
						bind:this={canvas}
						aria-describedby="pendulum-stage-description"
						aria-label="A deterministic double-pendulum comparison. The primary future is a solid warm circle and trail; the shadow future is a dashed cool diamond and trail."
					></canvas>
				{/if}

				{#if activeStep === 2}
					<svg
						class="magnified-inset"
						viewBox="0 0 250 126"
						role="img"
						aria-labelledby="nudge-title nudge-description"
					>
						<title id="nudge-title">Magnified angular nudge</title>
						<desc id="nudge-description">
							Two rays show the one-millionth-degree difference exaggerated ten million times.
						</desc>
						<rect x="1" y="1" width="248" height="124" rx="10" />
						<path class="inset-reference" d="M125 103V20" />
						<path class="inset-primary" d="M125 103L116 23" />
						<path class="inset-shadow" d="M125 103L134 23" />
						<path class="inset-arc" d="M119 54A50 50 0 0 1 131 54" />
						<circle cx="125" cy="103" r="4" />
						<text x="14" y="18">OFFSET MAGNIFIED ×10,000,000</text>
						<text x="14" y="116">ACTUAL Δθ₁ = 0.000001°</text>
					</svg>
				{/if}

				<div class="plate-mark" aria-hidden="true">
					<span>OBSERVATION {String(activeStep + 1).padStart(2, '0')}</span>
					<span>NO RANDOM INPUT</span>
				</div>
				<div class="readouts">
					<div>
						<span>Simulated time</span>
						<output>{simulatedTime.toFixed(2)} s</output>
					</div>
					<div>
						<span>Lower-bob separation</span>
						<output>{formatDistance(separation)}</output>
					</div>
					<div class="integrator">
						<span>Integrator</span>
						<output>RK4 · Δt 1/240 s</output>
					</div>
				</div>
				<p id="pendulum-stage-description" class="sr-only">
					The simulation uses equal one-kilogram point masses, equal one-metre massless rods,
					gravity of 9.81 metres per second squared, no friction, and angles measured from downward
					vertical. The shadow differs only by the displayed perturbation from observation three
					onward.
				</p>
				<noscript>
					<p class="noscript-note">
						The animated comparison needs JavaScript. This static plate and all five observations
						remain available.
					</p>
				</noscript>
			</div>

			<div class="identity-legend" aria-label="Trajectory identities">
				<span><i class="primary-key"></i> Primary · solid circle</span>
				<span><i class="shadow-key"></i> Shadow · dashed diamond</span>
			</div>

			<nav class="stage-controls" aria-label="Guided observation controls">
				<button type="button" onclick={() => goToStage(activeStep - 1)} disabled={activeStep === 0}
					>Previous</button
				>
				<p aria-live="polite">
					Stage {activeStep + 1} of {STEPS.length}
					{#if reducedMotion}<span> · reduced motion, static states</span>{/if}
				</p>
				<button
					type="button"
					onclick={() => goToStage(activeStep + 1)}
					disabled={activeStep === STEPS.length - 1}>Next</button
				>
			</nav>
		</div>

		<div class="steps" aria-label="Five observations">
			{#each STEPS as step, index (step.title)}
				<article
					data-step={index}
					class:active={activeStep === index}
					aria-current={activeStep === index ? 'step' : undefined}
				>
					<p class="step-number">{String(index + 1).padStart(2, '0')} / {STEPS.length}</p>
					<h3>{step.title}</h3>
					<blockquote>{step.copy}</blockquote>
					<p class="step-note">{step.note}</p>
				</article>
			{/each}
		</div>
	</div>

	<footer>
		<span>Computed locally in your browser</span>
		<span>Ideal planar model · SI units internally</span>
	</footer>
</section>

<style>
	.pendulum-story {
		--warm: #f2613f;
		--cool: #83cbe5;
		--paper: #0a0c11;
		--paper-raised: #12151c;
		--ink: #f2eadc;
		--muted: #aca8a1;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		box-sizing: border-box;
		width: min(76rem, calc(100vw - 1.5rem));
		margin: 2.2rem 0 3rem;
		transform: translateX(-50%);
		border: 1px solid #3c414b;
		border-radius: 0.8rem;
		background: var(--paper);
		color: var(--ink);
		box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 18%);
		font-family: var(--font-sans);
		isolation: isolate;
	}

	.story-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(17rem, 0.75fr);
		gap: clamp(1rem, 4vw, 3rem);
		align-items: end;
		border-bottom: 1px solid #30343d;
		padding: clamp(1.2rem, 3vw, 2.2rem);
	}

	.eyebrow,
	.step-number {
		margin: 0;
		color: #e9a071;
		font: 700 0.7rem/1.3 var(--font-mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.story-header h2 {
		max-width: 14ch;
		margin: 0.5rem 0 0;
		color: #fff6e7;
		font: 760 clamp(1.9rem, 5vw, 3.8rem) / 0.98 var(--font-sans);
		letter-spacing: -0.045em;
		text-wrap: balance;
	}

	.introduction {
		max-width: 52ch;
		margin: 0;
		color: #c4c0b9;
		font: 0.95rem/1.6 var(--font-serif);
	}

	.story-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) minmax(19rem, 0.75fr);
		gap: clamp(1rem, 3vw, 2.2rem);
		align-items: start;
		padding: clamp(0.75rem, 2vw, 1.4rem);
	}

	.visual-column {
		position: sticky;
		top: 5rem;
		min-width: 0;
	}

	.stage {
		position: relative;
		width: 100%;
		min-height: 22rem;
		aspect-ratio: 16 / 10;
		overflow: hidden;
		border: 1px solid #444a55;
		border-radius: 0.55rem;
		background: #080a0f;
	}

	.stage > img,
	.stage > canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	.stage > img {
		object-fit: cover;
		transition: opacity 240ms ease;
	}

	.stage > img.concealed {
		opacity: 0;
	}

	.stage > canvas {
		z-index: 1;
	}

	.plate-mark {
		position: absolute;
		z-index: 3;
		top: 0.75rem;
		left: 0.75rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 1rem;
		color: #bcb7ae;
		font: 650 0.64rem/1.2 var(--font-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.plate-mark span:first-child {
		color: #f5ae7e;
	}

	.readouts {
		position: absolute;
		z-index: 3;
		right: 0.65rem;
		bottom: 0.65rem;
		left: 0.65rem;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		overflow: hidden;
		border: 1px solid #4c515b;
		border-radius: 0.35rem;
		background: #4c515b;
	}

	.readouts > div {
		display: grid;
		gap: 0.14rem;
		min-width: 0;
		background: rgb(8 10 15 / 94%);
		padding: 0.55rem 0.65rem;
	}

	.readouts span {
		overflow: hidden;
		color: #9c9da2;
		font: 600 0.63rem/1.2 var(--font-sans);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.readouts output {
		color: #f4ecdf;
		font: 700 0.78rem/1.2 var(--font-mono);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.magnified-inset {
		position: absolute;
		z-index: 4;
		top: 2.25rem;
		right: 0.65rem;
		width: min(15.5rem, 47%);
		filter: drop-shadow(0 0.6rem 1.5rem rgb(0 0 0 / 30%));
	}

	.magnified-inset rect {
		fill: rgb(8 11 17 / 94%);
		stroke: #5e6673;
	}

	.magnified-inset path,
	.magnified-inset circle {
		fill: none;
		stroke-linecap: round;
	}

	.magnified-inset .inset-reference {
		stroke: #8d929a;
		stroke-dasharray: 4 5;
	}

	.magnified-inset .inset-primary {
		stroke: var(--warm);
		stroke-width: 3;
	}

	.magnified-inset .inset-shadow {
		stroke: var(--cool);
		stroke-width: 3;
		stroke-dasharray: 6 5;
	}

	.magnified-inset .inset-arc {
		stroke: #f1e7d8;
		stroke-width: 1.4;
	}

	.magnified-inset circle {
		fill: #ede4d5;
		stroke: none;
	}

	.magnified-inset text {
		fill: #d6d1c8;
		font: 700 9.5px var(--font-mono);
		letter-spacing: 0.05em;
	}

	.identity-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 1rem;
		padding: 0.65rem 0.15rem 0;
		color: #aaa8a3;
		font: 0.7rem/1.4 var(--font-mono);
	}

	.identity-legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
	}

	.identity-legend i {
		display: inline-block;
		width: 0.72rem;
		height: 0.72rem;
	}

	.primary-key {
		border-radius: 999px;
		background: var(--warm);
	}

	.shadow-key {
		transform: rotate(45deg);
		border: 2px dashed var(--cool);
	}

	.stage-controls {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.55rem;
		align-items: center;
		margin-top: 0.75rem;
	}

	.stage-controls p {
		margin: 0;
		color: #aaa8a3;
		font: 0.7rem/1.35 var(--font-mono);
		text-align: center;
	}

	.stage-controls button {
		min-height: 2.75rem;
		border: 1px solid #626873;
		border-radius: 0.35rem;
		background: #171a21;
		padding: 0.55rem 0.9rem;
		color: #f2eadc;
		font: 700 0.76rem/1.2 var(--font-sans);
		cursor: pointer;
	}

	.stage-controls button:hover:not(:disabled) {
		border-color: #f19a6c;
		background: #22252d;
	}

	.stage-controls button:focus-visible {
		outline: 3px solid #f6ad7f;
		outline-offset: 3px;
	}

	.stage-controls button:disabled {
		cursor: not-allowed;
		opacity: 0.38;
	}

	.steps {
		min-width: 0;
	}

	.steps article {
		display: flex;
		min-height: 58vh;
		flex-direction: column;
		justify-content: center;
		border-top: 1px solid #30343d;
		padding: clamp(1rem, 3vw, 2rem) 0.25rem;
		opacity: 0.5;
		transition:
			opacity 180ms ease,
			transform 180ms ease;
	}

	.steps article:first-child {
		border-top: 0;
	}

	.steps article.active {
		transform: translateX(-0.25rem);
		opacity: 1;
	}

	.steps h3 {
		margin: 0.45rem 0 0;
		color: #f7eddf;
		font: 740 clamp(1.45rem, 3vw, 2.15rem) / 1.05 var(--font-sans);
		letter-spacing: -0.025em;
		text-transform: uppercase;
	}

	.steps blockquote {
		margin: 1rem 0 0;
		border: 0;
		padding: 0;
		color: #fff7ea;
		font: 650 clamp(1.15rem, 2.5vw, 1.55rem) / 1.35 var(--font-serif);
	}

	.step-note {
		max-width: 39ch;
		margin: 0.9rem 0 0;
		color: #aaa8a3;
		font: 0.84rem/1.55 var(--font-sans);
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		border-top: 1px solid #30343d;
		padding: 0.8rem clamp(0.9rem, 2vw, 1.4rem);
		color: #8f9095;
		font: 0.66rem/1.35 var(--font-mono);
		letter-spacing: 0.04em;
	}

	.noscript-note {
		position: absolute;
		z-index: 6;
		right: 0.65rem;
		bottom: 5rem;
		left: 0.65rem;
		margin: 0;
		border: 1px solid #777c84;
		background: #0a0c11;
		padding: 0.65rem;
		color: #eee5d8;
		font: 0.76rem/1.4 var(--font-sans);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 50rem) {
		.story-header {
			grid-template-columns: 1fr;
		}

		.story-header h2 {
			max-width: 16ch;
		}

		.story-grid {
			display: block;
		}

		.visual-column {
			z-index: 5;
			top: 4.25rem;
			background: var(--paper);
			padding-bottom: 0.35rem;
		}

		.stage {
			min-height: 0;
			aspect-ratio: 16 / 9.2;
		}

		.steps article {
			min-height: 47vh;
			padding-inline: 0.45rem;
		}
	}

	@media (max-width: 34rem) {
		.pendulum-story {
			border-radius: 0.55rem;
		}

		.story-header {
			padding: 1rem;
		}

		.story-grid {
			padding: 0.45rem;
		}

		.plate-mark span:last-child,
		.readouts .integrator {
			display: none;
		}

		.readouts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.readouts > div {
			padding: 0.42rem 0.5rem;
		}

		.magnified-inset {
			top: 2rem;
			width: 54%;
		}

		.identity-legend {
			font-size: 0.62rem;
		}

		.stage-controls button {
			padding-inline: 0.65rem;
		}

		.stage-controls p span {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.stage > img,
		.steps article {
			transition: none;
		}
	}

	:global(html[data-motion='still']) .stage > img,
	:global(html[data-motion='still']) .steps article {
		transition: none;
	}

	@media (forced-colors: active) {
		.pendulum-story,
		.stage,
		.readouts,
		.steps article,
		.stage-controls button {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		.stage > img,
		.stage > canvas,
		.magnified-inset {
			display: none;
		}
	}
</style>
