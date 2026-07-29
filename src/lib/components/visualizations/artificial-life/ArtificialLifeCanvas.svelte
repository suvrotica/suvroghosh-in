<script lang="ts">
	import { onMount } from 'svelte';
	import { ArtificialLifeEngine } from '$lib/visualizations/artificial-life/artificialLifeEngine';
	import {
		drawMicrobe,
		drawPredator,
		drawSimulationEvent
	} from '$lib/visualizations/artificial-life/microbeRenderer';
	import {
		FIXED_TIME_STEP,
		GENERATION_WINDOW_STEPS,
		WORLD_HEIGHT,
		WORLD_WIDTH,
		type SimulationEvent,
		type SimulationHistoryPoint,
		type SimulationParameters,
		type SimulationUpdate
	} from '$lib/visualizations/artificial-life/types';

	type Props = {
		parameters: SimulationParameters;
		seed: string;
		paused: boolean;
		restartToken: number;
		stepToken: number;
		highlightLineage: boolean;
		poster: string;
		onupdate: (update: SimulationUpdate) => void;
		onstatus: (message: string) => void;
	};

	let {
		parameters,
		seed,
		paused,
		restartToken,
		stepToken,
		highlightLineage,
		poster,
		onupdate,
		onstatus
	}: Props = $props();

	const targetRenderInterval = FIXED_TIME_STEP * 1000;
	const frameEarlyTolerance = 1;

	let canvas = $state<HTMLCanvasElement>();
	let host = $state<HTMLDivElement>();
	let canvasEnabled = $state(true);
	let engine: ArtificialLifeEngine | undefined;
	let history: SimulationHistoryPoint[] = [];
	let lastRestartToken = 0;
	let lastStepToken = 0;
	let stepBudget = 0;
	let animationFrame = 0;
	let visible = true;
	let reducedMotion = false;
	let width = 1;
	let height = 1;
	let pixelRatio = 1;
	let accumulator = 0;
	let previousTimestamp = 0;
	let nextRenderAt = 0;
	let lastTelemetryAt = 0;
	let lastHistoryAt = -1;
	let framesSinceTelemetry = 0;
	let framesPerSecond = 0;

	function visibleEvents(events: readonly SimulationEvent[]) {
		const selected: SimulationEvent[] = [];
		let feeding = 0;
		let collisions = 0;
		for (let index = events.length - 1; index >= 0 && selected.length < 24; index -= 1) {
			const event = events[index];
			if (event.kind === 'feeding' && feeding >= 6) continue;
			if (event.kind === 'collision' && collisions >= 4) continue;
			if (event.kind === 'feeding') feeding += 1;
			if (event.kind === 'collision') collisions += 1;
			selected.unshift(event);
		}
		return selected;
	}

	function publish(forceHistory = false) {
		if (!engine) return;
		const stats = engine.statistics(framesPerSecond);
		if (forceHistory || stats.simulationTime - lastHistoryAt >= 1) {
			history = [
				...history,
				{
					time: stats.simulationTime,
					population: stats.population,
					births: stats.births,
					deaths: stats.deaths
				}
			].slice(-120);
			lastHistoryAt = stats.simulationTime;
		}
		onupdate({ stats, history, distributions: engine.traitDistributions() });
	}

	function render() {
		if (!engine || !canvasEnabled || !canvas) return;
		const context = canvas.getContext('2d', { alpha: false });
		if (!context) return;
		context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		context.imageSmoothingEnabled = true;

		const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
		const offsetX = (width - WORLD_WIDTH * scale) / 2;
		const offsetY = (height - WORLD_HEIGHT * scale) / 2;

		context.fillStyle = '#05070b';
		context.fillRect(0, 0, width, height);
		context.save();
		context.translate(offsetX, offsetY);
		context.scale(scale, scale);
		context.beginPath();
		context.ellipse(
			WORLD_WIDTH / 2,
			WORLD_HEIGHT / 2,
			WORLD_WIDTH * 0.47,
			WORLD_HEIGHT * 0.43,
			0,
			0,
			Math.PI * 2
		);
		context.clip();

		const dishGradient = context.createRadialGradient(
			WORLD_WIDTH * 0.44,
			WORLD_HEIGHT * 0.38,
			20,
			WORLD_WIDTH / 2,
			WORLD_HEIGHT / 2,
			WORLD_WIDTH * 0.54
		);
		dishGradient.addColorStop(0, '#10231f');
		dishGradient.addColorStop(0.58, '#091514');
		dishGradient.addColorStop(1, '#030708');
		context.fillStyle = dishGradient;
		context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

		context.strokeStyle = 'rgba(103, 232, 249, 0.075)';
		context.lineWidth = 1;
		for (let ring = 1; ring < 5; ring += 1) {
			context.beginPath();
			context.ellipse(
				WORLD_WIDTH / 2,
				WORLD_HEIGHT / 2,
				(WORLD_WIDTH * 0.47 * ring) / 5,
				(WORLD_HEIGHT * 0.43 * ring) / 5,
				0,
				0,
				Math.PI * 2
			);
			context.stroke();
		}

		for (const food of engine.food) {
			const foodHue = 42 + (food.id % 4) * 19;
			const foodRadius = 2.4 + Math.min(2.8, food.energy / 18);
			context.beginPath();
			context.arc(food.x, food.y, foodRadius + 3, 0, Math.PI * 2);
			context.fillStyle = `hsla(${foodHue}, 96%, 60%, 0.1)`;
			context.fill();
			context.beginPath();
			context.arc(food.x, food.y, foodRadius, 0, Math.PI * 2);
			context.fillStyle = `hsla(${foodHue}, 92%, 62%, 0.82)`;
			context.fill();
			context.beginPath();
			context.arc(
				food.x - foodRadius * 0.25,
				food.y - foodRadius * 0.3,
				foodRadius * 0.28,
				0,
				Math.PI * 2
			);
			context.fillStyle = 'rgba(255, 251, 235, 0.86)';
			context.fill();
		}

		if (!reducedMotion) {
			context.lineCap = 'round';
			for (const organism of engine.organisms) {
				context.beginPath();
				context.moveTo(organism.previousX, organism.previousY);
				context.lineTo(organism.x, organism.y);
				context.strokeStyle = `hsla(${organism.genome.hue}, 84%, 66%, 0.22)`;
				context.lineWidth = Math.max(1, organism.genome.bodySize * 0.42);
				context.stroke();
			}
		}

		const highlightedLineage = highlightLineage ? engine.lineageSelection.id : null;
		const crowdingScale = Math.max(0.78, Math.min(1.18, 1.24 - engine.organisms.length / 1050));
		for (const organism of engine.organisms) {
			drawMicrobe(
				context,
				organism,
				parameters,
				engine.simulationTime,
				crowdingScale,
				reducedMotion,
				organism.lineageId === highlightedLineage
			);
		}

		for (const predator of engine.predators) {
			drawPredator(context, predator, engine.simulationTime, reducedMotion);
		}

		for (const event of visibleEvents(engine.events)) drawSimulationEvent(context, event);
		context.restore();

		context.save();
		context.translate(offsetX, offsetY);
		context.scale(scale, scale);
		context.beginPath();
		context.ellipse(
			WORLD_WIDTH / 2,
			WORLD_HEIGHT / 2,
			WORLD_WIDTH * 0.47,
			WORLD_HEIGHT * 0.43,
			0,
			0,
			Math.PI * 2
		);
		context.strokeStyle = 'rgba(165, 243, 252, 0.36)';
		context.lineWidth = 4;
		context.stroke();
		context.restore();
	}

	function frame(timestamp: number) {
		if (!engine || !visible || document.hidden) return;
		if (nextRenderAt > 0 && timestamp + frameEarlyTolerance < nextRenderAt) {
			animationFrame = requestAnimationFrame(frame);
			return;
		}

		if (nextRenderAt === 0) nextRenderAt = timestamp;
		const lateness = Math.max(0, timestamp - nextRenderAt);
		nextRenderAt += (Math.floor(lateness / targetRenderInterval) + 1) * targetRenderInterval;

		if (previousTimestamp === 0) previousTimestamp = timestamp;
		const elapsed = Math.min(0.1, Math.max(0, (timestamp - previousTimestamp) / 1000));
		previousTimestamp = timestamp;
		framesSinceTelemetry += 1;
		let advanceCompleted = false;

		if (!paused) {
			accumulator += elapsed * parameters.simulationSpeed;
			let steps = 0;
			while (accumulator >= FIXED_TIME_STEP && steps < 8) {
				engine.step(FIXED_TIME_STEP);
				accumulator -= FIXED_TIME_STEP;
				steps += 1;
			}
			if (steps === 8) accumulator = 0;
		} else if (stepBudget > 0) {
			const steps = Math.min(12, stepBudget);
			engine.stepMany(steps, FIXED_TIME_STEP);
			stepBudget -= steps;
			if (stepBudget === 0) {
				onstatus('Advance complete: 8 simulated seconds (240 fixed ticks).');
				advanceCompleted = true;
			}
		}

		render();
		if (advanceCompleted) {
			framesPerSecond = 0;
			framesSinceTelemetry = 0;
			lastTelemetryAt = timestamp;
			publish(true);
			animationFrame = 0;
			return;
		}
		if (timestamp - lastTelemetryAt >= 500) {
			framesPerSecond = (framesSinceTelemetry * 1000) / Math.max(1, timestamp - lastTelemetryAt);
			framesSinceTelemetry = 0;
			lastTelemetryAt = timestamp;
			publish();
		}
		animationFrame = !paused || stepBudget > 0 ? requestAnimationFrame(frame) : 0;
	}

	function schedule() {
		cancelAnimationFrame(animationFrame);
		animationFrame = 0;
		previousTimestamp = 0;
		nextRenderAt = 0;
		lastTelemetryAt = performance.now();
		framesSinceTelemetry = 0;
		if (visible && !document.hidden && canvasEnabled && (!paused || stepBudget > 0)) {
			animationFrame = requestAnimationFrame(frame);
		} else if (framesPerSecond !== 0) {
			framesPerSecond = 0;
			publish();
		}
	}

	function resize() {
		if (!host || !canvas) return;
		const bounds = host.getBoundingClientRect();
		width = Math.max(1, bounds.width);
		height = Math.max(1, bounds.height);
		pixelRatio = Math.min(1.5, window.devicePixelRatio || 1);
		canvas.width = Math.round(width * pixelRatio);
		canvas.height = Math.round(height * pixelRatio);
		render();
	}

	$effect(() => {
		const currentParameters = parameters;
		if (engine) {
			engine.setParameters(currentParameters);
			if (paused) render();
		}
	});

	$effect(() => {
		const isPaused = paused;
		if (!engine) return;
		if (isPaused && stepBudget === 0) {
			schedule();
			render();
			return;
		}
		schedule();
	});

	$effect(() => {
		const highlighted = highlightLineage;
		if (engine && paused) {
			void highlighted;
			render();
		}
	});

	$effect(() => {
		const currentRestartToken = restartToken;
		const currentParameters = parameters;
		const currentSeed = seed;
		if (!engine || currentRestartToken === lastRestartToken) return;
		lastRestartToken = currentRestartToken;
		engine.restart(currentParameters, currentSeed);
		history = [];
		lastHistoryAt = -1;
		stepBudget = 0;
		accumulator = 0;
		publish(true);
		render();
	});

	$effect(() => {
		const currentStepToken = stepToken;
		if (!engine || currentStepToken === lastStepToken) return;
		lastStepToken = currentStepToken;
		stepBudget += GENERATION_WINDOW_STEPS;
		onstatus('Advancing 8 simulated seconds (240 fixed ticks)…');
		schedule();
	});

	onMount(() => {
		const query = new URLSearchParams(window.location.search);
		canvasEnabled = query.get('canvas') !== 'off';
		reducedMotion =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			query.get('motion') === 'reduce';
		if (!canvasEnabled) {
			onstatus('Canvas rendering is disabled; showing the static poster fallback.');
			return;
		}
		if (!canvas?.getContext('2d')) {
			canvasEnabled = false;
			onstatus('Canvas 2D is unavailable; showing the static poster fallback.');
			return;
		}

		lastRestartToken = restartToken;
		lastStepToken = stepToken;
		engine = new ArtificialLifeEngine(parameters, seed);
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(host!);
		const intersectionObserver = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				schedule();
			},
			{ rootMargin: '120px' }
		);
		intersectionObserver.observe(host!);
		const handleVisibility = () => schedule();
		document.addEventListener('visibilitychange', handleVisibility);
		resize();
		publish(true);
		schedule();

		return () => {
			cancelAnimationFrame(animationFrame);
			resizeObserver.disconnect();
			intersectionObserver.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});
