<script lang="ts">
	import { onMount } from 'svelte';
	import { ArtificialLifeEngine } from '$lib/visualizations/artificial-life/artificialLifeEngine';
	import {
		FIXED_TIME_STEP,
		GENERATION_WINDOW_STEPS,
		WORLD_HEIGHT,
		WORLD_WIDTH,
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
	let lastTelemetryAt = 0;
	let lastHistoryAt = -1;
	let framesSinceTelemetry = 0;
	let framesPerSecond = 0;

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

	function oldestExtantLineage() {
		if (!engine || engine.organisms.length === 0) return -1;
		let lineage = engine.organisms[0].lineageId;
		for (const organism of engine.organisms) lineage = Math.min(lineage, organism.lineageId);
		return lineage;
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
			context.beginPath();
			context.arc(food.x, food.y, 2.2 + Math.min(2.5, food.energy / 20), 0, Math.PI * 2);
			context.fillStyle = 'rgba(251, 191, 36, 0.76)';
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

		const highlightedLineage = highlightLineage ? oldestExtantLineage() : -1;
		for (const organism of engine.organisms) {
			const size = organism.genome.bodySize;
			const energyAlpha = Math.min(1, Math.max(0.38, organism.energy / 95));
			context.save();
			context.translate(organism.x, organism.y);
			context.rotate(organism.heading);
			context.beginPath();
			context.arc(0, 0, size, 0, Math.PI * 2);
			context.fillStyle = `hsla(${organism.genome.hue}, 78%, 58%, ${energyAlpha})`;
			context.fill();
			context.lineWidth = Math.max(1.2, size * 0.18);
			context.strokeStyle = `hsla(${(organism.genome.hue + 42) % 360}, 92%, 78%, 0.84)`;
			context.stroke();
			context.beginPath();
			context.arc(size * 0.2, -size * 0.12, Math.max(1.4, size * 0.26), 0, Math.PI * 2);
			context.fillStyle = 'rgba(4, 12, 16, 0.72)';
			context.fill();
			context.beginPath();
			context.moveTo(-size * 0.75, 0);
			context.quadraticCurveTo(-size * 1.55, size * 0.6, -size * 2.1, -size * 0.05);
			context.strokeStyle = `hsla(${organism.genome.hue}, 90%, 75%, 0.62)`;
			context.lineWidth = Math.max(1, size * 0.13);
			context.stroke();
			if (organism.lineageId === highlightedLineage) {
				context.beginPath();
				context.arc(0, 0, size + 4, 0, Math.PI * 2);
				context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
				context.lineWidth = 1.5;
				context.stroke();
			}
			context.restore();
		}

		for (const predator of engine.predators) {
			context.save();
			context.translate(predator.x, predator.y);
			context.rotate(predator.heading);
			context.beginPath();
			context.moveTo(predator.radius * 1.35, 0);
			context.lineTo(-predator.radius, predator.radius * 0.8);
			context.lineTo(-predator.radius * 0.52, 0);
			context.lineTo(-predator.radius, -predator.radius * 0.8);
			context.closePath();
			context.fillStyle = 'rgba(251, 113, 133, 0.72)';
			context.fill();
			context.strokeStyle = 'rgba(254, 205, 211, 0.9)';
			context.lineWidth = 2;
			context.stroke();
			context.restore();
		}

		for (const event of engine.events) {
			const progress = event.age / event.duration;
			context.beginPath();
			context.arc(event.x, event.y, 5 + progress * 18, 0, Math.PI * 2);
			context.strokeStyle =
				event.kind === 'birth'
					? `hsla(${event.hue}, 88%, 72%, ${1 - progress})`
					: `rgba(251, 146, 60, ${1 - progress})`;
			context.lineWidth = event.kind === 'birth' ? 2.4 : 1.6;
			context.stroke();
			if (event.kind === 'death') {
				for (let speck = 0; speck < 4; speck += 1) {
					const angle = (speck / 4) * Math.PI * 2 + event.hue;
					const distance = 5 + progress * 14;
					context.fillStyle = `rgba(251, 146, 60, ${0.75 * (1 - progress)})`;
					context.fillRect(
						event.x + Math.cos(angle) * distance,
						event.y + Math.sin(angle) * distance,
						2.2,
						2.2
					);
				}
			}
		}
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
		if (previousTimestamp === 0) previousTimestamp = timestamp;
		const elapsed = Math.min(0.1, Math.max(0, (timestamp - previousTimestamp) / 1000));
		previousTimestamp = timestamp;
		framesSinceTelemetry += 1;

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
				onstatus('Generation window complete: 240 deterministic simulation ticks advanced.');
				publish(true);
			}
		}

		render();
		if (timestamp - lastTelemetryAt >= 500) {
			framesPerSecond = (framesSinceTelemetry * 1000) / Math.max(1, timestamp - lastTelemetryAt);
			framesSinceTelemetry = 0;
			lastTelemetryAt = timestamp;
			publish();
		}
		animationFrame = requestAnimationFrame(frame);
	}

	function schedule() {
		cancelAnimationFrame(animationFrame);
		previousTimestamp = 0;
		lastTelemetryAt = performance.now();
		framesSinceTelemetry = 0;
		if (visible && !document.hidden && canvasEnabled) animationFrame = requestAnimationFrame(frame);
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
		if (engine) engine.setParameters(parameters);
	});

	$effect(() => {
		if (!engine || restartToken === lastRestartToken) return;
		lastRestartToken = restartToken;
		engine.restart(parameters, seed);
		history = [];
		lastHistoryAt = -1;
		stepBudget = 0;
		accumulator = 0;
		publish(true);
		render();
	});

	$effect(() => {
		if (!engine || stepToken === lastStepToken) return;
		lastStepToken = stepToken;
		stepBudget += GENERATION_WINDOW_STEPS;
		onstatus('Advancing one 240-tick generation window…');
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
				if (visible) schedule();
				else cancelAnimationFrame(animationFrame);
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
			aria-label="A living digital ecosystem. Coloured microbes forage for amber food inside a petri dish; coral predators hunt when enabled. Birth rings expand around offspring and orange specks mark deaths."
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
	<noscript>
		<img
			src={poster}
			alt="Artificial Life Lab: Evolving Microbe Garden"
			class="h-full w-full object-cover"
		/>
	</noscript>
</div>
