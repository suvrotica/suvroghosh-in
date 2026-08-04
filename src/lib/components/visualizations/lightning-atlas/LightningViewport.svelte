<script lang="ts">
	import { onMount } from 'svelte';
	import type { LightningRenderer } from '$lib/visualizations/lightning-atlas/render/types';
	import type {
		LightningFlash,
		SerializableAtlasState,
		StormPhase,
		TerrainData
	} from '$lib/visualizations/lightning-atlas/types';

	type Props = {
		atlasState: SerializableAtlasState;
		terrain: TerrainData;
		flash: LightningFlash | null;
		phase: StormPhase;
		phaseProgress: number;
		playbackTime: number;
		active: boolean;
		playing: boolean;
		motionAllowed: boolean;
		branchEmphasis?: 'primary' | 'full';
		placementEnabled?: boolean;
		onframe?: (deltaSeconds: number) => void;
		onplace?: (position: { x: number; z: number }) => void;
		onstatus?: (status: 'loading' | 'ready' | 'fallback' | 'context-lost', message: string) => void;
		onquality?: (quality: 'low' | 'medium' | 'high', frameMs: number) => void;
		onmanualcamera?: () => void;
	};

	let {
		atlasState,
		terrain,
		flash,
		phase,
		phaseProgress,
		playbackTime,
		active,
		playing,
		motionAllowed,
		branchEmphasis = 'full',
		placementEnabled = false,
		onframe,
		onplace,
		onstatus,
		onquality,
		onmanualcamera
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let renderer = $state<LightningRenderer | null>(null);
	let rendererStatus = $state<'loading' | 'ready' | 'fallback' | 'context-lost'>('loading');
	let statusMessage = $state('Preparing the three-dimensional storm…');
	let frameHandle = 0;
	let lastFrame = 0;
	let pointerStart: { x: number; y: number } | null = null;

	function stopLoop() {
		if (frameHandle) cancelAnimationFrame(frameHandle);
		frameHandle = 0;
		lastFrame = 0;
	}

	function frame(now: number) {
		frameHandle = 0;
		if (!shouldRun() || document.hidden) return;
		const delta = lastFrame ? Math.min(0.1, (now - lastFrame) / 1_000) : 1 / 60;
		lastFrame = now;
		onframe?.(delta);
		if (canRender()) renderer?.render(delta);
		if (shouldRun()) frameHandle = requestAnimationFrame(frame);
	}

	function canRender() {
		return renderer !== null && rendererStatus === 'ready';
	}

	function shouldRun() {
		return active && (playing || (motionAllowed && canRender()));
	}

	function startLoop() {
		if (!frameHandle && shouldRun() && !document.hidden) {
			frameHandle = requestAnimationFrame(frame);
		}
	}

	function renderOnce() {
		if (canRender()) renderer?.render(0, { snapCamera: !motionAllowed });
	}

	function handlePointerDown(event: PointerEvent) {
		pointerStart = { x: event.clientX, y: event.clientY };
	}

	function handlePointerUp(event: PointerEvent) {
		if (!placementEnabled || !pointerStart || !renderer) {
			pointerStart = null;
			return;
		}
		const movement = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
		pointerStart = null;
		if (movement > 8) return;
		const position = renderer.pickNormalized(event.clientX, event.clientY);
		if (position) onplace?.(position);
	}

	function cancelPointer() {
		pointerStart = null;
	}

	export function captureCanvas() {
		return renderer?.captureCanvas() ?? canvas;
	}

	$effect(() => {
		if (!renderer) return;
		renderer.setScene(atlasState, terrain);
		renderOnce();
	});

	$effect(() => {
		renderer?.setFlash(flash);
		renderOnce();
	});

	$effect(() => {
		renderer?.setPlayback({ phase, phaseProgress, time: playbackTime });
		if (!shouldRun()) renderOnce();
	});

	$effect(() => {
		renderer?.setBranchEmphasis?.(branchEmphasis);
		renderOnce();
	});

	$effect(() => {
		renderer?.setMotionAllowed?.(motionAllowed);
		renderOnce();
	});

	$effect(() => {
		if (shouldRun()) startLoop();
		else stopLoop();
	});

	onMount(() => {
		let resizeObserver: ResizeObserver | null = null;
		let disposed = false;
		const updateVisibility = () => {
			if (document.hidden) stopLoop();
			else startLoop();
		};
		document.addEventListener('visibilitychange', updateVisibility);
		onstatus?.('loading', statusMessage);

		void (async () => {
			try {
				if (new URLSearchParams(window.location.search).get('webgl') === 'off') {
					throw new Error('WebGL disabled for this deterministic fallback view.');
				}
				const { createLightningRenderer } =
					await import('$lib/visualizations/lightning-atlas/render/three-renderer');
				if (disposed) return;
				renderer = createLightningRenderer(canvas, {
					onStatus: (status, message) => {
						rendererStatus = status === 'error' ? 'fallback' : status;
						statusMessage =
							message ??
							(status === 'ready'
								? 'Three-dimensional storm ready.'
								: 'The three-dimensional context was interrupted.');
						onstatus?.(rendererStatus, statusMessage);
						if (rendererStatus === 'ready') queueMicrotask(renderOnce);
					},
					onQualityChange: (quality, averageFrameMs) => onquality?.(quality, averageFrameMs),
					onManualCamera: () => {
						onmanualcamera?.();
						renderOnce();
					}
				});
				renderer.resize();
				renderer.setScene(atlasState, terrain);
				renderer.setFlash(flash);
				renderer.setBranchEmphasis?.(branchEmphasis);
				renderer.setMotionAllowed?.(motionAllowed);
				renderer.setPlayback({ phase, phaseProgress, time: playbackTime });
				renderOnce();
				rendererStatus = 'ready';
				statusMessage = 'Three-dimensional storm ready.';
				onstatus?.('ready', statusMessage);
				resizeObserver = new ResizeObserver(() => {
					renderer?.resize();
					renderOnce();
				});
				resizeObserver.observe(canvas);
				startLoop();
			} catch (error) {
				if (disposed) return;
				rendererStatus = 'fallback';
				statusMessage =
					error instanceof Error
						? `The three-dimensional storm could not start: ${error.message}`
						: 'The three-dimensional storm could not start on this device.';
				onstatus?.('fallback', statusMessage);
				startLoop();
			}
		})();

		return () => {
			disposed = true;
			stopLoop();
			resizeObserver?.disconnect();
			document.removeEventListener('visibilitychange', updateVisibility);
			renderer?.dispose();
			renderer = null;
		};
	});
</script>

<div
	class:placement-active={placementEnabled}
	class="viewport-frame"
	data-renderer-status={rendererStatus}
>
	<img
		src="/images/lightning-atlas.png"
		alt=""
		class:loaded={rendererStatus === 'ready'}
		class="poster"
		loading="eager"
		fetchpriority="high"
	/>
	<canvas
		bind:this={canvas}
		class:visible={rendererStatus === 'ready' || rendererStatus === 'context-lost'}
		onpointerdown={handlePointerDown}
		onpointerup={handlePointerUp}
		onpointercancel={cancelPointer}
		onlostpointercapture={cancelPointer}
		aria-label="Three-dimensional procedural storm scene. Use the view selector, controls and synchronized analytical views for keyboard-accessible views and exact values. Pointer users can drag to orbit and use the mouse wheel or pinch gesture to zoom."
		tabindex="0"
	></canvas>

	{#if rendererStatus === 'loading'}
		<div class="status-card" role="status">Preparing terrain, cloud and charge layers…</div>
	{:else if rendererStatus === 'fallback'}
		<div class="fallback-card" role="status">
			<strong>The three-dimensional storm could not start on this device.</strong>
			<span>The cross-section, strike replay and storm records remain available below.</span>
		</div>
	{:else if rendererStatus === 'context-lost'}
		<div class="status-card" role="status">
			Context interrupted; waiting for the browser to restore it.
		</div>
	{/if}

	<div class="scene-caption" aria-hidden="true">
		<span>{atlasState.displayMode === 'field-map' ? 'FIELD MAP' : 'NIGHT INSTRUMENT'}</span>
		<span>{terrain.preset.replaceAll('-', ' ')}</span>
		<span>{rendererStatus === 'ready' ? '3D READY' : 'ANALYTICAL FALLBACK'}</span>
	</div>
</div>

<style>
	.viewport-frame {
		position: relative;
		min-height: 27rem;
		width: 100%;
		overflow: hidden;
		background: #07101f;
		isolation: isolate;
		touch-action: pan-y;
	}

	.viewport-frame.placement-active {
		cursor: crosshair;
		touch-action: none;
	}

	.poster,
	canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	.poster {
		object-fit: cover;
		transition: opacity 500ms ease;
	}

	.poster.loaded {
		opacity: 0;
		pointer-events: none;
	}

	canvas {
		opacity: 0;
		outline: none;
		transition: opacity 400ms ease;
	}

	canvas.visible {
		opacity: 1;
	}

	canvas:focus-visible {
		box-shadow: inset 0 0 0 3px #e5c56f;
	}

	.status-card,
	.fallback-card {
		position: absolute;
		left: 50%;
		bottom: 3.25rem;
		z-index: 3;
		max-width: min(90%, 34rem);
		transform: translateX(-50%);
		border: 1px solid rgb(255 255 255 / 0.28);
		border-radius: 0.5rem;
		background: rgb(5 11 22 / 0.88);
		padding: 0.7rem 0.9rem;
		color: #e7edf7;
		font-size: 0.78rem;
		line-height: 1.45;
		backdrop-filter: blur(8px);
	}

	.fallback-card {
		display: grid;
		gap: 0.25rem;
		bottom: 4rem;
	}

	.scene-caption {
		position: absolute;
		inset: auto 0 0;
		z-index: 2;
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		background: linear-gradient(transparent, rgb(5 10 19 / 0.88));
		padding: 2.5rem 0.85rem 0.65rem;
		color: rgb(224 232 244 / 0.7);
		font-family: 'Courier Prime', monospace;
		font-size: 0.64rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	@media (max-width: 640px) {
		.viewport-frame {
			min-height: 22rem;
		}

		.scene-caption span:nth-child(2) {
			display: none;
		}
	}

	@media (max-width: 360px) {
		.viewport-frame {
			min-height: 19rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.poster,
		canvas {
			transition: none;
		}
	}
</style>
