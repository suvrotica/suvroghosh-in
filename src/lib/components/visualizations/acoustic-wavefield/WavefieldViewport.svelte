<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { supportsWebGL } from '$lib/visualizations/webgl';
	import {
		applyBrushStroke,
		findNearestAirCell,
		GRID_NX,
		GRID_NY,
		rebuildMaterialProperties,
		snapBeaconsToAir,
		type BrushTool,
		type GridPoint,
		type SimulationState,
		type StudioTheme,
		type ViewMode
	} from '$lib/visualizations/acoustic-wavefield';
	import { createCanvas2DRenderer, type Canvas2DRendererHandle } from './canvas2d-renderer';
	import type { WebGLRendererHandle } from './webgl-renderer';

	interface Props {
		simState: SimulationState;
		viewMode: ViewMode;
		theme: StudioTheme;
		brushTool: BrushTool;
		brushRadius: number;
		renderRevision: number;
		onBeaconMoved: () => void;
		onGeometryChanged: () => void;
		onKeyboardClap: () => void;
		onTogglePlay: () => void;
		onAnnouncement?: (msg: string) => void;
	}

	let {
		simState,
		viewMode,
		theme,
		brushTool,
		brushRadius,
		renderRevision,
		onBeaconMoved,
		onGeometryChanged,
		onKeyboardClap,
		onTogglePlay,
		onAnnouncement
	}: Props = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let stageEl = $state<HTMLDivElement | null>(null);
	let usingCanvas2D = $state(false);
	let webglHandle: WebGLRendererHandle | null = null;
	let canvas2dHandle: Canvas2DRendererHandle | null = null;

	let sourceCss = $state<{ x: number; y: number }>({ x: 100, y: 120 });
	let listenerCss = $state<{ x: number; y: number }>({ x: 300, y: 120 });

	let activeDrag: 'source' | 'listener' | 'brush' | null = null;
	let activeKeyboardBeacon = $state<'source' | 'listener'>('source');
	let lastStrokePt: GridPoint | null = null;
	let resizeObserver: ResizeObserver | null = null;

	function updateBeaconLabels(): void {
		let nextSource: { x: number; y: number } | null = null;
		let nextListener: { x: number; y: number } | null = null;
		if (webglHandle && !usingCanvas2D) {
			nextSource = webglHandle.gridToCanvas(simState.source.x, simState.source.y, viewMode);
			nextListener = webglHandle.gridToCanvas(simState.listener.x, simState.listener.y, viewMode);
		} else if (canvas2dHandle) {
			nextSource = canvas2dHandle.gridToCanvas(simState.source.x, simState.source.y);
			nextListener = canvas2dHandle.gridToCanvas(simState.listener.x, simState.listener.y);
		}
		if (
			nextSource &&
			(Math.abs(nextSource.x - sourceCss.x) > 0.05 || Math.abs(nextSource.y - sourceCss.y) > 0.05)
		) {
			sourceCss = nextSource;
		}
		if (
			nextListener &&
			(Math.abs(nextListener.x - listenerCss.x) > 0.05 ||
				Math.abs(nextListener.y - listenerCss.y) > 0.05)
		) {
			listenerCss = nextListener;
		}
	}

	export function drawFrame(): void {
		if (!canvasEl) return;
		if (webglHandle && !usingCanvas2D) {
			if (webglHandle.isContextLost()) {
				webglHandle.dispose();
				webglHandle = null;
				usingCanvas2D = true;
				canvas2dHandle = createCanvas2DRenderer(canvasEl);
				canvas2dHandle.resize();
				canvas2dHandle.invalidateMaterial();
				canvas2dHandle.render(simState, theme);
			} else {
				webglHandle.render(simState, viewMode, theme);
			}
		} else if (canvas2dHandle) {
			canvas2dHandle.render(simState, theme);
		}
		updateBeaconLabels();
	}

	function mapClientToGrid(clientX: number, clientY: number): GridPoint | null {
		if (webglHandle && !usingCanvas2D) {
			return webglHandle.screenToGrid(clientX, clientY, viewMode);
		}
		if (canvas2dHandle) {
			return canvas2dHandle.screenToGrid(clientX, clientY);
		}
		return null;
	}

	function handlePointerDown(event: PointerEvent): void {
		if (!canvasEl) return;
		canvasEl.setPointerCapture(event.pointerId);
		const rect = canvasEl.getBoundingClientRect();
		const px = event.clientX - rect.left;
		const py = event.clientY - rect.top;
		const pt = mapClientToGrid(event.clientX, event.clientY);
		if (!pt) return;

		if (brushTool === 'move') {
			const distS = Math.hypot(px - sourceCss.x, py - sourceCss.y);
			const distL = Math.hypot(px - listenerCss.x, py - listenerCss.y);
			if (distS <= distL && distS < 42) {
				activeDrag = 'source';
				activeKeyboardBeacon = 'source';
			} else if (distL < 42) {
				activeDrag = 'listener';
				activeKeyboardBeacon = 'listener';
			} else {
				// Click anywhere in move mode moves the closer beacon to the clicked air cell
				activeDrag = distS <= distL ? 'source' : 'listener';
				activeKeyboardBeacon = activeDrag;
				const snapped = findNearestAirCell(simState.material, pt);
				if (activeDrag === 'source') simState.source = snapped;
				else simState.listener = snapped;
				drawFrame();
			}
			return;
		}

		if (brushTool === 'resonator') {
			// Discrete click-to-stamp Helmholtz cavity (no drag smearing)
			applyBrushStroke(simState.material, 'resonator', pt.x, pt.y, pt.x, pt.y, brushRadius);
			snapBeaconsToAir(simState);
			rebuildMaterialProperties(simState);
			canvas2dHandle?.invalidateMaterial();
			drawFrame();
			onGeometryChanged();
			onAnnouncement?.('Stamped a Helmholtz resonator cavity.');
			return;
		}

		activeDrag = 'brush';
		lastStrokePt = pt;
		applyBrushStroke(simState.material, brushTool, pt.x, pt.y, pt.x, pt.y, brushRadius);
		snapBeaconsToAir(simState);
		rebuildMaterialProperties(simState);
		canvas2dHandle?.invalidateMaterial();
		drawFrame();
	}

	function handlePointerMove(event: PointerEvent): void {
		if (!activeDrag) return;
		const pt = mapClientToGrid(event.clientX, event.clientY);
		if (!pt) return;

		if (activeDrag === 'source') {
			simState.source = findNearestAirCell(simState.material, pt);
			drawFrame();
			return;
		}
		if (activeDrag === 'listener') {
			simState.listener = findNearestAirCell(simState.material, pt);
			drawFrame();
			return;
		}
		if (activeDrag === 'brush' && lastStrokePt) {
			applyBrushStroke(
				simState.material,
				brushTool,
				lastStrokePt.x,
				lastStrokePt.y,
				pt.x,
				pt.y,
				brushRadius
			);
			lastStrokePt = pt;
			snapBeaconsToAir(simState);
			rebuildMaterialProperties(simState);
			canvas2dHandle?.invalidateMaterial();
			drawFrame();
		}
	}

	function handlePointerUp(event: PointerEvent): void {
		if (canvasEl && canvasEl.hasPointerCapture(event.pointerId)) {
			canvasEl.releasePointerCapture(event.pointerId);
		}
		const prev = activeDrag;
		activeDrag = null;
		lastStrokePt = null;
		if (prev === 'source' || prev === 'listener') {
			onBeaconMoved();
		} else if (prev === 'brush') {
			onGeometryChanged();
		}
	}

	function handleKeyDown(event: KeyboardEvent): void {
		if (event.key === ' ') {
			event.preventDefault();
			onKeyboardClap();
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			onTogglePlay();
			return;
		}
		if (event.key === 's' || event.key === 'S') {
			activeKeyboardBeacon = 'source';
			onAnnouncement?.('Selected Emitter S for arrow-key positioning.');
			return;
		}
		if (event.key === 'l' || event.key === 'L') {
			activeKeyboardBeacon = 'listener';
			onAnnouncement?.('Selected Listener L for arrow-key positioning.');
			return;
		}

		const step = event.shiftKey ? 5 : 2;
		let dx = 0;
		let dy = 0;
		if (event.key === 'ArrowLeft') dx = -step;
		else if (event.key === 'ArrowRight') dx = step;
		else if (event.key === 'ArrowUp') dy = -step;
		else if (event.key === 'ArrowDown') dy = step;
		else return;

		event.preventDefault();
		const target = activeKeyboardBeacon === 'source' ? simState.source : simState.listener;
		const next = findNearestAirCell(simState.material, {
			x: Math.max(2, Math.min(GRID_NX - 3, target.x + dx)),
			y: Math.max(2, Math.min(GRID_NY - 3, target.y + dy))
		});
		if (activeKeyboardBeacon === 'source') simState.source = next;
		else simState.listener = next;
		drawFrame();
		onBeaconMoved();
	}

	onMount(async () => {
		if (!canvasEl) return;
		if (!supportsWebGL()) {
			usingCanvas2D = true;
			canvas2dHandle = createCanvas2DRenderer(canvasEl);
		} else {
			try {
				const { createWebGLRenderer } = await import('./webgl-renderer');
				if (!canvasEl) return;
				webglHandle = createWebGLRenderer(canvasEl);
			} catch {
				usingCanvas2D = true;
				canvas2dHandle = createCanvas2DRenderer(canvasEl);
			}
		}

		if (stageEl && typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(() => {
				webglHandle?.resize();
				canvas2dHandle?.resize();
				drawFrame();
			});
			resizeObserver.observe(stageEl);
		}
		webglHandle?.resize();
		canvas2dHandle?.resize();
		canvas2dHandle?.invalidateMaterial();
		drawFrame();
	});

	$effect(() => {
		// Re-render cleanly when viewMode, theme, or explicit revision changes while paused
		void viewMode;
		void theme;
		void renderRevision;
		canvas2dHandle?.invalidateMaterial();
		drawFrame();
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		webglHandle?.dispose();
		canvas2dHandle?.dispose();
	});
