<script lang="ts">
	import { onMount } from 'svelte';
	import { renderReactionDiffusionToCanvas } from '$lib/visualizations/reaction-diffusion/display';
	import type {
		DisplayMode,
		FieldState,
		GrayScottSetup,
		PaletteId
	} from '$lib/visualizations/reaction-diffusion/types';

	type Point = readonly [number, number];
	type FieldCommand =
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
	type Props = {
		field: FieldState | null;
		setup: GrayScottSetup;
		revision?: number;
		displayMode?: DisplayMode;
		palette?: PaletteId;
		diagnosticScale?: number;
		selected?: Point;
		interactive?: boolean;
		interactionMode?: 'inspect' | 'paint';
		applicationMode?: 'once' | 'path';
		label?: string;
		poster?: string;
		onselect?: (point: Point) => void;
		onstroke?: (from: Point, to: Point) => void;
		oncanvas?: (canvas: HTMLCanvasElement | null) => void;
		oncommand?: (command: FieldCommand) => void;
	};

	let {
		field,
		setup,
		revision = 0,
		displayMode = 'v',
		palette = 'mineral',
		diagnosticScale = 12,
		selected = [0.5, 0.5],
		interactive = true,
		interactionMode = 'inspect',
		applicationMode = 'path',
		label = 'Gray–Scott concentration field',
		poster = '/images/reaction-diffusion-atlas-field.png',
		onselect,
		onstroke,
		oncanvas,
		oncommand
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement>();
	let context: CanvasRenderingContext2D | null = null;
	let sourceCanvas: HTMLCanvasElement | null = null;
	let drawing = false;
	let previousPoint: Point | null = null;
	let ready = $state(false);

	$effect(() => {
		revision.toString();
		field?.size.toString();
		displayMode.toString();
		palette.toString();
		diagnosticScale.toString();
		setup.feed.toString();
		setup.kill.toString();
		setup.diffusionV.toString();
		setup.domainWidth.toString();
		setup.boundary.toString();
		selected[0].toString();
		selected[1].toString();
		draw();
	});

	onMount(() => {
		if (!canvas) return;
		context = canvas.getContext('2d', { alpha: false });
		sourceCanvas = document.createElement('canvas');
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();
		oncanvas?.(canvas);
		return () => {
			observer.disconnect();
			oncanvas?.(null);
			context = null;
			sourceCanvas = null;
		};
	});

	function resize() {
		if (!canvas) return;
		const bounds = canvas.getBoundingClientRect();
		const density = Math.min(window.devicePixelRatio || 1, 1.5);
		const width = Math.max(1, Math.round(bounds.width * density));
		const height = Math.max(1, Math.round(bounds.height * density));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		draw();
	}

	function draw() {
		if (!canvas || !context || !sourceCanvas || !field) return;
		const { size, u, v, mask } = field;
		if (u.length !== size * size || v.length !== size * size || mask.length !== size * size) return;
		renderReactionDiffusionToCanvas(sourceCanvas, field, setup, {
			mode: displayMode,
			palette,
			diagnosticScale
		});
		context.imageSmoothingEnabled = false;
		context.fillStyle = '#101516';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);

		const x = selected[0] * canvas.width;
		const y = selected[1] * canvas.height;
		const radius = Math.max(5, canvas.width / Math.max(60, size));
		context.save();
		context.strokeStyle = '#fff8dc';
		context.lineWidth = Math.max(1.5, canvas.width / 420);
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
		context.moveTo(x - radius * 1.8, y);
		context.lineTo(x + radius * 1.8, y);
		context.moveTo(x, y - radius * 1.8);
		context.lineTo(x, y + radius * 1.8);
		context.stroke();
		context.restore();
		ready = true;
	}

	function pointFromEvent(event: PointerEvent): Point {
		const bounds = canvas!.getBoundingClientRect();
		return [
			Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
			Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
		];
	}

	function handlePointerDown(event: PointerEvent) {
		if (!interactive || !canvas) return;
		const point = pointFromEvent(event);
		onselect?.(point);
		if (interactionMode === 'inspect') return;
		if (applicationMode === 'once') {
			onstroke?.(point, point);
			return;
		}
		canvas.setPointerCapture(event.pointerId);
		drawing = true;
		previousPoint = point;
	}

	function handlePointerEnd(event: PointerEvent) {
		if (drawing && previousPoint && event.type === 'pointerup') {
			const point = pointFromEvent(event);
			onselect?.(point);
			const distance = Math.hypot(point[0] - previousPoint[0], point[1] - previousPoint[1]);
			// A tap selects a cell for inspection. A deliberate drag records one
			// deterministic model-space segment instead of raw pointer-event noise.
			if (distance >= 0.002) onstroke?.(previousPoint, point);
		}
		if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		drawing = false;
		previousPoint = null;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!interactive) return;
		const step = field ? 1 / field.size : 1 / 128;
		let point: Point | null = null;
		if (event.key === 'ArrowLeft') point = [Math.max(0, selected[0] - step), selected[1]];
		if (event.key === 'ArrowRight') point = [Math.min(1, selected[0] + step), selected[1]];
		if (event.key === 'ArrowUp') point = [selected[0], Math.max(0, selected[1] - step)];
		if (event.key === 'ArrowDown') point = [selected[0], Math.min(1, selected[1] + step)];
		if (point) {
			event.preventDefault();
			onselect?.(point);
		}
		if (event.key === 'Enter' && selected && interactionMode === 'paint') {
			event.preventDefault();
			onstroke?.(selected, selected);
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
									? (`tool-${event.key}` as FieldCommand)
									: event.key === 'Escape'
										? 'cancel'
										: null;
		if (command) {
			event.preventDefault();
			oncommand?.(command);
		}
	}
</script>

<div class="field-frame" class:is-ready={ready}>
	<img class="poster" src={poster} alt="" aria-hidden="true" />
	<canvas
		bind:this={canvas}
		class:painting={interactionMode === 'paint'}
		tabindex={interactive ? 0 : undefined}
		aria-label={label}
		onpointerdown={handlePointerDown}
		onpointerup={handlePointerEnd}
		onpointercancel={handlePointerEnd}
		onlostpointercapture={handlePointerEnd}
		onkeydown={handleKeydown}
	></canvas>
	<div class="field-corners" aria-hidden="true"><span>U</span><span>V</span></div>
</div>

<style>
	.field-frame {
		position: relative;
		isolation: isolate;
		aspect-ratio: 1;
		width: 100%;
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--essay-ink, #25302e) 30%, transparent);
		border-radius: 0.8rem;
		background: #0b1112;
		box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 0.2);
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
		z-index: -1;
		object-fit: cover;
	}
	canvas {
		opacity: 0;
		touch-action: pan-y;
		transition: opacity 180ms ease;
	}
	canvas.painting {
		touch-action: none;
	}
	.is-ready canvas {
		opacity: 1;
	}
	canvas:focus-visible {
		outline: 3px solid #f4d58a;
		outline-offset: -5px;
	}
	.field-corners {
		position: absolute;
		inset: 0.65rem;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		pointer-events: none;
		font:
			700 0.68rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
		color: rgb(255 248 220 / 0.72);
	}
	@media (prefers-reduced-motion: reduce) {
		canvas {
			transition: none;
		}
	}
</style>
