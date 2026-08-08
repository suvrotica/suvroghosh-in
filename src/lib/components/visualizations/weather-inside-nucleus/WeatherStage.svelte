<script module lang="ts">
	import type { SimulationResult } from '$lib/visualizations/weather-inside-nucleus/model';
	import type {
		NucleusDirectedBeat,
		NucleusInterventionTarget,
		NucleusSemanticView,
		NucleusTraceBuffers
	} from '$lib/visualizations/weather-inside-nucleus/render/types';

	export type WeatherStageStatus = 'loading' | 'ready' | 'fallback' | 'context-lost';
	export type WeatherStageTrace = NucleusTraceBuffers | SimulationResult;
	export type WeatherStageFallbackContext = Readonly<{
		status: WeatherStageStatus;
		message: string;
		trace: NucleusTraceBuffers | null;
		playbackTime: number;
		introActive: boolean;
		introProgress: number;
		directedBeat: NucleusDirectedBeat | null;
		directedProgress: number;
		filmTime: number;
		reducedMotion: boolean;
		highContrast: boolean;
		cameraMode: NucleusSemanticView;
		selectedTarget: NucleusInterventionTarget | null;
		paused: boolean;
	}>;
</script>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import type {
		NucleusQualityChange,
		NucleusQualityChoice,
		NucleusRenderer
	} from '$lib/visualizations/weather-inside-nucleus/render/types';

	type Props = {
		trace: WeatherStageTrace | null;
		playbackTime?: number;
		introActive?: boolean;
		introProgress?: number;
		directedBeat?: NucleusDirectedBeat | null;
		directedProgress?: number;
		filmTime?: number;
		reducedMotion?: boolean;
		highContrast?: boolean;
		cameraMode?: NucleusSemanticView;
		selectedTarget?: NucleusInterventionTarget | null;
		paused?: boolean;
		active?: boolean;
		quality?: NucleusQualityChoice;
		label?: string;
		fallback?: Snippet<[WeatherStageFallbackContext]>;
		onframe?: (deltaSeconds: number) => void;
		onstatus?: (status: WeatherStageStatus, message: string) => void;
		onquality?: (change: NucleusQualityChange) => void;
		onmanualcamera?: () => void;
		onselecttarget?: (target: NucleusInterventionTarget) => void;
	};

	let {
		trace,
		playbackTime = 0,
		introActive = false,
		introProgress = 1,
		directedBeat = null,
		directedProgress = 0,
		filmTime = 0,
		reducedMotion = false,
		highContrast = false,
		cameraMode = 'cell',
		selectedTarget = null,
		paused = false,
		active = true,
		quality = 'auto',
		label = 'Three-dimensional schematic cell and nucleus. Drag to orbit within the selected semantic view. Equivalent labeled controls and the synchronized two-dimensional view provide every intervention and value.',
		fallback,
		onframe,
		onstatus,
		onquality,
		onmanualcamera,
		onselecttarget
	}: Props = $props();

	let shell!: HTMLDivElement;
	let canvas!: HTMLCanvasElement;
	let renderer = $state<NucleusRenderer | null>(null);
	let rendererStatus = $state<WeatherStageStatus>('loading');
	let statusMessage = $state('Preparing the three-dimensional nucleus…');
	let frameHandle = 0;
	let lastFrameTime = 0;
	let pointerId: number | null = null;
	let pointerStartX = 0;
	let pointerStartY = 0;

	let rendererTrace = $derived(adaptTrace(trace));
	let directedCanvasHidden = $derived(directedBeat === 'probability');
	let effectiveLabel = $derived(
		directedBeat
			? `Directed three-dimensional schematic for the ${directedBeat} guided-film beat. The guided controls provide the complete keyboard path.`
			: label
	);

	function adaptTrace(source: WeatherStageTrace | null): NucleusTraceBuffers | null {
		if (!source) return null;
		if ('sampleTimes' in source) return source;
		const result: SimulationResult = source;
		return {
			modelVersion: result.modelVersion,
			seed: result.seed,
			duration: result.parameters.duration,
			sampleTimes: result.timeline.time,
			signalInput: result.timeline.signalInput,
			receptorActivity: result.timeline.receptorActivity,
			downstreamActivity: result.timeline.downstreamActivity,
			nuclearActivity: result.timeline.nuclearActivity,
			occupancy: result.timeline.occupancy,
			licensing: result.timeline.licensing,
			contactPropensity: result.timeline.contactPropensity,
			contactState: result.timeline.contactState,
			promoterState: result.timeline.promoterState,
			rnaCount: result.timeline.rnaCount,
			initiationTimes: result.initiationTimes
		};
	}

	function canRender(): boolean {
		return renderer !== null && rendererStatus === 'ready';
	}

	function shouldRun(): boolean {
		if (!active || paused || document.hidden || rendererStatus === 'loading') return false;
		return (
			onframe !== undefined ||
			(canRender() && !reducedMotion && directedBeat === null && !directedCanvasHidden)
		);
	}

	function stopLoop(): void {
		if (frameHandle) cancelAnimationFrame(frameHandle);
		frameHandle = 0;
		lastFrameTime = 0;
	}

	function startLoop(): void {
		if (!frameHandle && shouldRun()) frameHandle = requestAnimationFrame(frame);
	}

	function frame(now: number): void {
		frameHandle = 0;
		if (!shouldRun()) return;
		const deltaSeconds = lastFrameTime
			? Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1_000))
			: 1 / 60;
		lastFrameTime = now;
		onframe?.(deltaSeconds);
		const current = renderer;
		if (current && rendererStatus === 'ready') {
			current.setPlaybackTime(playbackTime);
			current.setIntro(introActive, introProgress);
			current.setDirectedPresentation(directedBeat, directedProgress, filmTime);
			current.render(deltaSeconds);
		}
		if (shouldRun()) frameHandle = requestAnimationFrame(frame);
	}

	function renderOnce(current: NucleusRenderer | null = renderer): void {
		if (!current || rendererStatus !== 'ready') return;
		current.setPlaybackTime(playbackTime);
		current.setIntro(introActive, introProgress);
		current.setDirectedPresentation(directedBeat, directedProgress, filmTime);
		current.render(0);
	}

	function setStatus(next: WeatherStageStatus, message: string): void {
		const changed = rendererStatus !== next || statusMessage !== message;
		rendererStatus = next;
		statusMessage = message;
		if (changed) onstatus?.(next, message);
		if (shouldRun()) startLoop();
		else stopLoop();
	}

	function errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : 'This browser could not initialise WebGL 2.';
	}

	function beginPointer(event: PointerEvent): void {
		if (directedBeat || rendererStatus !== 'ready' || event.button !== 0 || pointerId !== null)
			return;
		pointerId = event.pointerId;
		pointerStartX = event.clientX;
		pointerStartY = event.clientY;
	}

	function finishPointer(event: PointerEvent): void {
		if (pointerId !== event.pointerId) return;
		const movement = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
		pointerId = null;
		if (directedBeat || movement > 8 || rendererStatus !== 'ready') return;
		const target = renderer?.pickTarget(event.clientX, event.clientY);
		if (target) onselecttarget?.(target);
	}

	function cancelPointer(): void {
		pointerId = null;
	}

	export function captureCanvas(): HTMLCanvasElement | null {
		return canRender() && !directedCanvasHidden ? (renderer?.captureCanvas() ?? null) : null;
	}

	$effect(() => {
		const current = renderer;
		const nextTrace = rendererTrace;
		if (!current) return;
		try {
			current.setTrace(nextTrace);
			if (rendererStatus === 'ready') current.render(0);
		} catch (error) {
			renderer = null;
			current.dispose();
			setStatus('fallback', `The trace could not be presented in 3D: ${errorMessage(error)}`);
		}
	});

	$effect(() => {
		const current = renderer;
		if (!current) return;
		current.setPlaybackTime(playbackTime);
		current.setIntro(introActive, introProgress);
		if (paused || reducedMotion || !active) renderOnce(current);
	});

	$effect(() => {
		const current = renderer;
		if (!current) return;
		current.setDirectedPresentation(directedBeat, directedProgress, filmTime);
		if (rendererStatus === 'ready') current.render(0);
		if (shouldRun()) startLoop();
		else stopLoop();
	});

	$effect(() => {
		const current = renderer;
		if (!current) return;
		current.setMotionAllowed(!reducedMotion);
		if (rendererStatus === 'ready') current.render(0);
	});

	$effect(() => {
		const current = renderer;
		if (!current) return;
		current.setHighContrast(highContrast);
		if (rendererStatus === 'ready') current.render(0);
	});

	$effect(() => {
		const current = renderer;
		if (!current) return;
		current.setView(cameraMode, { snap: reducedMotion });
		if (rendererStatus === 'ready') current.render(0);
	});

	$effect(() => {
		const current = renderer;
		if (!current) return;
		current.setSelectedTarget(selectedTarget);
		if (rendererStatus === 'ready') current.render(0);
	});

	$effect(() => {
		const current = renderer;
		if (!current) return;
		current.setQuality(quality);
		if (rendererStatus === 'ready') current.render(0);
	});

	$effect(() => {
		if (shouldRun()) startLoop();
		else stopLoop();
	});

	onMount(() => {
		let disposed = false;
		let resizeObserver: ResizeObserver | null = null;
		let bootstrapping = false;

		const handleVisibility = () => {
			if (document.hidden) stopLoop();
			else startLoop();
		};
		document.addEventListener('visibilitychange', handleVisibility);
		onstatus?.('loading', statusMessage);

		void (async () => {
			let created: NucleusRenderer | null = null;
			try {
				if (new URLSearchParams(window.location.search).get('webgl')?.toLowerCase() === 'off') {
					setStatus(
						'fallback',
						'Three-dimensional rendering is disabled by the webgl=off URL setting.'
					);
					return;
				}
				const { createNucleusRenderer } =
					await import('$lib/visualizations/weather-inside-nucleus/render/three-renderer');
				if (disposed) return;
				bootstrapping = true;
				created = createNucleusRenderer(canvas, {
					quality,
					motionAllowed: !reducedMotion,
					highContrast,
					callbacks: {
						onStatus: (status, message) => {
							if (disposed || bootstrapping) return;
							if (status === 'ready') {
								setStatus('ready', message ?? 'Three-dimensional nucleus ready.');
								queueMicrotask(() => {
									if (disposed) return;
									renderer?.resize();
									renderOnce();
								});
							} else if (status === 'context-lost') {
								setStatus(
									'context-lost',
									message ?? 'The WebGL context was interrupted; the 2D view remains synchronized.'
								);
							} else {
								setStatus(
									'fallback',
									message ?? 'The three-dimensional nucleus could not continue.'
								);
							}
						},
						onQualityChange: (change) => onquality?.(change),
						onManualCamera: () => {
							onmanualcamera?.();
							if (!shouldRun()) renderOnce();
						}
					}
				});
				bootstrapping = false;
				if (disposed) {
					created.dispose();
					return;
				}
				renderer = created;
				created.resize();
				created.setTrace(rendererTrace);
				created.setPlaybackTime(playbackTime);
				created.setIntro(introActive, introProgress);
				created.setDirectedPresentation(directedBeat, directedProgress, filmTime);
				created.setMotionAllowed(!reducedMotion);
				created.setHighContrast(highContrast);
				created.setView(cameraMode, { snap: true });
				created.setSelectedTarget(selectedTarget);
				created.render(0);
				setStatus('ready', 'Three-dimensional nucleus ready.');
				resizeObserver = new ResizeObserver(() => {
					renderer?.resize();
					renderOnce();
				});
				resizeObserver.observe(shell);
				startLoop();
			} catch (error) {
				bootstrapping = false;
				if (disposed) return;
				created?.dispose();
				if (renderer === created) renderer = null;
				setStatus(
					'fallback',
					`The three-dimensional nucleus could not start: ${errorMessage(error)}`
				);
			}
		})();

		return () => {
			disposed = true;
			stopLoop();
			cancelPointer();
			resizeObserver?.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			const current = renderer;
			renderer = null;
			current?.dispose();
		};
	});
