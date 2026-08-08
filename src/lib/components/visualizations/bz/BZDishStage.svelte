<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BZCpuSolver,
		BZFastCpuSolver,
		BZ_SCHEMA_VERSION,
		activeAreaMetrics,
		assessBZTimestep,
		cloneBZFieldState,
		createInitialBZField,
		recoveredStateForSetup
	} from '$lib/visualizations/bz';
	import { renderBZToCanvas } from '$lib/visualizations/bz/display';
	import { renderBZToCanvasV2, type BZRenderProfileV2 } from '$lib/visualizations/bz/v2-display';
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
	import type {
		BZGpuEngine,
		BZGpuReadbackAccounting,
		BZGpuTelemetrySample,
		BZGpuTextureMemoryEstimate
	} from '$lib/visualizations/bz/gpu';

	const FRAME_CALLBACK_INTERVAL_MS = 100;
	const TELEMETRY_INTERVAL_MS = 300;
	const PROBE_INTERVAL_MS = 100;

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
		/** CPU frames expose the resident state; ordinary GPU frames never do. */
		field: Readonly<BZFieldState> | null;
		/** Bounded selected-cell reading sampled independently from field telemetry. */
		probe: ProbeReading | null;
		/** Five final 1×1 reduction reads on GPU, null on the CPU reference path. */
		telemetry: Readonly<BZGpuTelemetrySample> | null;
		readbacks: Readonly<BZGpuReadbackAccounting> | null;
		setup: Readonly<BZSetup>;
		step: number;
		modelTime: number;
		engine: BZEngineKind;
		stepsPerSecond: number;
		metrics: BZFieldMetrics;
		interventions: readonly BZIntervention[];
	};
	export type BZStagePerformanceSnapshot = {
		/** Monotonic browser clock used only to difference two bounded samples. */
		readonly sampledAtMs: number;
		readonly renderedFrames: number;
		readonly step: number;
		readonly engine: BZEngineKind;
		readonly renderer: string;
		readonly displayWidth: number;
		readonly displayHeight: number;
		readonly readbacks: Readonly<BZGpuReadbackAccounting> | null;
		readonly textureMemory: Readonly<BZGpuTextureMemoryEstimate> | null;
		/** Reusable RGBA16F base plus two quarter-resolution bloom targets. */
		readonly displayTextureBytes: number;
	};

	type Point = readonly [number, number];
	type Props = {
		setup: BZSetup;
		/** Exact verified field to continue instead of constructing the declared genesis. */
		initialState?: Readonly<BZFieldState> | null;
		/** Step represented by initialState. */
		initialStep?: number;
		/** Complete intervention log associated with initialState and its continuation. */
		initialInterventions?: readonly BZIntervention[];
		running?: boolean;
		workPerSecond?: number;
		view?: BZViewMode;
		palette?: BZPalette;
		displayProfile?: Readonly<BZRenderProfileV2> | null;
		tool?: BZTool;
		brushRadius?: number;
		/** Display-only markers for declared repeated sources; never sampled by the solver. */
		showSourceMarkers?: boolean;
		activeTerms?: ActiveTerms;
		selected?: Point;
		description?: string;
		poster?: string;
		onframe?: (frame: BZStageFrame) => void;
		onstatus?: (message: string, engine: BZEngineKind, failure: boolean) => void;
		onprobe?: (reading: ProbeReading, point: Point) => void;
		onintervention?: (event: BZIntervention) => void;
		oncommand?: (command: BZStageCommand) => void;
		onselect?: (point: Point) => void;
		onready?: (engine: BZEngineKind) => void;
	};

	let {
		setup,
		initialState = null,
		initialStep = 0,
		initialInterventions = [],
		running = false,
		workPerSecond = 480,
		view = 'dish',
		palette = 'ferroin',
		displayProfile = null,
		tool = 'probe',
		brushRadius = 0.045,
		showSourceMarkers = false,
		activeTerms = { reaction: true, diffusion: true },
		selected = [0.5, 0.5],
		description = 'A circular numerical BZ dish. Arrow keys move the probe; Enter applies the selected instrument.',
		poster = '/images/visualizations/belousov-zhabotinsky/bz-laboratory-poster.png',
		onframe,
		onstatus,
		onprobe,
		onintervention,
		oncommand,
		onselect,
		onready
	}: Props = $props();
	const stageId = $props.id();
	const stageInstructionsId = `${stageId}-instructions`;

	let root = $state<HTMLElement>();
	let cpuCanvas = $state<HTMLCanvasElement>();
	let gpuCanvas = $state<HTMLCanvasElement>();
	let overlayCanvas = $state<HTMLCanvasElement>();
	let sourceCanvas: HTMLCanvasElement | null = null;
	let cpuContext: CanvasRenderingContext2D | null = null;
	let overlayContext: CanvasRenderingContext2D | null = null;
	let gpu = $state.raw<BZGpuEngine | null>(null);
	let solver: BZCpuSolver | BZFastCpuSolver | null = null;
	let effectiveSetup = $state<BZSetup | null>(null);
	let engine = $state<BZEngineKind>('cpu-f64');
	let engineMessage = $state('Preparing the numerical engine.');
	let failureMessage = $state('');
	let renderedFrameCount = 0;
	let ready = $state(false);
	let fieldRevision = $state(0);
	let animationFrame = 0;
	let lastFrameAt = 0;
	let workCarry = 0;
	let lastRateAt = 0;
	let rateStepBaseline = 0;
	let measuredRate = 0;
	let lastPublishedAt = 0;
	let lastTelemetryAt = 0;
	let lastProbeAt = 0;
	let latestTelemetry: BZGpuTelemetrySample | null = null;
	let latestFrameProbe: ProbeReading | null = null;
	let latestProbePoint: Point | null = null;
	let previousRunning = false;
	let setupSignature = '';
	let initializedState: Readonly<BZFieldState> | null = null;
	let offscreen = false;
	let disposed = false;
	let mounted = $state(false);
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let contextRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
	let mixFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
	let mixing = $state(false);
	let pointerStart: Point | null = null;
	let pointerNow = $state<Point | null>(null);
	let drawing = false;
	let eventSequence = 0;
	let eventLog: BZIntervention[] = [];

	$effect(() => {
		view.toString();
		palette.toString();
		displayProfile?.id.toString();
		fieldRevision.toString();
		drawCpu();
		renderGpu();
	});

	$effect(() => {
		selected[0].toString();
		selected[1].toString();
		brushRadius.toString();
		tool.toString();
		showSourceMarkers.toString();
		pointerNow?.[0].toString();
		drawOverlay();
	});

	$effect(() => {
		const signature = JSON.stringify({ setup, activeTerms });
		const nextInitialState = initialState;
		initialStep.toString();
		initialInterventions.length.toString();
		if (!mounted || (signature === setupSignature && nextInitialState === initializedState)) return;
		setupSignature = signature;
		initializedState = nextInitialState;
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
		initializedState = initialState;
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
			if (mixFeedbackTimer !== null) clearTimeout(mixFeedbackTimer);
			gpu?.dispose();
			gpu = null;
			solver = null;
			sourceCanvas = null;
			cpuContext = null;
			overlayContext = null;
		};
	});

	async function initialize(
		replayEvents: readonly BZIntervention[] = initialInterventions,
		targetStep = initialStep,
		seedState: Readonly<BZFieldState> | null = initialState
	): Promise<void> {
		stopLoop();
		resetReadoutCadences();
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
							resetReadoutCadences();
							engineMessage = `${result.reason} Recovery resumed from explicit checkpoint step ${result.checkpointStep.toLocaleString()}.`;
							renderGpu();
							publishFrame(true);
							if (running) startLoop();
						}
					}
				});
				const initial = seedState ? cloneBZFieldState(seedState) : createInitialBZField(setup);
				gpu.initialize(setup, initial, {
					step: seedState ? targetStep : 0,
					modelTime: seedState ? targetStep * setup.timestep : 0
				});
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
				if (!seedState && targetStep > 0) gpu.advance(targetStep, eventLog);
				renderGpu();
				publishFrame(true);
				onready?.(engine);
				if (running) startLoop();
				return;
			} catch (error) {
				gpu?.dispose();
				gpu = null;
				const reason =
					error instanceof Error
						? error.message
						: 'Floating-point WebGL2 computation is unavailable.';
				initializeCpu(reason, replayEvents, targetStep, seedState);
				return;
			}
		}
		initializeCpu(
			forceCpu
				? 'WebGL computation was disabled for this run.'
				: 'Term-isolation experiments use the Float64 reference so the GPU kernel remains the exact full-equation contract.',
			replayEvents,
			targetStep,
			seedState
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
		targetStep = 0,
		seedState: Readonly<BZFieldState> | null = null
	) {
		try {
			resetReadoutCadences();
			clearContextRecoveryTimer();
			gpu?.dispose();
			gpu = null;
			// A verified checkpoint is grid-specific. Silently reconstructing it on the
			// legacy reduced CPU fallback would produce a different trajectory.
			const nextSetup = seedState ? ({ ...setup } as BZSetup) : fallbackSetup(setup);
			effectiveSetup = nextSetup;
			const completeTerms = activeTerms.reaction && activeTerms.diffusion;
			solver = completeTerms
				? new BZFastCpuSolver(nextSetup, {
						interventions: replayEvents,
						initialState: seedState ?? undefined,
						initialStep: seedState ? targetStep : 0
					})
				: new BZCpuSolver(nextSetup, {
						interventions: replayEvents,
						activeTerms,
						initialState: seedState ?? undefined,
						initialStep: seedState ? targetStep : 0
					});
			if (!seedState && targetStep > 0) solver.step(targetStep);
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
			onready?.(engine);
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
		if (now - lastPublishedAt >= FRAME_CALLBACK_INTERVAL_MS) publishFrame(false);
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
		if (!force && now - lastPublishedAt < FRAME_CALLBACK_INTERVAL_MS) return;
		lastPublishedAt = now;
		try {
			const field = gpu ? null : solver!.state;
			const telemetry = gpu ? telemetryForFrame(now) : null;
			if (telemetry && !telemetry.inspection.healthy) {
				throw new Error(telemetry.inspection.reason);
			}
			const probe = gpu ? probeForFrame(now) : field ? readCpuPoint(field, selected) : null;
			const modelTime = gpu?.clock.modelTime ?? solver!.modelTime;
			onframe?.({
				field,
				probe,
				telemetry,
				readbacks: gpu?.readbackAccounting ?? null,
				setup: effectiveSetup,
				step: currentStep(),
				modelTime,
				engine,
				stepsPerSecond: measuredRate,
				metrics: telemetry?.metrics ?? activeAreaMetrics(field!),
				interventions: [...eventLog]
			});
		} catch (error) {
			failureMessage = error instanceof Error ? error.message : 'Field diagnostics failed.';
			engineMessage = `Numerical telemetry stopped the run at step ${currentStep()}; no field repair was applied.`;
			stopLoop();
			onstatus?.(`${engineMessage} ${failureMessage}`, engine, true);
		}
	}

	function telemetryForFrame(now: number): BZGpuTelemetrySample | null {
		if (!gpu) return null;
		if (!latestTelemetry || now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
			latestTelemetry = gpu.sampleTelemetry(now);
			lastTelemetryAt = now;
		}
		return latestTelemetry;
	}

	function probeForFrame(now: number): ProbeReading | null {
		if (!gpu) return null;
		const pointChanged =
			!latestProbePoint ||
			latestProbePoint[0] !== selected[0] ||
			latestProbePoint[1] !== selected[1];
		if (!latestFrameProbe || pointChanged || now - lastProbeAt >= PROBE_INTERVAL_MS) {
			latestFrameProbe = gpu.readPoint(selected);
			latestProbePoint = [selected[0], selected[1]];
			lastProbeAt = now;
		}
		return latestFrameProbe;
	}

	function resetReadoutCadences() {
		lastPublishedAt = 0;
		lastTelemetryAt = 0;
		lastProbeAt = 0;
		latestTelemetry = null;
		latestFrameProbe = null;
		latestProbePoint = null;
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
		if (displayProfile) {
			renderBZToCanvasV2(sourceCanvas, solver.state, effectiveSetup, {
				view:
					displayProfile.style === 'phase-spectrum'
						? 'phase'
						: displayProfile.style === 'ferroin-proxy'
							? 'ferroin-proxy'
							: displayProfile.style === 'luminous-composite'
								? 'luminous-composite'
								: view,
				profile: displayProfile,
				width: solver.state.size,
				height: solver.state.size,
				interpolation: 'mask-aware-bilinear',
				glass: true
			});
		} else {
			renderBZToCanvas(sourceCanvas, solver.state, effectiveSetup, { view, palette });
		}
		cpuContext.imageSmoothingEnabled = true;
		cpuContext.fillStyle = '#080a0d';
		cpuContext.fillRect(0, 0, cpuCanvas.width, cpuCanvas.height);
		cpuContext.drawImage(sourceCanvas, 0, 0, cpuCanvas.width, cpuCanvas.height);
		renderedFrameCount += 1;
	}

	function renderGpu() {
		if (!gpu) return;
		try {
			gpu.render({
				view,
				palette,
				diagnosticScale: 1,
				exposure: 1,
				gamma: 1,
				glass: true,
				v2Profile: displayProfile
			});
			renderedFrameCount += 1;
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
		if (showSourceMarkers) {
			const step = currentStep();
			for (const source of eventLog) {
				if (
					source.kind !== 'pacemaker' ||
					source.step > step ||
					(source.endStep !== undefined && source.endStep < step)
				)
					continue;
				const sourceX = source.center[0] * overlayCanvas.width;
				const sourceY = source.center[1] * overlayCanvas.height;
				const sourceRadius = Math.max(
					4 * density,
					source.radius * Math.min(overlayCanvas.width, overlayCanvas.height)
				);
				context.strokeStyle = 'rgba(255, 232, 158, 0.78)';
				context.fillStyle = 'rgba(255, 196, 76, 0.07)';
				context.lineWidth = Math.max(1.2 * density, overlayCanvas.width / 620);
				context.setLineDash([2 * density, 4 * density]);
				context.beginPath();
				context.arc(sourceX, sourceY, sourceRadius, 0, Math.PI * 2);
				context.fill();
				context.stroke();
				context.setLineDash([]);
				context.beginPath();
				context.moveTo(sourceX - 3 * density, sourceY);
				context.lineTo(sourceX + 3 * density, sourceY);
				context.moveTo(sourceX, sourceY - 3 * density);
				context.lineTo(sourceX, sourceY + 3 * density);
				context.stroke();
			}
		}
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
		if (gpu) {
			const reading = gpu.readPoint(point);
			latestFrameProbe = reading;
			latestProbePoint = [point[0], point[1]];
			lastProbeAt = typeof performance === 'undefined' ? 0 : performance.now();
			return reading;
		}
		if (!solver) return null;
		return readCpuPoint(solver.state, point);
	}

	function readCpuPoint(field: Readonly<BZFieldState>, point: Point): ProbeReading {
		const column = Math.min(field.size - 1, Math.floor(point[0] * field.size));
		const row = Math.min(field.size - 1, Math.floor(point[1] * field.size));
		const index = row * field.size + column;
		const active = Boolean(field.mask[index]);
		return {
			row,
			column,
			index,
			active,
			u: active ? field.u[index] : null,
			v: active ? field.v[index] : null
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
		mixing = false;
		if (mixFeedbackTimer !== null) clearTimeout(mixFeedbackTimer);
		requestAnimationFrame(() => {
			if (disposed) return;
			mixing = true;
			mixFeedbackTimer = setTimeout(() => {
				mixing = false;
				mixFeedbackTimer = null;
			}, 720);
		});
	}

	export async function replay(
		targetStep = currentStep(),
		events: readonly BZIntervention[] = eventLog
	): Promise<void> {
		await initialize(events, 0, null);
		const target = Math.max(0, Math.round(targetStep));
		while (!disposed && (solver || gpu) && currentStep() < target) {
			advance(Math.min(gpu ? 256 : 64, target - currentStep()));
			if (currentStep() % 512 === 0)
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}
		publishFrame(true);
	}

	/** Continue the resident numerical state to an exact later step without reinitialising it. */
	export async function advanceToStep(targetStep: number): Promise<void> {
		if (!Number.isSafeInteger(targetStep) || targetStep < currentStep()) {
			throw new RangeError(
				'The requested continuation step must be a safe integer at or after the resident step.'
			);
		}
		while (!disposed && (solver || gpu) && currentStep() < targetStep) {
			advance(Math.min(gpu ? 256 : 32, targetStep - currentStep()));
			if (currentStep() < targetStep) {
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			}
		}
		publishFrame(true);
	}

	/** Export the exact visible display pass. No numerical field readback is performed. */
	export function visiblePngBlob(): Promise<Blob | null> {
		if (gpu) renderGpu();
		else drawCpu();
		const canvas = gpu ? gpuCanvas : cpuCanvas;
		if (!canvas) return Promise.resolve(null);
		return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
	}

	export function snapshot(): BZFieldState | null {
		if (gpu) return gpu.readState('export');
		return solver ? cloneBZFieldState(solver.state) : null;
	}

	export function readbackAccounting(): BZGpuReadbackAccounting | null {
		return gpu?.readbackAccounting ?? null;
	}

	export function textureMemoryEstimate(): BZGpuTextureMemoryEstimate | null {
		return gpu?.estimateTextureMemory() ?? null;
	}

	/** Bounded counters for explicit performance measurement; no numerical texture is read. */
	export function performanceSnapshot(): BZStagePerformanceSnapshot {
		const canvas = gpu ? gpuCanvas : cpuCanvas;
		const width = canvas?.width ?? 0;
		const height = canvas?.height ?? 0;
		const bloomWidth = Math.ceil(width / 4);
		const bloomHeight = Math.ceil(height / 4);
		const hasPublicationTargets = Boolean(gpu && displayProfile && displayProfile.bloom > 0);
		return {
			sampledAtMs: typeof performance === 'undefined' ? 0 : performance.now(),
			renderedFrames: renderedFrameCount,
			step: currentStep(),
			engine,
			renderer: gpu?.capabilities.renderer ?? 'Float64 CPU reference',
			displayWidth: width,
			displayHeight: height,
			readbacks: gpu?.readbackAccounting ?? null,
			textureMemory: gpu?.estimateTextureMemory() ?? null,
			displayTextureBytes: hasPublicationTargets
				? width * height * 8 + bloomWidth * bloomHeight * 8 * 2
				: 0
		};
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
		class:mixing
		bind:this={root}
		data-engine={engine}
		data-testid="bz-stage"
	>
		<img class="poster" src={poster} alt="" aria-hidden="true" />
		<canvas bind:this={gpuCanvas} class="gpu-canvas" aria-hidden="true"></canvas>
		<canvas bind:this={cpuCanvas} class="cpu-canvas" aria-hidden="true"></canvas>
		<canvas
			bind:this={overlayCanvas}
			class="overlay-canvas"
			class:painting={tool !== 'probe'}
			tabindex="0"
			aria-label={description}
			aria-describedby={stageInstructionsId}
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerleave={handlePointerLeave}
			onpointerup={handlePointerEnd}
			onpointercancel={handlePointerEnd}
			onlostpointercapture={handlePointerEnd}
			onkeydown={handleKeydown}
		></canvas>
		{#if mixing}<div class="mix-feedback" aria-hidden="true"></div>{/if}
		<div class="dish-rim" aria-hidden="true"></div>
		<div class="stage-tags" aria-hidden="true"><span>u</span><span>v</span></div>
		{#if !ready}
			<div class="loading">Preparing fixed-step field…</div>
		{/if}
		{#if failureMessage}
			<div class="failure"><b>Numerical stop</b><span>{failureMessage}</span></div>
		{/if}
	</div>
	<p id={stageInstructionsId} class="sr-only">
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
	.mix-feedback {
		position: absolute;
		z-index: 2;
		inset: 9%;
		pointer-events: none;
		border-radius: 50%;
		background:
			conic-gradient(
				from 45deg,
				transparent 0 18%,
				rgb(255 226 155 / 0.13) 31%,
				transparent 44% 68%,
				rgb(116 198 235 / 0.1) 80%,
				transparent 94%
			),
			radial-gradient(circle, rgb(255 255 255 / 0.09), transparent 61%);
		mix-blend-mode: screen;
		animation: bz-mix-feedback 720ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
	}
	@keyframes bz-mix-feedback {
		0% {
			opacity: 0;
			transform: scale(0.62) rotate(-28deg);
		}
		36% {
			opacity: 0.8;
		}
		100% {
			opacity: 0;
			transform: scale(1.08) rotate(42deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.mix-feedback {
			animation: none;
			opacity: 0.12;
		}
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
