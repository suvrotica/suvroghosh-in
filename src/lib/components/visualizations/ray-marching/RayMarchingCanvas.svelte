<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		mountRayMarchingSketch,
		type RayMarchingRenderSnapshot,
		type RayMarchingSketchController,
		type RayMarchingSketchStatus
	} from '$lib/visualizations/experiments/ray-marching/sketch';
	import { normalizeRayMarchingPointer } from '$lib/visualizations/experiments/ray-marching/interaction';
	import { clampRayMarchingCamera } from '$lib/visualizations/experiments/ray-marching/state';
	import type {
		RayMarchingCamera,
		RayMarchingQualityTier
	} from '$lib/visualizations/experiments/ray-marching/types';
	import type { RayMarchingQualityHints } from '$lib/visualizations/experiments/ray-marching/quality';

	type Props = {
		snapshot: RayMarchingRenderSnapshot;
		qualityHints: RayMarchingQualityHints;
		load: boolean;
		generation: number;
		expanded: boolean;
		interactive: boolean;
		reducedMotion: boolean;
		restartToken: number;
		pulseToken: number;
		pulseStatic: boolean;
		onstatus: (status: RayMarchingSketchStatus, message: string) => void;
		onready: (canvas: HTMLCanvasElement) => void;
		oncontextrestored: () => void;
		onqualitydowngrade: (from: RayMarchingQualityTier, to: RayMarchingQualityTier) => void;
		oncamera: (camera: RayMarchingCamera) => void;
		onpulse: () => void;
		ontoggleplayback: () => void;
	};

	let {
		snapshot,
		qualityHints,
		load,
		generation,
		expanded,
		interactive,
		reducedMotion,
		restartToken,
		pulseToken,
		pulseStatic,
		onstatus,
		onready,
		oncontextrestored,
		onqualitydowngrade,
		oncamera,
		onpulse,
		ontoggleplayback
	}: Props = $props();

	let host: HTMLDivElement;
	let mounted = $state(false);
	let controller: RayMarchingSketchController | null = null;
	let activeMount = 0;
	let attemptedGeneration = -1;
	let resizeFrame = 0;
	let lastWidth = 0;
	let lastHeight = 0;
	let handledRestartToken = 0;
	let handledPulseToken = 0;

	type PointerGesture = {
		id: number;
		kind: string;
		startX: number;
		startY: number;
		lastX: number;
		lastY: number;
		dragging: boolean;
		verticalIntent: boolean;
	};

	let gesture: PointerGesture | null = null;
	const DRAG_THRESHOLD = 7;
	const canvasLabel =
		'Interactive view of The Cathedral of Distance. Drag horizontally to turn, use arrow keys to adjust the camera, Home to centre it, P to pulse, and Space to pause or start.';

	function mountErrorMessage(error: unknown): string {
		const detail = error instanceof Error ? error.message : String(error);
		return `The interactive renderer could not start: ${detail.replace(/\s+/gu, ' ').trim().slice(0, 220) || 'unknown loading error'}`;
	}

	function scheduleResize() {
		if (!host || resizeFrame) return;
		resizeFrame = requestAnimationFrame(() => {
			resizeFrame = 0;
			const width = Math.round(host.getBoundingClientRect().width);
			const height = Math.round(host.getBoundingClientRect().height);
			if (width <= 0 || height <= 0 || (width === lastWidth && height === lastHeight)) return;
			lastWidth = width;
			lastHeight = height;
			controller?.resize(width, height);
		});
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		host.focus({ preventScroll: true });
		gesture = {
			id: event.pointerId,
			kind: event.pointerType,
			startX: event.clientX,
			startY: event.clientY,
			lastX: event.clientX,
			lastY: event.clientY,
			dragging: false,
			verticalIntent: false
		};
	}

	function handlePointerMove(event: PointerEvent) {
		if (!gesture || gesture.id !== event.pointerId) return;
		const totalX = event.clientX - gesture.startX;
		const totalY = event.clientY - gesture.startY;
		const distance = Math.hypot(totalX, totalY);

		if (!gesture.dragging) {
			if (gesture.kind === 'touch' && !expanded) {
				if (Math.abs(totalY) > DRAG_THRESHOLD && Math.abs(totalY) > Math.abs(totalX) * 1.15) {
					gesture.verticalIntent = true;
					return;
				}
				if (Math.abs(totalX) <= DRAG_THRESHOLD || Math.abs(totalX) <= Math.abs(totalY) * 1.2) {
					return;
				}
			} else if (distance <= DRAG_THRESHOLD) {
				return;
			}

			gesture.dragging = true;
			host.setPointerCapture?.(event.pointerId);
		}

		if (gesture.verticalIntent) return;
		event.preventDefault();
		const rect = host.getBoundingClientRect();
		// Normalisation is shared with unit tests and includes the DOM-to-GL y inversion.
		const current = normalizeRayMarchingPointer(event.clientX, event.clientY, rect);
		const previous = normalizeRayMarchingPointer(gesture.lastX, gesture.lastY, rect);
		const camera = clampRayMarchingCamera({
			yaw: snapshot.camera.yaw + (current.x - previous.x) * 1.25,
			pitch: snapshot.camera.pitch + (current.y - previous.y) * 0.72
		});
		gesture.lastX = event.clientX;
		gesture.lastY = event.clientY;
		oncamera(camera);
	}

	function finishPointer(event: PointerEvent, cancelled = false) {
		if (!gesture || gesture.id !== event.pointerId) return;
		const completed = gesture;
		gesture = null;
		if (host.hasPointerCapture?.(event.pointerId)) host.releasePointerCapture(event.pointerId);
		const distance = Math.hypot(event.clientX - completed.startX, event.clientY - completed.startY);
		if (
			!cancelled &&
			!completed.dragging &&
			!completed.verticalIntent &&
			distance < DRAG_THRESHOLD
		) {
			onpulse();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		let handled = true;
		const cameraStep = event.shiftKey ? 0.08 : 0.035;
		switch (event.key) {
			case 'ArrowLeft':
				oncamera(
					clampRayMarchingCamera({ ...snapshot.camera, yaw: snapshot.camera.yaw - cameraStep })
				);
				break;
			case 'ArrowRight':
				oncamera(
					clampRayMarchingCamera({ ...snapshot.camera, yaw: snapshot.camera.yaw + cameraStep })
				);
				break;
			case 'ArrowUp':
				oncamera(
					clampRayMarchingCamera({ ...snapshot.camera, pitch: snapshot.camera.pitch + cameraStep })
				);
				break;
			case 'ArrowDown':
				oncamera(
					clampRayMarchingCamera({ ...snapshot.camera, pitch: snapshot.camera.pitch - cameraStep })
				);
				break;
			case 'Home':
				oncamera({ yaw: 0, pitch: 0 });
				break;
			case 'p':
			case 'P':
				onpulse();
				break;
			case ' ':
				ontoggleplayback();
				break;
			default:
				handled = false;
		}
		if (handled) event.preventDefault();
	}

	onMount(() => {
		mounted = true;
		const resizeObserver = new ResizeObserver(scheduleResize);
		resizeObserver.observe(host);
		const handleOrientation = () => scheduleResize();
		window.addEventListener('orientationchange', handleOrientation, { passive: true });
		scheduleResize();

		return () => {
			mounted = false;
			activeMount += 1;
			resizeObserver.disconnect();
			window.removeEventListener('orientationchange', handleOrientation);
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
			resizeFrame = 0;
			controller?.destroy();
			controller = null;
		};
	});

	$effect(() => {
		const requestedGeneration = generation;
		if (!mounted || !load || !host || requestedGeneration === attemptedGeneration) return;
		attemptedGeneration = requestedGeneration;
		const mountId = ++activeMount;
		controller?.destroy();
		controller = null;
		void mountRayMarchingSketch({
			host,
			qualityHints: untrack(() => qualityHints),
			getSnapshot: () => snapshot,
			isCancelled: () => !mounted || mountId !== activeMount || requestedGeneration !== generation,
			onStatus: (status, message) => {
				if (mountId === activeMount) onstatus(status, message);
			},
			onReady: (canvas) => {
				if (mountId === activeMount) onready(canvas);
			},
			onContextRestored: oncontextrestored,
			onQualityDowngrade: onqualitydowngrade
		})
			.then((mountedController) => {
				if (!mountedController) return;
				if (!mounted || mountId !== activeMount) {
					mountedController.destroy();
					return;
				}
				controller = mountedController;
				if (restartToken !== handledRestartToken) {
					handledRestartToken = restartToken;
					controller.restart();
				}
				if (pulseToken !== handledPulseToken) {
					handledPulseToken = pulseToken;
					controller.pulse(pulseStatic || (reducedMotion && !snapshot.playing));
				}
				scheduleResize();
			})
			.catch((error: unknown) => {
				if (!mounted || mountId !== activeMount) return;
				controller = null;
				onstatus('shader-error', mountErrorMessage(error));
			});
	});

	$effect(() => {
		// Reading all fields makes paused parameter changes redraw one—and only one—frame.
		void snapshot.stage;
		void snapshot.debugView;
		void snapshot.palette;
		void snapshot.fogAmount;
		void snapshot.pulseSpeed;
		void snapshot.focalLength;
		void snapshot.camera.yaw;
		void snapshot.camera.pitch;
		void snapshot.playing;
		void snapshot.suspended;
		void snapshot.qualityChoice;
		void snapshot.qualityTier;
		if (!controller) return;
		controller.syncPlayback();
		if (!snapshot.playing || snapshot.suspended || snapshot.stage !== 8) controller.redraw();
	});

	$effect(() => {
		const token = restartToken;
		if (!controller || token === handledRestartToken) return;
		handledRestartToken = token;
		controller.restart();
	});

	$effect(() => {
		const token = pulseToken;
		if (!controller || token === handledPulseToken) return;
		handledPulseToken = token;
		controller.pulse(pulseStatic || (reducedMotion && !snapshot.playing));
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (the labelled surface intentionally exposes its documented keyboard controls) -->
<div
	bind:this={host}
	class:expanded
	class:inactive={!interactive}
	class="ray-marching-canvas"
	role={interactive ? 'application' : undefined}
	tabindex={interactive ? 0 : -1}
	aria-label={interactive ? canvasLabel : undefined}
	aria-hidden={!interactive}
	inert={!interactive}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={(event) => finishPointer(event)}
	onpointercancel={(event) => finishPointer(event, true)}
	onkeydown={handleKeydown}
></div>

<style>
	.ray-marching-canvas {
		position: absolute;
		inset: 0;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		outline: none;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
	}

	.ray-marching-canvas.expanded {
		touch-action: none;
	}

	.ray-marching-canvas.inactive {
		pointer-events: none;
	}

	.ray-marching-canvas:focus-visible {
		box-shadow: inset 0 0 0 3px rgb(103 232 249 / 0.9);
	}

	.ray-marching-canvas :global(canvas) {
		display: block;
		width: 100% !important;
		height: 100% !important;
		touch-action: pan-y !important;
	}

	.ray-marching-canvas.expanded :global(canvas) {
		touch-action: none !important;
	}
</style>