</script>

<div
	bind:this={shell}
	class:high-contrast={highContrast}
	class:reduced-motion={reducedMotion}
	class:directed-probability={directedCanvasHidden}
	class="weather-stage"
	data-renderer-status={rendererStatus}
	data-directed-beat={directedBeat ?? undefined}
>
	{#if rendererStatus !== 'ready'}
		<div class="fallback-layer" data-fallback-status={rendererStatus}>
			{#if fallback}
				{@render fallback({
					status: rendererStatus,
					message: statusMessage,
					trace: rendererTrace,
					playbackTime,
					introActive,
					introProgress,
					directedBeat,
					directedProgress,
					filmTime,
					reducedMotion,
					highContrast,
					cameraMode,
					selectedTarget,
					paused
				})}
			{:else}
				<div class="default-fallback" role="status">
					<strong
						>{rendererStatus === 'loading' ? 'Preparing the nucleus…' : '2D view active'}</strong
					>
					<span>{statusMessage}</span>
				</div>
			{/if}
		</div>
	{/if}

	<canvas
		bind:this={canvas}
		class:visible={rendererStatus === 'ready' && !directedCanvasHidden}
		class:directed={directedBeat !== null}
		aria-label={effectiveLabel}
		aria-describedby="wn-three-dimensional-description"
		aria-hidden={rendererStatus === 'ready' && !directedCanvasHidden ? undefined : 'true'}
		onpointerdown={beginPointer}
		onpointerup={finishPointer}
		onpointercancel={cancelPointer}
		onlostpointercapture={cancelPointer}
	></canvas>
	<p id="wn-three-dimensional-description" class="sr-only">
		This consumes the same scientific trace as the labeled two-dimensional view. The semantic view
		and intervention controls outside the canvas provide the complete keyboard path.
	</p>

	{#if fallback && rendererStatus !== 'ready'}
		<p class="status-note" role="status">{statusMessage}</p>
	{/if}
</div>

<style>
	.weather-stage {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 25rem;
		overflow: hidden;
		background: #050712;
		isolation: isolate;
		touch-action: pan-y pinch-zoom;
	}

	.fallback-layer,
	canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	.fallback-layer {
		z-index: 1;
		min-width: 0;
		min-height: inherit;
	}

	canvas {
		z-index: 2;
		opacity: 0;
		outline: none;
		pointer-events: none;
		touch-action: pan-y pinch-zoom;
		transition: opacity 220ms ease;
	}

	canvas.visible {
		opacity: 1;
		pointer-events: auto;
	}

	canvas.visible.directed,
	.weather-stage.directed-probability canvas {
		pointer-events: none;
	}

	.weather-stage.directed-probability canvas {
		opacity: 0;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.default-fallback {
		position: absolute;
		left: 50%;
		top: 50%;
		display: grid;
		width: min(88%, 32rem);
		transform: translate(-50%, -50%);
		gap: 0.35rem;
		border: 1px solid rgb(247 251 255 / 26%);
		border-radius: 0.55rem;
		background: rgb(5 7 18 / 92%);
		padding: 0.85rem 1rem;
		color: #f7fbff;
		font-size: 0.8rem;
		line-height: 1.45;
	}

	.default-fallback strong {
		color: #ffd166;
	}

	.default-fallback span {
		color: #c8c9d8;
	}

	.status-note {
		position: absolute;
		right: 0.65rem;
		bottom: 0.6rem;
		z-index: 3;
		max-width: min(80%, 34rem);
		margin: 0;
		border: 1px solid rgb(247 251 255 / 24%);
		border-radius: 999px;
		background: rgb(5 7 18 / 88%);
		padding: 0.35rem 0.65rem;
		color: #d8d9e5;
		font:
			650 0.65rem/1.35 ui-monospace,
			monospace;
	}

	.weather-stage.high-contrast {
		background: #000;
	}

	.weather-stage.high-contrast .status-note,
	.weather-stage.high-contrast .default-fallback {
		border-color: #fff;
		background: #000;
		color: #fff;
	}

	@media (max-width: 640px) {
		.weather-stage {
			min-height: 22rem;
		}
	}

	@media (max-width: 360px) {
		.weather-stage {
			min-height: 19rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		canvas {
			transition: none;
		}
	}

	.weather-stage.reduced-motion canvas {
		transition: none;
	}

	@media (forced-colors: active) {
		.weather-stage,
		.default-fallback,
		.status-note {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