</script>

<div
	bind:this={host}
	class="relative aspect-[16/10] min-h-72 overflow-hidden bg-neutral-950 sm:min-h-96"
>
	{#if canvasEnabled}
		<canvas
			bind:this={canvas}
			class="block h-full w-full"
			data-render-frame-cap="30"
			data-simulation-state={paused ? 'paused' : 'running'}
			aria-label="A living digital ecosystem. Inherited traits visibly change each microbe's body shape, cilia, flagella, armour, internal organelles, and colour. Young microbes are small and translucent; adults are vivid; elders become pale and scarred. Gold gulps mark feeding, cyan ripples mark collisions, bright rings mark births, and coral hunters visibly swallow prey."
		>
			<img src={poster} alt="Static poster for the Evolving Microbe Garden" />
		</canvas>
	{:else}
		<img
			src={poster}
			alt="Artificial Life Lab: Evolving Microbe Garden, shown because Canvas is unavailable or disabled"
			class="h-full w-full object-cover"
		/>
	{/if}
	<div
		class="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap justify-center gap-x-3 gap-y-1 rounded-md bg-black/70 px-2 py-1 font-mono text-[10px] tracking-wide text-neutral-200 uppercase backdrop-blur-sm sm:text-[11px]"
		role="list"
		aria-label="Visual event legend"
	>
		<span role="listitem"><span class="text-amber-300">●</span> gulp</span>
		<span role="listitem"><span class="text-cyan-300">◎</span> bump</span>
		<span role="listitem"><span class="text-emerald-300">◎</span> birth</span>
		<span role="listitem"><span class="text-rose-300">◆</span> hunted</span>
		<span role="listitem" class="hidden sm:inline"
			>young translucent → adult vivid → elder pale</span
		>
	</div>
	<noscript>
		<img
			src={poster}
			alt="Artificial Life Lab: Evolving Microbe Garden"
			class="h-full w-full object-cover"
		/>
	</noscript>
</div>
