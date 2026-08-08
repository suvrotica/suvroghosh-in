<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BZCpuSolver,
		BZ_SCHEMA_VERSION,
		activeAreaMetrics,
		assessBZTimestep,
		cloneBZFieldState,
		createInitialBZField,
		recoveredStateForSetup
	} from '$lib/visualizations/bz';
	import { renderBZToCanvas } from '$lib/visualizations/bz/display';
	import type {
		BZFieldMetrics,
		BZFieldState,
		BZIntervention,
		BZPalette,
		BZSetup,
		BZViewMode,
		ActiveTerms,
		ProbeReading
	} from '$lib/visualizations/bz';
	import type { BZGpuEngine } from '$lib/visualizations/bz/gpu';

	export type BZTool =
		| 'probe'
		| 'excite'
		| 'inhibit'
		| 'cut'
		| 'pacemaker'
		| 'obstacle'
		| 'restore';
	export type BZEngineKind = 'gpu-f16' | 'gpu-f32' | 'cpu-f64';
	export type BZStageCommand =
		| 'toggle-running'
		| 'reset'
		| 'step'
		| 'radius-down'
		| 'radius-up'
		| 'tool-probe'
		| 'tool-excite'
		| 'tool-inhibit'
		| 'tool-cut'
		| 'cancel';
	export type BZStageFrame = {
		field: Readonly<BZFieldState>;
		setup: Readonly<BZSetup>;
		step: number;
		modelTime: number;
		engine: BZEngineKind;
		stepsPerSecond: number;
		metrics: BZFieldMetrics;
		interventions: readonly BZIntervention[];
	};

	type Point = readonly [number, number];
	type Props = {
		setup: BZSetup;
		running?: boolean;
		workPerSecond?: number;
		view?: BZViewMode;
		palette?: BZPalette;
		tool?: BZTool;
		brushRadius?: number;
		activeTerms?: ActiveTerms;
		selected?: Point;
		description?: string;
		onframe?: (frame: BZStageFrame) => void;
		onstatus?: (message: string, engine: BZEngineKind, failure: boolean) => void;
		onprobe?: (reading: ProbeReading, point: Point) => void;
		onintervention?: (event: BZIntervention) => void;
		oncommand?: (command: BZStageCommand) => void;
		onselect?: (point: Point) => void;
	};

	let {
		setup,
		running = false,
		workPerSecond = 480,
		view = 'dish',
		palette = 'ferroin',
		tool = 'probe',
		brushRadius = 0.045,
		activeTerms = { reaction: true, diffusion: true },
		selected = [0.5, 0.5],
		description = 'A circular numerical BZ dish. Arrow keys move the probe; Enter applies the selected instrument.',
		onframe,
		onstatus,
		onprobe,
		onintervention,
		oncommand,
		onselect
	}: Props = $props();

	let root = $state<HTMLElement>();
	let cpuCanvas = $state<HTMLCanvasElement>();
	let gpuCanvas = $state<HTMLCanvasElement>();
	let overlayCanvas = $state<HTMLCanvasElement>();
	let sourceCanvas: HTMLCanvasElement | null = null;
	let cpuContext: CanvasRenderingContext2D | null = null;
	let overlayContext: CanvasRenderingContext2D | null = null;
	let gpu = $state.raw<BZGpuEngine | null>(null);
	let solver: BZCpuSolver | null = null;
	let effectiveSetup = $state<BZSetup | null>(null);
	let engine = $state<BZEngineKind>('cpu-f64');
	let engineMessage = $state('Preparing the numerical engine.');
	let failureMessage = $state('');
	let ready = $state(false);
	let fieldRevision = $state(0);
	let animationFrame = 0;
	let lastFrameAt = 0;
	let workCarry = 0;
	let lastRateAt = 0;
	let rateStepBaseline = 0;
	let measuredRate = 0;
	let lastPublishedAt = 0;
	let previousRunning = false;
	let setupSignature = '';
	let offscreen = false;
	let disposed = false;
	let mounted = $state(false);
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let contextRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
	let pointerStart: Point | null = null;
	let pointerNow = $state<Point | null>(null);
	let drawing = false;
	let eventSequence = 0;
	let eventLog: BZIntervention[] = [];

	$effect(() => {
		view.toString();
		palette.toString();
		fieldRevision.toString();
		drawCpu();
		renderGpu();
	});

	$effect(() => {
		selected[0].toString();
		selected[1].toString();
		brushRadius.toString();
		tool.toString();
		pointerNow?.[0].toString();
		drawOverlay();
	});

	$effect(() => {
		const signature = JSON.stringify({ setup, activeTerms });
		if (!mounted || signature === setupSignature) return;
		setupSignature = signature;
		reset();
	});

	$effect(() => {
		if (running && ready && !failureMessage) startLoop();
		else stopLoop();
		// A CPU frame can finish a sizeable fixed-step batch after the last throttled
		// readout. Publish the exact stopped state so Pause is a visible model-time barrier.
		if (previousRunning && !running && ready) publishFrame(true);
		previousRunning = running;
	});

	onMount(() => {
		disposed = false;
		mounted = true;
		setupSignature = JSON.stringify({ setup, activeTerms });
		cpuContext = cpuCanvas?.getContext('2d', { alpha: false }) ?? null;
		overlayContext = overlayCanvas?.getContext('2d') ?? null;
		sourceCanvas = document.createElement('canvas');
		resizeObserver = new ResizeObserver(resizeCanvases);
		if (root) resizeObserver.observe(root);
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				offscreen = !entries.some((entry) => entry.isIntersecting);
				if (offscreen) stopLoop();
				else if (running) startLoop();
			},
			{ rootMargin: '180px 0px', threshold: 0.01 }
		);
		if (root) intersectionObserver.observe(root);
		document.addEventListener('visibilitychange', handleVisibility);
		void initialize();
		resizeCanvases();
		return () => {
			disposed = true;
			mounted = false;
			stopLoop();
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			clearContextRecoveryTimer();
			gpu?.dispose();
			gpu = null;
			solver = null;
			sourceCanvas = null;
			cpuContext = null;
			overlayContext = null;
		};
	});

	async function initialize(
		replayEvents: readonly BZIntervention[] = [],
		targetStep = 0
	): Promise<void> {
		stopLoop();
		ready = false;
		failureMessage = '';
		const forceCpu =
			new URLSearchParams(window.location.search).get('bz_backend') === 'cpu' ||
			new URLSearchParams(window.location.search).get('webgl') === 'off';
		const completeTerms = activeTerms.reaction && activeTerms.diffusion;
		if (!forceCpu && completeTerms && gpuCanvas) {
			try {
				gpu?.dispose();
				const module = await import('$lib/visualizations/bz/gpu');
				if (disposed) return;
				gpu = new module.BZGpuEngine(gpuCanvas, {
					callbacks: {
						onContextLost: (clock) => {
							engineMessage = `The WebGL context was interrupted at step ${clock.step.toLocaleString()}; model time is paused while float resources recover.`;
							stopLoop();
							clearContextRecoveryTimer();
							contextRecoveryTimer = setTimeout(() => {
								contextRecoveryTimer = null;
								if (disposed || !gpu?.isContextLost) return;
								initializeCpu(
									'The WebGL context did not restore in 1.5 seconds.',
									eventLog,
									clock.step
								);
							}, 1_500);
						},
						onContextRestored: (result) => {
							clearContextRecoveryTimer();
							if (!result.recovered) {
								initializeCpu(result.reason, eventLog, result.checkpointStep);
								return;
							}
							engineMessage = `${result.reason} Recovery resumed from explicit checkpoint step ${result.checkpointStep.toLocaleString()}.`;
							renderGpu();
							publishFrame(true);
							if (running) startLoop();
						}
					}
				});
				const initial = createInitialBZField(setup);
				gpu.initialize(setup, initial);
				effectiveSetup = { ...setup, parameters: { ...setup.parameters } } as BZSetup;
				solver = null;
				eventLog = [...replayEvents];
				eventSequence = eventLog.reduce(
					(maximum, event) => Math.max(maximum, event.sequence + 1),
					0
				);
				engine = gpu.precision.textureFormat === 'RGBA32F' ? 'gpu-f32' : 'gpu-f16';
				ready = true;
				engineMessage = `${gpu.capabilities.message} Raw float Heun passes are active at ${setup.gridSize} × ${setup.gridSize}; the CPU Float64 path remains the deterministic reference.`;
				onstatus?.(engineMessage, engine, false);
				resizeCanvases();
				if (targetStep > 0) gpu.advance(targetStep, eventLog);
				renderGpu();
				publishFrame(true);
				if (running) startLoop();
				return;
			} catch (error) {
				gpu?.dispose();
				gpu = null;
				const reason =
					error instanceof Error
						? error.message
						: 'Floating-point WebGL2 computation is unavailable.';
				initializeCpu(reason, replayEvents, targetStep);
				return;
			}
		}
		initializeCpu(
			forceCpu
				? 'WebGL computation was disabled for this run.'
				: 'Term-isolation experiments use the Float64 reference so the GPU kernel remains the exact full-equation contract.',
			replayEvents,
			targetStep
		);
	}

	function fallbackSetup(source: Readonly<BZSetup>): BZSetup {
		const maximum = 64;
		return source.gridSize > maximum
			? ({ ...source, gridSize: maximum } as BZSetup)
			: ({ ...source } as BZSetup);
	}

	function initializeCpu(
		reason: string,
		replayEvents: readonly BZIntervention[] = [],
		targetStep = 0
	) {
		try {
			clearContextRecoveryTimer();
			gpu?.dispose();
			gpu = null;
			const nextSetup = fallbackSetup(setup);
			effectiveSetup = nextSetup;
			solver = new BZCpuSolver(nextSetup, { interventions: replayEvents, activeTerms });
			if (targetStep > 0) solver.step(targetStep);
			eventLog = [...replayEvents];
			eventSequence = eventLog.reduce((maximum, event) => Math.max(maximum, event.sequence + 1), 0);
			engine = 'cpu-f64';
			failureMessage = '';
			ready = true;
			fieldRevision += 1;
			const reduction =
				nextSetup.gridSize === setup.gridSize
					? `${nextSetup.gridSize} × ${nextSetup.gridSize}`
					: `${nextSetup.gridSize} × ${nextSetup.gridSize}, reduced from ${setup.gridSize} × ${setup.gridSize}`;
			engineMessage = `${reason} The deterministic Float64 CPU reference runs fixed-step Heun integration at ${reduction}; this is a same-seed reconstruction, not the requested-grid trajectory.`;
			onstatus?.(engineMessage, engine, false);
			drawCpu();
			publishFrame(true);
		} catch (error) {
			failureMessage =
				error instanceof Error ? error.message : 'The CPU reference could not initialise.';
			engineMessage = 'The numerical field could not be prepared.';
			ready = false;
			onstatus?.(`${engineMessage} ${failureMessage}`, engine, true);
		}
	}

	function clearContextRecoveryTimer() {
		if (contextRecoveryTimer !== null) clearTimeout(contextRecoveryTimer);
		contextRecoveryTimer = null;
	}

	function handleVisibility() {
		if (document.hidden) stopLoop();
		else if (running && !offscreen) startLoop();
	}

	function shouldRun() {
		return running && ready && !failureMessage && !document.hidden && !offscreen;
	}

	function startLoop() {
		if (animationFrame || !shouldRun()) return;
		lastFrameAt = performance.now();
		animationFrame = requestAnimationFrame(loop);
	}

	function stopLoop() {
		if (animationFrame) cancelAnimationFrame(animationFrame);
		animationFrame = 0;
	}

	function loop(now: number) {
		animationFrame = 0;
		if (!shouldRun()) return;
		const elapsed = Math.min(0.1, Math.max(0, (now - lastFrameAt) / 1000));
		lastFrameAt = now;
		const pending = Math.min(40, workCarry + elapsed * Math.max(0, workPerSecond));
		const work = Math.min(20, Math.floor(pending + 1e-9));
		workCarry = pending - work;
		if (work > 0) advance(work);
		updateRate(now);
		if (now - lastPublishedAt > 180) publishFrame(false);
		animationFrame = requestAnimationFrame(loop);
	}

	function updateRate(now: number) {
		const step = currentStep();
		if (lastRateAt === 0) {
			lastRateAt = now;
			rateStepBaseline = step;
			return;
		}
		if (now - lastRateAt < 700) return;
		measuredRate = ((step - rateStepBaseline) * 1000) / (now - lastRateAt);
		lastRateAt = now;
		rateStepBaseline = step;
	}

	function advance(count: number) {
		if ((!solver && !gpu) || !effectiveSetup || count < 1) return;
		try {
			const assessment = assessBZTimestep(effectiveSetup);
			if (assessment.state === 'unsafe') {
				throw new Error(`Unsafe fixed timestep refused. ${assessment.reasons.join(' ')}`);
			}
			if (gpu) {
				gpu.advance(count, eventLog);
				renderGpu();
			} else {
				solver!.step(count);
			}
			fieldRevision += 1;
			drawCpu();
		} catch (error) {
			failureMessage =
				error instanceof Error ? error.message : 'The solver reached a non-finite state.';
			engineMessage = `Numerical failure at step ${currentStep()}. State was stopped rather than clamped or repaired.`;
			stopLoop();
			onstatus?.(`${engineMessage} ${failureMessage}`, engine, true);
			publishFrame(false);
		}
	}

	function currentStep() {
		return gpu?.clock.step ?? solver?.stepIndex ?? 0;
	}

	function publishFrame(force = false) {
		if ((!solver && !gpu) || !effectiveSetup || !ready) return;
		const now = typeof performance === 'undefined' ? 0 : performance.now();
		if (!force && now - lastPublishedAt < 120) return;
		lastPublishedAt = now;
		try {
			const field = gpu ? gpu.readState(true) : solver!.state;
			const modelTime = gpu?.clock.modelTime ?? solver!.modelTime;
			onframe?.({
				field,
				setup: effectiveSetup,
				step: currentStep(),
				modelTime,
				engine,
				stepsPerSecond: measuredRate,
				metrics: activeAreaMetrics(field),
				interventions: [...eventLog]
			});
		} catch (error) {
			engineMessage = error instanceof Error ? error.message : 'Field diagnostics failed.';
		}
	}

	function resizeCanvases() {
		if (!root || !cpuCanvas || !gpuCanvas || !overlayCanvas) return;
		const bounds = root.getBoundingClientRect();
		const density = Math.min(window.devicePixelRatio || 1, 1.5);
		const width = Math.max(1, Math.round(bounds.width * density));
		const height = Math.max(1, Math.round(bounds.height * density));
		for (const canvas of [cpuCanvas, overlayCanvas]) {
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
		}
		if (gpu) {
			gpu.setDisplaySize(bounds.width, bounds.height, density);
		} else if (gpuCanvas.width !== width || gpuCanvas.height !== height) {
			gpuCanvas.width = width;
			gpuCanvas.height = height;
		}
		drawCpu();
		renderGpu();
		drawOverlay();
	}

	function drawCpu() {
		if (!cpuCanvas || !cpuContext || !sourceCanvas || !solver || !effectiveSetup) return;
		renderBZToCanvas(sourceCanvas, solver.state, effectiveSetup, { view, palette });
		cpuContext.imageSmoothingEnabled = true;
		cpuContext.fillStyle = '#080a0d';
		cpuContext.fillRect(0, 0, cpuCanvas.width, cpuCanvas.height);
		cpuContext.drawImage(sourceCanvas, 0, 0, cpuCanvas.width, cpuCanvas.height);
	}

	function renderGpu() {
		if (!gpu) return;
		try {
			gpu.render({ view, palette, diagnosticScale: 1, exposure: 1, gamma: 1, glass: true });
		} catch (error) {
			engineMessage = error instanceof Error ? error.message : 'The GPU display pass failed.';
		}
	}

	function drawOverlay() {
		if (!overlayCanvas || !overlayContext) return;
		const context = overlayContext;
		context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
		const density = overlayCanvas.width / Math.max(1, overlayCanvas.getBoundingClientRect().width);
		const point = pointerNow ?? selected;
		const x = point[0] * overlayCanvas.width;
		const y = point[1] * overlayCanvas.height;
		const radius = brushRadius * Math.min(overlayCanvas.width, overlayCanvas.height);
		context.save();
		context.strokeStyle = tool === 'probe' ? '#fff6d7' : '#ffcf5a';
		context.fillStyle = 'rgba(255, 207, 90, 0.08)';
		context.lineWidth = Math.max(1.5 * density, overlayCanvas.width / 420);
		context.setLineDash(tool === 'probe' ? [] : [5 * density, 4 * density]);
		context.beginPath();
		context.arc(
			x,
			y,
			tool === 'probe' ? Math.max(6 * density, radius * 0.3) : radius,
			0,
			Math.PI * 2
		);
		context.fill();
		context.stroke();
		context.setLineDash([]);
		if (tool === 'probe') {
			context.beginPath();
			context.moveTo(x - 11 * density, y);
			context.lineTo(x + 11 * density, y);
			context.moveTo(x, y - 11 * density);
			context.lineTo(x, y + 11 * density);
			context.stroke();
		}
		if (drawing && pointerStart && pointerNow && ['cut', 'obstacle', 'restore'].includes(tool)) {
			context.strokeStyle = '#fff6d7';
			context.lineWidth = Math.max(2 * density, radius * 2);
			context.globalAlpha = 0.45;
			context.beginPath();
			context.moveTo(pointerStart[0] * overlayCanvas.width, pointerStart[1] * overlayCanvas.height);
			context.lineTo(pointerNow[0] * overlayCanvas.width, pointerNow[1] * overlayCanvas.height);
			context.stroke();
		}
		context.restore();
	}

	function pointFromPointer(event: PointerEvent): Point {
		if (!overlayCanvas) return selected;
		const bounds = overlayCanvas.getBoundingClientRect();
		return [
			Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
			Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
		];
	}

	function sampleProbe(point: Point): ProbeReading | null {
		if (gpu) return gpu.readPoint(point);
		if (!solver) return null;
		const column = Math.min(solver.state.size - 1, Math.floor(point[0] * solver.state.size));
		const row = Math.min(solver.state.size - 1, Math.floor(point[1] * solver.state.size));
		const index = row * solver.state.size + column;
		const active = Boolean(solver.state.mask[index]);
		return {
			row,
			column,
			index,
			active,
			u: active ? solver.state.u[index] : null,
			v: active ? solver.state.v[index] : null
		};
	}

	function createIntervention(from: Point, to: Point): BZIntervention {
		const base = {
			schemaVersion: BZ_SCHEMA_VERSION,
			sequence: eventSequence,
			step: currentStep()
		} as const;
		if (tool === 'probe') return { ...base, kind: 'probe', point: to };
		if (tool === 'excite')
			return { ...base, kind: 'excite', center: to, radius: brushRadius, amount: 0.42 };
		if (tool === 'inhibit')
			return { ...base, kind: 'inhibit', center: to, radius: brushRadius, amount: 0.12 };
		if (tool === 'pacemaker') {
			const periodSteps = Math.max(
				1,
				Math.round(0.8 / Math.max(1e-8, effectiveSetup?.timestep ?? setup.timestep))
			);
			return {
				...base,
				kind: 'pacemaker',
				center: to,
				radius: brushRadius,
				amount: 0.42,
				periodSteps,
				endStep: currentStep() + periodSteps * 8
			};
		}
		if (tool === 'obstacle')
			return { ...base, kind: 'obstacle', from, to, radius: brushRadius * 0.55 };
		if (tool === 'restore') {
			return {
				...base,
				kind: 'restore',
				from,
				to,
				radius: brushRadius * 0.55,
				initialization: 'neighbor-mean'
			};
		}
		const recovered = recoveredStateForSetup(effectiveSetup ?? setup);
		return {
			...base,
			kind: 'cut',
			from,
			to,
			width: brushRadius * 0.42,
			targetU: recovered.u,
			targetV: recovered.v,
			strength: 1
		};
	}

	function applyTool(from: Point, to: Point) {
		if (!solver && !gpu) return;
		const event = createIntervention(from, to);
		eventSequence += 1;
		eventLog = [...eventLog, event];
		solver?.appendIntervention(event);
		onintervention?.(event);
		if (event.kind === 'probe') {
			const reading = sampleProbe(event.point);
			if (reading) onprobe?.(reading, event.point);
			publishFrame(true);
			return;
		}
		// The event contract applies immediately before its numbered model step.
		// Paused experiments therefore advance one fixed step so the edit is visible.
		if (!running) advance(1);
		publishFrame(true);
	}

	function handlePointerDown(event: PointerEvent) {
		if (!ready || failureMessage) return;
		const point = pointFromPointer(event);
		pointerStart = point;
		pointerNow = point;
		onselect?.(point);
		if (!['cut', 'obstacle', 'restore'].includes(tool)) {
			applyTool(point, point);
			pointerStart = null;
			return;
		}
		drawing = true;
		overlayCanvas?.setPointerCapture(event.pointerId);
		drawOverlay();
	}

	function handlePointerMove(event: PointerEvent) {
		pointerNow = pointFromPointer(event);
		drawOverlay();
	}

	function handlePointerLeave() {
		if (!drawing) pointerNow = null;
	}

	function handlePointerEnd(event: PointerEvent) {
		if (drawing && pointerStart) {
			const point = pointFromPointer(event);
			onselect?.(point);
			applyTool(pointerStart, point);
		}
		if (overlayCanvas?.hasPointerCapture(event.pointerId))
			overlayCanvas.releasePointerCapture(event.pointerId);
		drawing = false;
		pointerStart = null;
		pointerNow = null;
		drawOverlay();
	}

	function handleKeydown(event: KeyboardEvent) {
		const cell = 1 / Math.max(2, effectiveSetup?.gridSize ?? setup.gridSize);
		let next: Point | null = null;
		if (event.key === 'ArrowLeft') next = [Math.max(0, selected[0] - cell), selected[1]];
		if (event.key === 'ArrowRight') next = [Math.min(1, selected[0] + cell), selected[1]];
		if (event.key === 'ArrowUp') next = [selected[0], Math.max(0, selected[1] - cell)];
		if (event.key === 'ArrowDown') next = [selected[0], Math.min(1, selected[1] + cell)];
		if (next) {
			event.preventDefault();
			onselect?.(next);
			if (tool === 'probe') {
				const reading = sampleProbe(next);
				if (reading) onprobe?.(reading, next);
			}
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			applyTool(selected, selected);
		}
		const command =
			event.key === ' '
				? 'toggle-running'
				: event.key.toLowerCase() === 'r'
					? 'reset'
					: event.key === '.'
						? 'step'
						: event.key === '['
							? 'radius-down'
							: event.key === ']'
								? 'radius-up'
								: event.key === '1'
									? 'tool-probe'
									: event.key === '2'
										? 'tool-excite'
										: event.key === '3'
											? 'tool-inhibit'
											: event.key === '4'
												? 'tool-cut'
												: event.key === 'Escape'
													? 'cancel'
													: null;
		if (command) {
			event.preventDefault();
			oncommand?.(command as BZStageCommand);
		}
	}

	export function reset(): void {
		stopLoop();
		workCarry = 0;
		lastRateAt = 0;
		measuredRate = 0;
		void initialize();
	}

	export function manualStep(count = 1): void {
		if (!Number.isSafeInteger(count) || count < 1) return;
		advance(count);
		publishFrame(true);
	}

	export function stir(fraction = 1): void {
		if (!solver && !gpu) return;
		const event: BZIntervention = {
			schemaVersion: BZ_SCHEMA_VERSION,
			sequence: eventSequence,
			step: currentStep(),
			kind: 'mix',
			fraction: Math.max(0, Math.min(1, fraction))
		};
		eventSequence += 1;
		eventLog = [...eventLog, event];
		solver?.appendIntervention(event);
		onintervention?.(event);
		advance(1);
		publishFrame(true);
	}

	export async function replay(
		targetStep = currentStep(),
		events: readonly BZIntervention[] = eventLog
	): Promise<void> {
		await initialize(events, 0);
		const target = Math.max(0, Math.round(targetStep));
		while (!disposed && (solver || gpu) && currentStep() < target) {
			advance(Math.min(gpu ? 256 : 64, target - currentStep()));
			if (currentStep() % 512 === 0)
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}
		publishFrame(true);
	}

	export function snapshot(): BZFieldState | null {
		if (gpu) return gpu.readState(true);
		return solver ? cloneBZFieldState(solver.state) : null;
	}

	export function interventions(): readonly BZIntervention[] {
		return [...eventLog];
	}

	export function stepIndex(): number {
		return currentStep();
	}

	export function focus(): void {
		overlayCanvas?.focus();
	}
