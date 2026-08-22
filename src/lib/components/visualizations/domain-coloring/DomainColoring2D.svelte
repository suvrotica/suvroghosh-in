<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		DomainColoringRenderer,
		niceGridStep,
		panViewport,
		screenToComplex,
		viewportBounds,
		viewportPlotRect,
		zoomViewport,
		type Complex,
		type ComplexFeature,
		type ExplorerState,
		type ExpressionNode,
		type Viewport
	} from '$lib/visualizations/domain-coloring';
	import { renderPixelDensity } from '$lib/visualizations/webgl';

	type Props = {
		explorer: ExplorerState;
		node: ExpressionNode;
		functionSource: string;
		active?: boolean;
		fallbackPoster: string;
		pinnedPoint?: Complex | null;
		features?: readonly ComplexFeature[];
		descriptionId: string;
		onviewport?: (viewport: Viewport) => void;
		onhover?: (z: Complex) => void;
		onpin?: (z: Complex) => void;
		onreset?: () => void;
		onstatus?: (status: 'ready' | 'fallback' | 'context-lost', message: string) => void;
	};

	let {
		explorer,
		node,
		functionSource,
		active = true,
		fallbackPoster,
		pinnedPoint = null,
		features = [],
		descriptionId,
		onviewport,
		onhover,
		onpin,
		onreset,
		onstatus
	}: Props = $props();

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let overlay: HTMLCanvasElement;
	let renderer: DomainColoringRenderer | null = null;
	let observer: ResizeObserver | null = null;
	let stageWidth = 1;
	let stageHeight = 1;
	let density = 1;
	let renderState = $state<'loading' | 'ready' | 'fallback' | 'context-lost'>('loading');
	let engaged = $state(false);
	let pointers = new SvelteMap<number, { x: number; y: number }>();
	let previousGesture: { x: number; y: number; distance: number } | null = null;
	let pointerStart: { x: number; y: number } | null = null;

	export function captureCanvas() {
		redraw();
		return canvas;
	}

	function resize() {
		if (!host || !canvas || !overlay) return;
		const rect = host.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return;
		stageWidth = rect.width;
		stageHeight = rect.height;
		density = renderPixelDensity();
		renderer?.resize(rect.width, rect.height, density);
		overlay.width = Math.max(1, Math.round(rect.width * density));
		overlay.height = Math.max(1, Math.round(rect.height * density));
		overlay.style.width = `${rect.width}px`;
		overlay.style.height = `${rect.height}px`;
		redraw();
	}

	function redraw() {
		if (!active) return;
		renderer?.setContours(explorer.overlays.contours);
		renderer?.render(explorer.viewport);
		drawOverlay();
	}

	function drawOverlay() {
		if (!overlay || stageWidth < 1 || stageHeight < 1) return;
		const context = overlay.getContext('2d');
		if (!context) return;
		context.setTransform(density, 0, 0, density, 0, 0);
		context.clearRect(0, 0, stageWidth, stageHeight);
		const bounds = viewportBounds(explorer.viewport);
		const plot = viewportPlotRect(explorer.viewport, stageWidth, stageHeight);
		const toScreen = (point: Complex) => ({
			x: plot.x + ((point.re - bounds.minRe) / explorer.viewport.spanRe) * plot.width,
			y: plot.y + ((bounds.maxIm - point.im) / explorer.viewport.spanIm) * plot.height
		});
		context.save();
		context.beginPath();
		context.rect(plot.x, plot.y, plot.width, plot.height);
		context.clip();

		if (explorer.overlays.grid) {
			const step = niceGridStep(explorer.viewport.spanIm, plot.height);
			const firstRe = Math.ceil(bounds.minRe / step) * step;
			const firstIm = Math.ceil(bounds.minIm / step) * step;
			context.lineWidth = 1;
			context.strokeStyle = 'rgba(255,255,255,0.22)';
			context.beginPath();
			for (let value = firstRe; value <= bounds.maxRe + step * 0.25; value += step) {
				const x = plot.x + ((value - bounds.minRe) / explorer.viewport.spanRe) * plot.width;
				context.moveTo(Math.round(x) + 0.5, plot.y);
				context.lineTo(Math.round(x) + 0.5, plot.y + plot.height);
			}
			for (let value = firstIm; value <= bounds.maxIm + step * 0.25; value += step) {
				const y = plot.y + ((bounds.maxIm - value) / explorer.viewport.spanIm) * plot.height;
				context.moveTo(plot.x, Math.round(y) + 0.5);
				context.lineTo(plot.x + plot.width, Math.round(y) + 0.5);
			}
			context.stroke();
			context.strokeStyle = 'rgba(255,255,255,0.86)';
			context.lineWidth = 1.5;
			context.beginPath();
			if (bounds.minIm <= 0 && bounds.maxIm >= 0) {
				const y = toScreen({ re: 0, im: 0 }).y;
				context.moveTo(plot.x, y);
				context.lineTo(plot.x + plot.width, y);
			}
			if (bounds.minRe <= 0 && bounds.maxRe >= 0) {
				const x = toScreen({ re: 0, im: 0 }).x;
				context.moveTo(x, plot.y);
				context.lineTo(x, plot.y + plot.height);
			}
			context.stroke();
			context.font = '500 11px ui-monospace, SFMono-Regular, Consolas, monospace';
			context.lineJoin = 'round';
			context.lineWidth = 3;
			context.strokeStyle = 'rgba(5,7,13,0.92)';
			context.fillStyle = 'rgba(255,255,255,0.94)';
			context.textBaseline = 'middle';
			context.textAlign = 'center';
			const xAxisY = Math.min(
				plot.y + plot.height - 18,
				Math.max(plot.y + 16, toScreen({ re: 0, im: 0 }).y)
			);
			for (let value = firstRe; value <= bounds.maxRe + step * 0.25; value += step) {
				if (Math.abs(value) < step * 0.1) continue;
				const x = plot.x + ((value - bounds.minRe) / explorer.viewport.spanRe) * plot.width;
				if (x < plot.x + 22 || x > plot.x + plot.width - 22) continue;
				const label = gridLabel(value, step);
				context.strokeText(label, x, xAxisY);
				context.fillText(label, x, xAxisY);
			}
			context.textAlign = 'right';
			const yAxisX = Math.min(
				plot.x + plot.width - 34,
				Math.max(plot.x + 30, toScreen({ re: 0, im: 0 }).x)
			);
			for (let value = firstIm; value <= bounds.maxIm + step * 0.25; value += step) {
				if (Math.abs(value) < step * 0.1) continue;
				const y = plot.y + ((bounds.maxIm - value) / explorer.viewport.spanIm) * plot.height;
				if (y < plot.y + 14 || y > plot.y + plot.height - 14) continue;
				const label = gridLabel(value, step);
				context.strokeText(label, yAxisX - 5, y);
				context.fillText(label, yAxisX - 5, y);
			}
			context.textBaseline = 'top';
			context.textAlign = 'right';
			context.strokeText('Re z', plot.x + plot.width - 9, xAxisY + 7);
			context.fillText('Re z', plot.x + plot.width - 9, xAxisY + 7);
			context.textAlign = 'left';
			context.strokeText('Im z', yAxisX + 7, plot.y + 7);
			context.fillText('Im z', yAxisX + 7, plot.y + 7);
		}

		if (explorer.loop) {
			const centre = toScreen(explorer.loop.center);
			const radiusX = (explorer.loop.radius / explorer.viewport.spanRe) * plot.width;
			const radiusY = (explorer.loop.radius / explorer.viewport.spanIm) * plot.height;
			context.strokeStyle = '#fef08a';
			context.lineWidth = 2;
			context.beginPath();
			context.ellipse(centre.x, centre.y, radiusX, radiusY, 0, 0, Math.PI * 2);
			context.stroke();
			const arrow = toScreen({
				re: explorer.loop.center.re + explorer.loop.radius * Math.cos(Math.PI / 3),
				im: explorer.loop.center.im + explorer.loop.radius * Math.sin(Math.PI / 3)
			});
			context.fillStyle = '#fef08a';
			context.beginPath();
			context.arc(arrow.x, arrow.y, 4, 0, Math.PI * 2);
			context.fill();
		}

		if (explorer.overlays.markers) {
			for (const feature of features) drawFeatureMarker(context, toScreen(feature.z), feature);
		}

		if (pinnedPoint) {
			const point = toScreen(pinnedPoint);
			context.fillStyle = '#fef08a';
			context.strokeStyle = '#111827';
			context.lineWidth = 2;
			context.beginPath();
			context.arc(point.x, point.y, 6, 0, Math.PI * 2);
			context.fill();
			context.stroke();
		}
		context.restore();
	}

	function drawFeatureMarker(
		context: CanvasRenderingContext2D,
		point: { x: number; y: number },
		feature: ComplexFeature
	) {
		context.save();
		context.translate(point.x, point.y);
		context.lineWidth = 2;
		context.strokeStyle = '#f8fafc';
		context.fillStyle =
			feature.kind === 'pole'
				? '#fff1c9'
				: feature.kind === 'branch-point'
					? '#e879f9'
					: feature.kind === 'critical'
						? '#67e8f9'
						: feature.kind === 'essential'
							? '#fb923c'
							: '#05070d';
		context.beginPath();
		if (feature.kind === 'critical' || feature.kind === 'branch-point') {
			context.moveTo(0, -6);
			context.lineTo(6, 0);
			context.lineTo(0, 6);
			context.lineTo(-6, 0);
			context.closePath();
		} else {
			context.arc(0, 0, 5.5, 0, Math.PI * 2);
		}
		context.fill();
		context.stroke();
		if (feature.kind === 'pole' || feature.kind === 'essential') {
			context.strokeStyle = '#111827';
			context.lineWidth = 1.5;
			context.beginPath();
			context.moveTo(-3, -3);
			context.lineTo(3, 3);
			context.moveTo(3, -3);
			context.lineTo(-3, 3);
			context.stroke();
		}
		context.restore();
	}

	function gridLabel(value: number, step: number) {
		const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step))));
		const rounded = Number(value.toFixed(decimals));
		return Object.is(rounded, -0) ? '0' : String(rounded);
	}

	function position(event: PointerEvent) {
		const rect = host.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	function insidePlot(point: { x: number; y: number }) {
		const plot = viewportPlotRect(explorer.viewport, stageWidth, stageHeight);
		return (
			point.x >= plot.x &&
			point.x <= plot.x + plot.width &&
			point.y >= plot.y &&
			point.y <= plot.y + plot.height
		);
	}

	function gesture() {
		const points = [...pointers.values()];
		if (!points.length) return null;
		const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
		const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
		const distance =
			points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
		return { x, y, distance };
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.pointerType === 'touch' && !engaged) return;
		const point = position(event);
		if (!insidePlot(point)) return;
		pointerStart = point;
		pointers.set(event.pointerId, point);
		canvas.setPointerCapture(event.pointerId);
		previousGesture = gesture();
		onhover?.(screenToComplex(explorer.viewport, point.x, point.y, stageWidth, stageHeight));
	}

	function handlePointerMove(event: PointerEvent) {
		const point = position(event);
		if (insidePlot(point)) {
			onhover?.(screenToComplex(explorer.viewport, point.x, point.y, stageWidth, stageHeight));
		}
		if (!pointers.has(event.pointerId)) return;
		pointers.set(event.pointerId, point);
		const next = gesture();
		if (!next || !previousGesture) {
			previousGesture = next;
			return;
		}
		let viewport = panViewport(
			explorer.viewport,
			next.x - previousGesture.x,
			next.y - previousGesture.y,
			stageWidth,
			stageHeight
		);
		if (next.distance > 0 && previousGesture.distance > 0) {
			viewport = zoomViewport(
				viewport,
				next.x,
				next.y,
				stageWidth,
				stageHeight,
				previousGesture.distance / next.distance
			);
		}
		previousGesture = next;
		onviewport?.(viewport);
	}

	function handlePointerEnd(event: PointerEvent) {
		const point = position(event);
		const movement = pointerStart
			? Math.hypot(point.x - pointerStart.x, point.y - pointerStart.y)
			: Number.POSITIVE_INFINITY;
		pointers.delete(event.pointerId);
		previousGesture = gesture();
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		if (movement < 5 && insidePlot(point)) {
			onpin?.(screenToComplex(explorer.viewport, point.x, point.y, stageWidth, stageHeight));
		}
		pointerStart = null;
	}

	function handleWheel(event: WheelEvent) {
		if (!engaged && document.activeElement !== canvas) return;
		const rect = host.getBoundingClientRect();
		const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
		if (!insidePlot(point)) return;
		event.preventDefault();
		const factor = Math.exp(Math.max(-180, Math.min(180, event.deltaY)) * 0.0017);
		onviewport?.(
			zoomViewport(explorer.viewport, point.x, point.y, stageWidth, stageHeight, factor)
		);
	}

	function keydown(event: KeyboardEvent) {
		const step = event.shiftKey ? 80 : 36;
		let next: Viewport | null = null;
		if (event.key === 'ArrowLeft')
			next = panViewport(explorer.viewport, step, 0, stageWidth, stageHeight);
		else if (event.key === 'ArrowRight')
			next = panViewport(explorer.viewport, -step, 0, stageWidth, stageHeight);
		else if (event.key === 'ArrowUp')
			next = panViewport(explorer.viewport, 0, step, stageWidth, stageHeight);
		else if (event.key === 'ArrowDown')
			next = panViewport(explorer.viewport, 0, -step, stageWidth, stageHeight);
		else if (event.key === '+' || event.key === '=')
			next = zoomViewport(
				explorer.viewport,
				stageWidth / 2,
				stageHeight / 2,
				stageWidth,
				stageHeight,
				0.72
			);
		else if (event.key === '-')
			next = zoomViewport(
				explorer.viewport,
				stageWidth / 2,
				stageHeight / 2,
				stageWidth,
				stageHeight,
				1.38
			);
		else if (event.key === '0' || event.key === 'Home') {
			onreset?.();
			event.preventDefault();
			return;
		} else if (event.key === 'Enter') {
			onpin?.({ re: explorer.viewport.centerRe, im: explorer.viewport.centerIm });
			event.preventDefault();
			return;
		} else if (event.key === ' ') {
			engaged = !engaged;
			event.preventDefault();
			return;
		}
		if (next) {
			event.preventDefault();
			onviewport?.(next);
		}
	}

	$effect(() => {
		void node;
		if (!renderer) return;
		try {
			renderer.setExpression(node);
			renderState = 'ready';
			redraw();
		} catch (error) {
			onstatus?.(
				'fallback',
				error instanceof Error ? error.message : 'The 2D shader could not compile.'
			);
		}
	});

	$effect(() => {
		void explorer.viewport;
		void explorer.overlays.contours;
		void explorer.overlays.grid;
		void explorer.loop;
		void explorer.overlays.markers;
		void features;
		void pinnedPoint;
		void active;
		redraw();
	});

	onMount(() => {
		let disposed = false;
		const start = () => {
			if (disposed) return;
			try {
				renderer = new DomainColoringRenderer(canvas);
				renderer.setExpression(node);
				renderState = 'ready';
				onstatus?.('ready', 'Interactive 2D phase field ready.');
				resize();
			} catch (error) {
				renderState = 'fallback';
				onstatus?.('fallback', error instanceof Error ? error.message : 'WebGL is unavailable.');
			}
		};
		if (new URLSearchParams(window.location.search).get('webgl') === 'off') {
			renderState = 'fallback';
			onstatus?.('fallback', 'WebGL is disabled; showing the static laboratory poster.');
		} else start();
		observer = new ResizeObserver(resize);
		observer.observe(host);
		const lost = (event: Event) => {
			event.preventDefault();
			renderState = 'context-lost';
			onstatus?.(
				'context-lost',
				'The 2D graphics context was lost; showing the static poster while it recovers.'
			);
		};
		const restored = () => {
			renderer?.destroy(false);
			renderer = null;
			start();
		};
		canvas.addEventListener('webglcontextlost', lost);
		canvas.addEventListener('webglcontextrestored', restored);
		return () => {
			disposed = true;
			observer?.disconnect();
			canvas.removeEventListener('webglcontextlost', lost);
			canvas.removeEventListener('webglcontextrestored', restored);
			renderer?.destroy();
			renderer = null;
			pointers.clear();
		};
	});
