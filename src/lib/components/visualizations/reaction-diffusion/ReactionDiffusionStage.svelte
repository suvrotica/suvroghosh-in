<script lang="ts">
	import { onMount } from 'svelte';
	import ReactionDiffusionField from './ReactionDiffusionField.svelte';
	import { createInitialField } from '$lib/visualizations/reaction-diffusion/initial';
	import { MAX_INTERVENTIONS } from '$lib/visualizations/reaction-diffusion/constants';
	import { scheduleFixedWork } from '$lib/visualizations/reaction-diffusion/fixed-work-scheduler';
	import {
		ReactionDiffusionCpuEngine,
		assessNumericalStability
	} from '$lib/visualizations/reaction-diffusion/engine';
	import type { ReactionDiffusionGpuEngine } from '$lib/visualizations/reaction-diffusion/gpu/simulation';
	import type { ReactionDiffusionWorkerClient } from '$lib/visualizations/reaction-diffusion/workers/client';
	import type { ReactionDiffusionWorkerResponse } from '$lib/visualizations/reaction-diffusion/workers/protocol';
	import type {
		BrushShape,
		BrushTarget,
		BrushTool,
		DisplayMode,
		EngineKind,
		FieldState,
		GrayScottSetup,
		Intervention,
		PaletteId
	} from '$lib/visualizations/reaction-diffusion/types';

	export type StageFrame = {
		field: FieldState;
		step: number;
		modelTime: number;
		engine: EngineKind;
		stepsPerSecond: number;
		events: readonly Intervention[];
	};

	type Point = readonly [number, number];
	type StageCommand =
		| 'toggle-running'
		| 'reset'
		| 'step'
		| 'radius-down'
		| 'radius-up'
		| 'tool-1'
		| 'tool-2'
		| 'tool-3'
		| 'tool-4'
		| 'cancel';
	type BrushSettings = {
		tool: BrushTool;
		shape: BrushShape;
		target: BrushTarget;
		radius: number;
		strength: number;
		falloff: number;
		interactionMode: 'inspect' | 'paint';
		applicationMode: 'once' | 'path';
	};
	type Props = {
		setup: GrayScottSetup;
		running?: boolean;
		stepsPerFrame?: number;
		displayMode?: DisplayMode;
		palette?: PaletteId;
		brush?: BrushSettings;
		selected?: Point;
		allowUnsafe?: boolean;
		description?: string;
		onframe?: (frame: StageFrame) => void;
		onstatus?: (message: string, engine: EngineKind, failure: boolean) => void;
		onselect?: (point: Point) => void;
		onintervention?: (event: Intervention) => void;
		oncommand?: (command: StageCommand) => void;
	};

	let {
		setup,
		running = false,
		stepsPerFrame = 2,
		displayMode = 'v',
		palette = 'mineral',
		brush = {
			tool: 'add-v',
			shape: 'soft-disk',
			target: 'both',
			radius: 0.045,
			strength: 0.2,
			falloff: 1.5,
			interactionMode: 'inspect',
			applicationMode: 'path'
		},
		selected = [0.5, 0.5],
		allowUnsafe = false,
		description = 'Gray–Scott concentration field. Select a cell to inspect it without changing chemistry.',
		onframe,
		onstatus,
		onselect,
		onintervention,
		oncommand
	}: Props = $props();

	let root = $state<HTMLElement>();
	let gpuCanvas = $state<HTMLCanvasElement>();
	let gpu = $state.raw<ReactionDiffusionGpuEngine | null>(null);
	let cpu: ReactionDiffusionCpuEngine | null = null;
	let cpuWorker: ReactionDiffusionWorkerClient | null = null;
	let workerUnsubscribe: (() => void) | null = null;
	let workerBusy = false;
	let workerQueuedSteps = 0;
	let workerPendingEnd = 0;
	let workerStep = 0;
	let workerModelTime = 0;
	let field = $state<FieldState | null>(null);
	let fieldRevision = $state(0);
	let engineKind = $state<EngineKind>('cpu-reference');
	let engineReady = $state(false);
	let engineMessage = $state('Preparing the scientific engine.');
	let failureMessage = $state('');
	let offscreen = false;
	let disposed = false;
	let animationFrame = 0;
	let lastFrameAt = 0;
	let scheduledStepCarry = 0;
	let lastReadbackAt = 0;
	let lastRateAt = 0;
	let rateStepBaseline = 0;
	let measuredStepsPerSecond = 0;
	let contextRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let setupSignature = '';
	let eventSequence = 0;
	let eventLog: Intervention[] = [];
	let pointerStart: Point | null = null;

	$effect(() => {
		displayMode.toString();
		palette.toString();
		renderGpu();
	});

	$effect(() => {
		const signature = JSON.stringify(setup);
		if (!engineReady || signature === setupSignature) return;
		setupSignature = signature;
		reset();
	});

	$effect(() => {
		if (running && engineReady && !failureMessage) startLoop();
		else stopLoop();
	});

	onMount(() => {
		disposed = false;
		setupSignature = JSON.stringify(setup);
		void initialize();
		document.addEventListener('visibilitychange', handleVisibility);
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				offscreen = !entries.some((entry) => entry.isIntersecting);
				if (offscreen) stopLoop();
				else if (running) startLoop();
			},
			{ rootMargin: '160px 0px', threshold: 0.01 }
		);
		if (root) intersectionObserver.observe(root);
		if (gpuCanvas) {
			resizeObserver = new ResizeObserver(resizeGpu);
			resizeObserver.observe(gpuCanvas);
		}
		return () => {
			disposed = true;
			stopLoop();
			document.removeEventListener('visibilitychange', handleVisibility);
			intersectionObserver?.disconnect();
			resizeObserver?.disconnect();
			clearContextRecoveryTimer();
			gpu?.dispose();
			gpu = null;
			workerUnsubscribe?.();
			workerUnsubscribe = null;
			cpuWorker?.dispose();
			cpuWorker = null;
			cpu = null;
		};
	});

	async function initialize() {
		const requestedCpu = new URLSearchParams(window.location.search).get('webgl') === 'off';
		if (!requestedCpu && gpuCanvas) {
			try {
				const module = await import('$lib/visualizations/reaction-diffusion/gpu/simulation');
				if (disposed) return;
				gpu = new module.ReactionDiffusionGpuEngine(gpuCanvas, {
					callbacks: {
						onContextLost: () => {
							engineMessage =
								'The WebGL context was interrupted. Model time is paused while resources are rebuilt.';
							stopLoop();
							clearContextRecoveryTimer();
							contextRecoveryTimer = setTimeout(() => {
								contextRecoveryTimer = null;
								if (disposed || !gpu?.isContextLost) return;
								void switchToCpu(
									'The WebGL context did not restore within 1.5 seconds; the exact run is continuing through CPU Worker replay.',
									currentStep(),
									eventLog
								);
							}, 1_500);
						},
						onContextRestored: (result) => {
							clearContextRecoveryTimer();
							engineMessage = result.recovered
								? `Floating-point resources were restored from the checkpoint at step ${result.checkpointStep}.`
								: `GPU restoration failed: ${result.reason} The CPU reference path remains available.`;
							if (result.recovered) {
								renderGpu();
								if (running) startLoop();
							} else switchToCpu(engineMessage);
						}
					}
				});
				const initial = createInitialField(setup);
				gpu.initialize(setup, initial);
				engineKind = gpu.textureFormat === 'RGBA32F' ? 'gpu-f32' : 'gpu-f16';
				field = initial;
				engineMessage = `${gpu.textureFormat} passed framebuffer completeness and floating-point write/read tests.`;
				engineReady = true;
				resizeGpu();
				renderGpu();
				publishFrame(true);
				onstatus?.(engineMessage, engineKind, false);
				if (running) startLoop();
				return;
			} catch (error) {
				gpu?.dispose();
				gpu = null;
				const reason =
					error instanceof Error
						? error.message
						: 'Floating-point WebGL computation is unavailable.';
				void switchToCpu(reason);
				return;
			}
		}
		void switchToCpu(
			requestedCpu
				? 'WebGL computation was disabled for this run.'
				: 'Floating-point WebGL computation is unavailable.'
		);
	}

	function cpuSetup(): GrayScottSetup {
		return setup.gridSize > 128 ? { ...setup, gridSize: 128 } : { ...setup };
	}

	async function switchToCpu(
		reason: string,
		replayStep = currentStep(),
		replayEvents: readonly Intervention[] = eventLog
	) {
		clearContextRecoveryTimer();
		const targetStep = Math.max(0, Math.round(replayStep));
		const targetEvents = [...replayEvents];
		gpu?.dispose();
		gpu = null;
		const fallbackSetup = cpuSetup();
		workerUnsubscribe?.();
		workerUnsubscribe = null;
		cpuWorker?.dispose();
		cpuWorker = null;
		cpu = null;
		workerBusy = false;
		workerQueuedSteps = 0;
		workerPendingEnd = 0;
		workerStep = 0;
		workerModelTime = 0;
		engineKind = 'cpu-reference';
		engineMessage = `${reason} Preparing the deterministic CPU reference Worker at ${fallbackSetup.gridSize} × ${fallbackSetup.gridSize} cells.`;
		failureMessage = '';
		engineReady = false;
		try {
			const module = await import('$lib/visualizations/reaction-diffusion/workers/client');
			if (disposed) return;
			cpuWorker = module.createReactionDiffusionWorkerClient();
			workerUnsubscribe = cpuWorker.subscribe(handleWorkerResponse);
			if (targetStep > 0) {
				workerBusy = true;
				workerPendingEnd = targetStep;
				cpuWorker.replay(fallbackSetup, targetStep, targetEvents, {
					stepsPerChunk: 8,
					includeState: true
				});
				engineMessage = `${reason} Replaying ${targetStep} exact steps and ${targetEvents.length} logged interventions in the reduced Float64 CPU reference Worker.`;
			} else {
				cpuWorker.reset(fallbackSetup, { includeState: true });
			}
			onstatus?.(engineMessage, engineKind, false);
		} catch (error) {
			// A browser without Worker support still receives the same canonical CPU kernel,
			// but this last-resort path is deliberately identified as main-thread execution.
			cpuWorker = null;
			cpu = new ReactionDiffusionCpuEngine(fallbackSetup, {
				rejectUnsafe: !allowUnsafe,
				interventions: targetEvents
			});
			if (targetStep > 0) cpu.step(targetStep);
			field = cpu.state as FieldState;
			setupSignature = JSON.stringify(fallbackSetup);
			engineMessage = `${reason} Web Workers were unavailable, so the reduced deterministic CPU reference replayed ${targetStep} steps on the main thread at ${fallbackSetup.gridSize} × ${fallbackSetup.gridSize}.`;
			if (error instanceof Error) engineMessage += ` ${error.message}`;
			engineReady = true;
			fieldRevision += 1;
			publishFrame(false);
			onstatus?.(engineMessage, engineKind, false);
			if (running) startLoop();
		}
	}

	function clearContextRecoveryTimer() {
		if (contextRecoveryTimer !== null) clearTimeout(contextRecoveryTimer);
		contextRecoveryTimer = null;
	}

	function handleWorkerResponse(response: ReactionDiffusionWorkerResponse) {
		if (disposed) return;
		if (
			response.type === 'RESET_COMPLETE' ||
			response.type === 'STEP_COMPLETE' ||
			response.type === 'REPLAY_COMPLETE' ||
			response.type === 'METRICS_RESULT'
		) {
			workerStep = response.report.step;
			workerModelTime = response.report.modelTime;
			if (response.report.state) {
				field = response.report.state;
				if (field.size !== setup.gridSize) {
					setupSignature = JSON.stringify({ ...setup, gridSize: field.size });
				}
				fieldRevision += 1;
			}
			workerBusy = false;
			workerPendingEnd = workerStep;
			engineReady = true;
			engineMessage = `Deterministic Float64 CPU Worker active at ${cpuSetup().gridSize} × ${cpuSetup().gridSize}; stale reset generations are rejected.`;
			publishFrame(false);
			if (workerQueuedSteps > 0) {
				const queued = workerQueuedSteps;
				workerQueuedSteps = 0;
				advance(queued);
			} else if (running) startLoop();
			return;
		}
		if (response.type === 'NUMERICAL_FAILURE') {
			workerBusy = false;
			workerStep = response.report.step;
			workerModelTime = response.report.modelTime;
			if (response.report.state) field = response.report.state;
			failureMessage = response.reason;
			engineMessage = `Numerical failure at CPU step ${workerStep}. Raw state was not clamped or repaired.`;
			stopLoop();
			onstatus?.(`${engineMessage} ${failureMessage}`, engineKind, true);
			publishFrame(false);
			return;
		}
		if (response.type === 'ERROR') {
			workerBusy = false;
			failureMessage = response.message;
			engineMessage = 'The CPU reference Worker stopped; reset the experiment to rebuild it.';
			stopLoop();
			onstatus?.(`${engineMessage} ${failureMessage}`, engineKind, true);
			return;
		}
		if (response.type === 'CANCELLED') workerBusy = false;
	}

	function handleVisibility() {
		if (document.hidden) stopLoop();
		else if (running && !offscreen) {
			lastFrameAt = performance.now();
			startLoop();
		}
	}

	function shouldRun() {
		return running && engineReady && !failureMessage && !document.hidden && !offscreen;
	}

	function startLoop() {
		if (animationFrame || !shouldRun()) return;
		scheduledStepCarry = 0;
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
		// The wall clock budgets exact fixed steps at a nominal 60 scheduling slices
		// per second. Fractional work carries between frames, so a 144 Hz display
		// cannot make model time pass faster than a 60 Hz display.
		const scheduled = scheduleFixedWork(scheduledStepCarry, elapsed, stepsPerFrame * 60);
		if (cpuWorker && workerBusy) {
			scheduledStepCarry = Math.min(32, scheduled.carry + scheduled.work);
		} else {
			scheduledStepCarry = scheduled.carry;
			if (scheduled.work > 0) advance(scheduled.work);
		}
		if (gpu) {
			renderGpu();
			if (now - lastReadbackAt >= 750) {
				const inspection = gpu.inspectNumerics();
				if (!inspection.healthy) {
					failureMessage = inspection.reason;
					engineMessage = `Numerical failure at GPU step ${currentStep()}. Raw solver state was not clamped or repaired.`;
					stopLoop();
					onstatus?.(`${engineMessage} ${failureMessage}`, engineKind, true);
					return;
				}
				publishFrame(true);
			}
		} else {
			if (!cpuWorker) publishFrame(false);
		}
		updateRate(now);
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
		measuredStepsPerSecond = ((step - rateStepBaseline) * 1000) / (now - lastRateAt);
		lastRateAt = now;
		rateStepBaseline = step;
	}

	function advance(count: number) {
		if (!allowUnsafe && assessNumericalStability(gpu ? setup : cpuSetup()).state === 'unsafe') {
			engineMessage =
				'The requested step is above the conservative diffusion ceiling and needs explicit unsafe-run consent.';
			onstatus?.(engineMessage, engineKind, false);
			return;
		}
		try {
			if (gpu) {
				gpu.advance(count, eventLog);
			} else if (cpuWorker) {
				if (workerBusy) {
					workerQueuedSteps = Math.min(100, workerQueuedSteps + count);
					return;
				}
				workerBusy = true;
				workerPendingEnd = workerStep + count;
				cpuWorker.step(count, {
					interventions: eventLog,
					stepsPerChunk: Math.min(8, Math.max(1, count)),
					includeState: true
				});
			} else if (cpu) {
				cpu.step(count);
				field = cpu.state as FieldState;
				fieldRevision += 1;
			}
		} catch (error) {
			failureMessage =
				error instanceof Error ? error.message : 'The solver reached an invalid numerical state.';
			stopLoop();
			engineMessage = `Numerical failure at step ${currentStep()}. Raw solver state was not clamped or repaired.`;
			onstatus?.(`${engineMessage} ${failureMessage}`, engineKind, true);
		}
	}

	function currentStep() {
		return gpu?.clock.step ?? (cpuWorker ? workerStep : cpu?.stepIndex) ?? 0;
	}

	function currentTime() {
		return gpu?.clock.modelTime ?? (cpuWorker ? workerModelTime : cpu?.modelTime) ?? 0;
	}

	function publishFrame(forceReadback: boolean) {
		if (!engineReady) return;
		if (gpu && forceReadback) {
			try {
				field = gpu.readState(true);
				fieldRevision += 1;
				lastReadbackAt = performance.now();
			} catch (error) {
				engineMessage = error instanceof Error ? error.message : 'GPU state readback failed.';
			}
		}
		if (!field) return;
		onframe?.({
			field,
			step: currentStep(),
			modelTime: currentTime(),
			engine: engineKind,
			stepsPerSecond: measuredStepsPerSecond,
			events: [...eventLog]
		});
	}

	function resizeGpu() {
		if (!gpu || !gpuCanvas) return;
		const bounds = gpuCanvas.getBoundingClientRect();
		gpu.setDisplaySize(bounds.width, bounds.height, Math.min(window.devicePixelRatio || 1, 1.5));
		renderGpu();
	}

	function renderGpu() {
		if (!gpu || gpu.isContextLost) return;
		try {
			gpu.render({ mode: displayMode, palette });
		} catch {
			// A context-loss callback owns the visible recovery path.
		}
	}

	function createIntervention(from: Point, to: Point): Intervention {
		const sequence = eventSequence++;
		const interventionStep = cpuWorker && workerBusy ? workerPendingEnd : currentStep();
		if (brush.tool === 'paint-obstacle' || brush.tool === 'erase-obstacle') {
			return {
				schemaVersion: 1,
				sequence,
				step: interventionStep,
				kind: 'mask',
				active: brush.tool === 'erase-obstacle',
				from,
				to,
				radius: brush.radius
			};
		}
		return {
			schemaVersion: 1,
			sequence,
			step: interventionStep,
			kind: 'brush',
			tool: brush.tool,
			shape: brush.shape,
			target: brush.target,
			from,
			to,
			radius: brush.radius,
			strength: brush.strength,
			falloff: brush.falloff
		};
	}

	function applyStroke(from: Point, to: Point) {
		if (!engineReady || failureMessage) return;
		if (eventLog.length >= MAX_INTERVENTIONS) {
			engineMessage = `Intervention limit ${MAX_INTERVENTIONS} reached. No further brush event was accepted; export or reset to preserve exact replay.`;
			onstatus?.(engineMessage, engineKind, false);
			return;
		}
		const event = createIntervention(from, to);
		eventLog = [...eventLog, event];
		if (cpu) cpu.appendIntervention(event);
		onintervention?.(event);
		if (eventLog.length === Math.floor(MAX_INTERVENTIONS * 0.9)) {
			engineMessage = `Intervention log is 90% full (${eventLog.length}/${MAX_INTERVENTIONS}); export before the replay limit is reached.`;
			onstatus?.(engineMessage, engineKind, false);
		}
		// Interventions are defined immediately before an integration step, including while paused.
		advance(1);
		renderGpu();
		publishFrame(true);
	}

	function pointFromPointer(event: PointerEvent): Point {
		const bounds = gpuCanvas!.getBoundingClientRect();
		return [
			Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
			Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
		];
	}

	function handlePointerDown(event: PointerEvent) {
		if (!gpuCanvas || !engineReady) return;
		const point = pointFromPointer(event);
		onselect?.(point);
		if (brush.interactionMode === 'inspect') return;
		if (brush.applicationMode === 'once') {
			applyStroke(point, point);
			return;
		}
		gpuCanvas.setPointerCapture(event.pointerId);
		pointerStart = point;
	}

	function handlePointerUp(event: PointerEvent) {
		if (!gpuCanvas || !pointerStart) return;
		const point = pointFromPointer(event);
		if (gpuCanvas.hasPointerCapture(event.pointerId))
			gpuCanvas.releasePointerCapture(event.pointerId);
		onselect?.(point);
		const distance = Math.hypot(point[0] - pointerStart[0], point[1] - pointerStart[1]);
		// Taps inspect; deliberate drags paint one replayable model-space segment.
		if (distance >= 0.002) applyStroke(pointerStart, point);
		pointerStart = null;
	}

	function handleGpuKeydown(event: KeyboardEvent) {
		const delta = 1 / setup.gridSize;
		let point: Point | null = null;
		if (event.key === 'ArrowLeft') point = [Math.max(0, selected[0] - delta), selected[1]];
		if (event.key === 'ArrowRight') point = [Math.min(1, selected[0] + delta), selected[1]];
		if (event.key === 'ArrowUp') point = [selected[0], Math.max(0, selected[1] - delta)];
		if (event.key === 'ArrowDown') point = [selected[0], Math.min(1, selected[1] + delta)];
		if (point) {
			event.preventDefault();
			onselect?.(point);
		}
		if (event.key === 'Enter' && brush.interactionMode === 'paint') {
			event.preventDefault();
			applyStroke(selected, selected);
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
								: ['1', '2', '3', '4'].includes(event.key)
									? (`tool-${event.key}` as StageCommand)
									: event.key === 'Escape'
										? 'cancel'
										: null;
		if (command) {
			event.preventDefault();
			if (command === 'cancel') pointerStart = null;
			oncommand?.(command);
		}
	}

	export function reset() {
		stopLoop();
		failureMessage = '';
		eventLog = [];
		eventSequence = 0;
		const initial = createInitialField(gpu ? setup : cpuSetup());
		if (gpu) {
			gpu.initialize(setup, initial);
			field = initial;
			resizeGpu();
		} else if (cpuWorker) {
			cpuWorker.cancel();
			workerBusy = false;
			workerQueuedSteps = 0;
			workerStep = 0;
			workerModelTime = 0;
			field = initial;
			engineReady = false;
			cpuWorker.reset(cpuSetup(), { includeState: true });
		} else {
			cpu = new ReactionDiffusionCpuEngine(cpuSetup(), { rejectUnsafe: !allowUnsafe });
			field = cpu.state as FieldState;
		}
		fieldRevision += 1;
		engineMessage = 'Exact initial state restored; the intervention log is empty.';
		publishFrame(true);
		onstatus?.(engineMessage, engineKind, false);
		if (running) startLoop();
	}

	export function manualStep(count = 1) {
		if (!engineReady) return;
		advance(Math.max(1, Math.min(100, Math.round(count))));
		renderGpu();
		publishFrame(true);
	}

	export function applyBrushAtSelection() {
		if (!engineReady) return false;
		applyStroke(selected, selected);
		return true;
	}

	export function replayInCpuReference() {
		if (!engineReady) return false;
		const targetStep = currentStep();
		const targetEvents = [...eventLog];
		stopLoop();
		void switchToCpu('CPU reference replay requested.', targetStep, targetEvents);
		return true;
	}

	export function undoLastIntervention() {
		if (!engineReady || eventLog.length === 0) return false;
		stopLoop();
		const targetStep = currentStep();
		eventLog = eventLog.slice(0, -1);
		eventSequence = eventLog.reduce((maximum, event) => Math.max(maximum, event.sequence + 1), 0);
		failureMessage = '';
		if (gpu) {
			// Replaying a long GPU history in one JavaScript turn can monopolise the
			// main thread. Move this exact reconstruction to the chunked Float64 Worker;
			// the visible engine/quality readout makes the fallback explicit.
			void switchToCpu(
				'Undo requested a history reconstruction; replay moved to the chunked CPU Worker.',
				targetStep,
				eventLog
			);
			return true;
		} else if (cpuWorker) {
			workerBusy = true;
			workerQueuedSteps = 0;
			workerPendingEnd = targetStep;
			cpuWorker.replay(cpuSetup(), targetStep, eventLog, {
				stepsPerChunk: 8,
				includeState: true
			});
			engineMessage = `Replaying ${targetStep} exact CPU steps after removing the last intervention.`;
		} else {
			const replaySetup = cpuSetup();
			cpu = new ReactionDiffusionCpuEngine(replaySetup, {
				rejectUnsafe: !allowUnsafe,
				interventions: eventLog
			});
			cpu.step(targetStep);
			field = cpu.state as FieldState;
		}
		fieldRevision += 1;
		if (!cpuWorker)
			engineMessage = `The last intervention was removed and ${targetStep} exact steps were replayed from the initial state.`;
		publishFrame(Boolean(gpu));
		onstatus?.(engineMessage, engineKind, false);
		if (running) startLoop();
		return true;
	}

	export function snapshot(): StageFrame | null {
		publishFrame(true);
		if (!field) return null;
		return {
			field,
			step: currentStep(),
			modelTime: currentTime(),
			engine: engineKind,
			stepsPerSecond: measuredStepsPerSecond,
			events: [...eventLog]
		};
	}

	export function captureCanvas(): HTMLCanvasElement | null {
		return gpu ? (gpuCanvas ?? null) : null;
	}
</script>

<section
	bind:this={root}
	class="stage"
	data-engine={engineKind}
	aria-label="Reaction–diffusion field stage"
>
	<div class="field-stack">
		<img
			class="poster"
			src="/images/reaction-diffusion-atlas-field.png"
			alt=""
			aria-hidden="true"
		/>
		<canvas
			bind:this={gpuCanvas}
			class:visible={gpu !== null && engineReady}
			class:painting={brush.interactionMode === 'paint'}
			tabindex={gpu ? 0 : -1}
			aria-label={description}
			onpointerdown={handlePointerDown}
			onpointerup={handlePointerUp}
			onpointercancel={() => (pointerStart = null)}
			onkeydown={handleGpuKeydown}
		></canvas>
		{#if gpu === null}
			<ReactionDiffusionField
				{field}
				setup={cpuSetup()}
				revision={fieldRevision}
				{displayMode}
				{palette}
				{selected}
				interactionMode={brush.interactionMode}
				applicationMode={brush.applicationMode}
				label={description}
				{onselect}
				onstroke={applyStroke}
				{oncommand}
			/>
		{/if}
		<div
			class="marker"
			style={`--x:${selected[0] * 100}%;--y:${selected[1] * 100}%`}
			aria-hidden="true"
		></div>
		<div class="scale" aria-hidden="true">
			<span></span><b>{setup.domainWidth / 4} model units</b>
		</div>
	</div>

	<div class="stage-status" class:failure={Boolean(failureMessage)} role="status">
		<span class="engine-dot"></span>
		<p>{failureMessage ? `${engineMessage} ${failureMessage}` : engineMessage}</p>
	</div>
	<p class="sr-only">
		The stability number is {assessNumericalStability(gpu ? setup : cpuSetup()).mu.toPrecision(4)}.
	</p>
</section>

<style>
	.stage {
		width: 100%;
	}
	.field-stack {
		position: relative;
		isolation: isolate;
		aspect-ratio: 1;
		overflow: hidden;
		border: 1px solid rgb(235 228 209 / 0.25);
		border-radius: 0.8rem;
		background: #0b1112;
		box-shadow: 0 1.6rem 4rem rgb(0 0 0 / 0.25);
	}
	.poster,
	.field-stack > canvas {
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
	.field-stack > canvas {
		opacity: 0;
		touch-action: pan-y;
	}
	.field-stack > canvas.painting {
		touch-action: none;
	}
	.field-stack > canvas.visible {
		opacity: 1;
	}
	.field-stack > canvas:focus-visible {
		outline: 3px solid #f0cf7a;
		outline-offset: -5px;
	}
	.marker {
		position: absolute;
		z-index: 3;
		left: var(--x);
		top: var(--y);
		width: 0.85rem;
		height: 0.85rem;
		translate: -50% -50%;
		border: 1.5px solid #fff7d8;
		border-radius: 50%;
		box-shadow: 0 0 0 1px rgb(0 0 0 / 0.55);
		pointer-events: none;
	}
	.marker::before,
	.marker::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		background: #fff7d8;
		translate: -50% -50%;
	}
	.marker::before {
		width: 1.3rem;
		height: 1px;
	}
	.marker::after {
		width: 1px;
		height: 1.3rem;
	}
	.scale {
		position: absolute;
		z-index: 3;
		right: 0.7rem;
		bottom: 0.6rem;
		display: grid;
		gap: 0.18rem;
		color: #fff3d4;
		font:
			700 0.62rem/1 ui-monospace,
			monospace;
		text-shadow: 0 1px 2px #000;
		pointer-events: none;
	}
	.scale span {
		width: 4rem;
		border-top: 2px solid currentColor;
	}
	.stage-status {
		display: flex;
		gap: 0.55rem;
		align-items: flex-start;
		margin-top: 0.6rem;
		color: color-mix(in oklab, var(--essay-ink, #26302e) 74%, transparent);
		font-size: 0.76rem;
	}
	.stage-status p {
		margin: 0;
	}
	.engine-dot {
		flex: 0 0 auto;
		width: 0.55rem;
		height: 0.55rem;
		margin-top: 0.2rem;
		border-radius: 50%;
		background: #3d8c7c;
		box-shadow: 0 0 0 0.2rem color-mix(in srgb, #3d8c7c 18%, transparent);
	}
	.stage-status.failure {
		color: #9f4639;
	}
	.stage-status.failure .engine-dot {
		background: #b64d3c;
		box-shadow: 0 0 0 0.2rem color-mix(in srgb, #b64d3c 18%, transparent);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	@media (prefers-reduced-motion: reduce) {
		.field-stack > canvas {
			transition: none;
		}
	}
	:global(html[data-theme='high-contrast']) .field-stack {
		border-width: 2px;
	}
</style>