</script>

<div class="stage-shell">
	<div
		class="stage"
		class:ready
		class:gpu-active={Boolean(gpu)}
		class:failed={Boolean(failureMessage)}
		bind:this={root}
		data-engine={engine}
		data-testid="bz-stage"
	>
		<img
			class="poster"
			src="/images/visualizations/belousov-zhabotinsky/bz-laboratory-poster.png"
			alt=""
			aria-hidden="true"
		/>
		<canvas bind:this={gpuCanvas} class="gpu-canvas" aria-hidden="true"></canvas>
		<canvas bind:this={cpuCanvas} class="cpu-canvas" aria-hidden="true"></canvas>
		<canvas
			bind:this={overlayCanvas}
			class="overlay-canvas"
			class:painting={tool !== 'probe'}
			tabindex="0"
			aria-label={description}
			aria-describedby="bz-stage-instructions"
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerleave={handlePointerLeave}
			onpointerup={handlePointerEnd}
			onpointercancel={handlePointerEnd}
			onlostpointercapture={handlePointerEnd}
			onkeydown={handleKeydown}
		></canvas>
		<div class="dish-rim" aria-hidden="true"></div>
		<div class="stage-tags" aria-hidden="true"><span>u</span><span>v</span></div>
		{#if !ready}
			<div class="loading">Preparing fixed-step field…</div>
		{/if}
		{#if failureMessage}
			<div class="failure"><b>Numerical stop</b><span>{failureMessage}</span></div>
		{/if}
	</div>
	<p id="bz-stage-instructions" class="sr-only">
		Arrow keys move by one numerical cell. Enter applies the selected instrument. Space toggles run
		and pause. R resets. Full stop steps once. Keys 1 to 4 select probe, excite, inhibit, and cut.
		Square brackets change brush radius.
	</p>
	<div class="engine-line" aria-live="polite">
		<span class="engine-dot" class:failure={Boolean(failureMessage)}></span>
		<span>{engineMessage}</span>
	</div>
</div>

<style>
	.stage-shell {
		min-width: 0;
	}
	.stage {
		position: relative;
		isolation: isolate;
		aspect-ratio: 1;
		width: 100%;
		overflow: hidden;
		border: 1px solid rgb(255 255 255 / 0.18);
		border-radius: 50%;
		background: #080a0d;
		box-shadow:
			0 1.7rem 4.2rem rgb(0 0 0 / 0.35),
			inset 0 0 2.3rem rgb(0 0 0 / 0.5);
	}
	.poster,
	canvas,
	.dish-rim {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}
	.poster {
		z-index: -2;
		object-fit: cover;
	}
	canvas {
		opacity: 0;
		transition: opacity 220ms ease;
	}
	.cpu-canvas {
		z-index: -1;
	}
	.stage.ready .cpu-canvas,
	.overlay-canvas {
		opacity: 1;
	}
	.stage.gpu-active .cpu-canvas {
		opacity: 0;
	}
	.stage.gpu-active .gpu-canvas {
		opacity: 1;
	}
	.gpu-canvas {
		z-index: 0;
		pointer-events: none;
	}
	.overlay-canvas {
		z-index: 2;
		touch-action: none;
		cursor: crosshair;
		outline: none;
	}
	.overlay-canvas.painting {
		cursor: cell;
	}
	.overlay-canvas:focus-visible {
		box-shadow: inset 0 0 0 5px #ffcf5a;
	}
	.dish-rim {
		z-index: 3;
		pointer-events: none;
		border: clamp(5px, 1.3vw, 12px) solid rgb(225 229 220 / 0.16);
		border-radius: inherit;
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.24),
			inset 0 0 2.5rem rgb(0 0 0 / 0.5);
	}
	.stage-tags {
		position: absolute;
		z-index: 4;
		inset: 1.4rem;
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		pointer-events: none;
		color: rgb(255 246 215 / 0.58);
		font:
			700 0.66rem ui-monospace,
			monospace;
		text-transform: uppercase;
	}
	.loading,
	.failure {
		position: absolute;
		z-index: 5;
		inset: 50% auto auto 50%;
		transform: translate(-50%, -50%);
		width: min(76%, 24rem);
		border: 1px solid rgb(255 255 255 / 0.22);
		border-radius: 0.8rem;
		background: rgb(8 10 13 / 0.9);
		color: #fff6d7;
		padding: 0.9rem 1rem;
		text-align: center;
		font:
			0.76rem/1.5 ui-monospace,
			monospace;
	}
	.failure {
		display: grid;
		gap: 0.35rem;
		border-color: #ff6780;
	}
	.engine-line {
		display: flex;
		gap: 0.55rem;
		align-items: flex-start;
		margin: 0.75rem 0 0;
		color: color-mix(in oklab, currentColor 72%, transparent);
		font:
			0.67rem/1.45 ui-monospace,
			monospace;
	}
	.engine-dot {
		flex: 0 0 auto;
		width: 0.48rem;
		height: 0.48rem;
		margin-top: 0.2rem;
		border-radius: 50%;
		background: #4ba88d;
		box-shadow: 0 0 0 3px color-mix(in oklab, #4ba88d 22%, transparent);
	}
	.engine-dot.failure {
		background: #db4660;
		box-shadow: 0 0 0 3px rgb(219 70 96 / 0.22);
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
	@media (prefers-reduced-motion: reduce) {
		canvas {
			transition: none;
		}
	}
</style>