</script>

<div
	bind:this={host}
	class:engaged
	class="field-2d"
	data-renderer-state={renderState}
	data-testid="domain-2d-stage"
>
	<img src={fallbackPoster} alt="" class:visible={renderState !== 'ready'} class="poster" />
	<canvas
		bind:this={canvas}
		class:visible={renderState === 'ready'}
		aria-describedby={descriptionId}
		aria-label={`Two-dimensional domain-colouring field for f(z) = ${functionSource}. Press Enter to pin the domain centre.`}
		tabindex="0"
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerEnd}
		onpointercancel={handlePointerEnd}
		onwheel={handleWheel}
		onkeydown={keydown}
	>
		Two-dimensional phase-coloured field for {functionSource}. A complete text description follows.
	</canvas>
	<canvas bind:this={overlay} class="overlay" aria-hidden="true"></canvas>
	<button
		type="button"
		class="engage"
		aria-pressed={engaged}
		onclick={() => {
			engaged = !engaged;
			canvas.focus();
		}}
	>
		{engaged ? 'Release gestures' : 'Use plane gestures'}
	</button>
	{#if renderState === 'loading'}<div class="state-card" role="status">
			Preparing the 2D field…
		</div>{/if}
	{#if renderState === 'context-lost'}<div class="state-card" role="status">
			2D context interrupted; restoring…
		</div>{/if}
</div>

<style>
	.field-2d {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		min-height: 20rem;
		overflow: hidden;
		background: #05070d;
		isolation: isolate;
	}

	canvas,
	.poster,
	.overlay {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
	}

	canvas.visible,
	.poster.visible,
	.overlay {
		opacity: 1;
	}

	canvas {
		cursor: crosshair;
		touch-action: pan-y;
	}

	.engaged canvas {
		touch-action: none;
	}

	.poster {
		object-fit: contain;
	}

	.overlay {
		z-index: 2;
		pointer-events: none;
	}

	.engage {
		position: absolute;
		z-index: 4;
		right: 0.55rem;
		bottom: 0.55rem;
		min-height: 2.45rem;
		border: 1px solid rgb(255 255 255 / 0.35);
		border-radius: 0.4rem;
		background: rgb(5 7 13 / 0.82);
		padding: 0.4rem 0.65rem;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 700;
		color: #f8fafc;
		backdrop-filter: blur(5px);
	}

	.state-card {
		position: absolute;
		inset: 0;
		z-index: 5;
		display: grid;
		place-items: center;
		background: rgb(5 7 13 / 0.72);
		font-size: 0.8rem;
		color: #dbeafe;
	}

	@media (max-width: 680px) {
		.field-2d {
			min-height: 15rem;
		}
	}

	@media (forced-colors: active) {
		.engage {
			border: 1px solid ButtonText;
			background: Canvas;
			color: ButtonText;
		}
	}
</style>