</script>

<div class="awc-canvas-stage" bind:this={stageEl}>
	<canvas
		bind:this={canvasEl}
		class="awc-canvas"
		class:awc-cursor-grab={brushTool === 'move'}
		data-testid="awc-viewport-canvas"
		tabindex="0"
		aria-label="2D Acoustic Wavefield Chamber canvas. Drag Emitter S or Listener L, sketch architectural materials, or press Space to fire a hand clap."
		onkeydown={handleKeyDown}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
	></canvas>

	<div class="awc-beacon-overlay" aria-hidden="true">
		<span
			class="awc-beacon-tag awc-beacon-s"
			data-testid="awc-beacon-s"
			style={`left:${sourceCss.x.toFixed(1)}px;top:${sourceCss.y.toFixed(1)}px;`}
		>
			S
		</span>
		<span
			class="awc-beacon-tag awc-beacon-l"
			data-testid="awc-beacon-l"
			style={`left:${listenerCss.x.toFixed(1)}px;top:${listenerCss.y.toFixed(1)}px;`}
		>
			L
		</span>
	</div>

	{#if usingCanvas2D}
		<div
			data-testid="awc-canvas2d-badge"
			style="position:absolute;top:0.55rem;left:0.6rem;padding:0.2rem 0.55rem;border-radius:6px;background:rgba(12,16,22,0.86);border:1px solid rgba(56,189,248,0.45);color:#f1f5f9;font-family:monospace;font-size:0.72rem;font-weight:700;"
		>
			2D Canvas Fallback
		</div>
	{/if}
</div>
