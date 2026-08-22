<script lang="ts">
	import { onMount } from 'svelte';
	import type { DomainLandscapeRenderer } from '$lib/visualizations/domain-coloring/landscape-renderer';
	import type {
		CameraOrientation,
		CameraState,
		Complex,
		DomainColoringPreset,
		ExplorerState,
		ExpressionNode
	} from '$lib/visualizations/domain-coloring';
	import { renderPixelDensity } from '$lib/visualizations/webgl';

	type Props = {
		explorer: ExplorerState;
		node: ExpressionNode;
		preset?: DomainColoringPreset;
		functionSource: string;
		fallbackPoster: string;
		pinnedPoint?: Complex | null;
		active?: boolean;
		descriptionId: string;
		oncamera?: (camera: CameraState) => void;
		oncamerapreset?: (orientation: CameraOrientation) => void;
		onpin?: (z: Complex) => void;
		onstatus?: (status: 'loading' | 'ready' | 'fallback' | 'context-lost', message: string) => void;
		onmeshstatus?: (message: string) => void;
	};

	let {
		explorer,
		node,
		preset,
		functionSource,
		fallbackPoster,
		pinnedPoint = null,
		active = true,
		descriptionId,
		oncamera,
		oncamerapreset,
		onpin,
		onstatus,
		onmeshstatus
	}: Props = $props();

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let renderer: DomainLandscapeRenderer | null = null;
	let observer: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let renderState = $state<'loading' | 'ready' | 'fallback' | 'context-lost'>('loading');
	let engaged = $state(false);
	let onscreen = $state(true);
	let pointerStart: { x: number; y: number } | null = null;

	export function captureCanvas() {
		return renderer?.captureCanvas() ?? canvas;
	}

	function resize() {
		if (!host || !renderer) return;
		const rect = host.getBoundingClientRect();
		renderer.setPixelRatio(Math.min(2, renderPixelDensity()));
		renderer.resize(rect.width, rect.height);
	}

	function axisLegend() {
		if (explorer.viewMode === 'sheets') {
			return preset?.sheets?.kind === 'log'
				? 'floor: Re z × Im z · vertical: (θ + 2πk)/π · colour: ln r'
				: 'floor: Re z × Im z · vertical: Re w · colour: Im w';
		}
		const vertical =
			explorer.height.lens === 'log-magnitude'
				? 'log₂|f(z)|'
				: explorer.height.lens === 'real'
					? 'symlog Re f(z)'
					: explorer.height.lens === 'imaginary'
						? 'symlog Im f(z)'
						: explorer.height.lens === 'phase'
							? 'Arg f(z) / π'
							: '0 (flat)';
		return `floor: Re z × Im z · vertical: ${vertical}`;
	}

	function cameraPreset(orientation: CameraOrientation) {
		renderer?.setCameraPreset(orientation);
		oncamerapreset?.(orientation);
		canvas.focus();
	}

	function pointerDown(event: PointerEvent) {
		if (event.pointerType === 'touch' && !engaged) return;
		pointerStart = { x: event.clientX, y: event.clientY };
	}

	function pointerUp(event: PointerEvent) {
		if (!pointerStart || !renderer) return;
		const movement = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
		pointerStart = null;
		if (movement > 5) return;
		const z = renderer.pick(event.clientX, event.clientY);
		if (z) onpin?.(z);
	}

	function keydown(event: KeyboardEvent) {
		if (!renderer) return;
		if (event.key === 'ArrowLeft') renderer.nudgeCamera(event.ctrlKey ? 'pan-left' : 'left');
		else if (event.key === 'ArrowRight')
			renderer.nudgeCamera(event.ctrlKey ? 'pan-right' : 'right');
		else if (event.key === 'ArrowUp') renderer.nudgeCamera(event.ctrlKey ? 'pan-up' : 'up');
		else if (event.key === 'ArrowDown') renderer.nudgeCamera(event.ctrlKey ? 'pan-down' : 'down');
		else if (event.key === '+' || event.key === '=') renderer.nudgeCamera('in');
		else if (event.key === '-') renderer.nudgeCamera('out');
		else if (event.key === '1') cameraPreset('isometric');
		else if (event.key === '2') cameraPreset('top');
		else if (event.key === '3') cameraPreset('front-real');
		else if (event.key === '4') cameraPreset('front-imaginary');
		else if (event.key === 'r' || event.key === 'R') {
			renderer.resetCamera(preset?.camera ?? explorer.camera);
		} else if (event.key === 'Enter') {
			onpin?.({ re: explorer.viewport.centerRe, im: explorer.viewport.centerIm });
		} else if (event.key === ' ') {
			engaged = !engaged;
			renderer.setControlsEnabled(engaged);
		} else return;
		event.preventDefault();
	}

	$effect(() => {
		const stateKey = JSON.stringify(explorer);
		void node;
		void preset;
		void pinnedPoint;
		void active;
		void onscreen;
		if (!renderer || !active || !onscreen) return;
		void stateKey;
		renderer.setState({ node, preset, explorer, pinnedPoint });
	});

	$effect(() => {
		void engaged;
		renderer?.setControlsEnabled(engaged);
	});

	onMount(() => {
		let disposed = false;
		if (new URLSearchParams(window.location.search).get('webgl') === 'off') {
			renderState = 'fallback';
			onstatus?.(
				'fallback',
				'3D is disabled; the synchronized 2D field and article remain available.'
			);
			return;
		}
		onstatus?.('loading', 'Preparing the three-dimensional landscape…');
		void (async () => {
			try {
				const { createDomainLandscapeRenderer } =
					await import('$lib/visualizations/domain-coloring/landscape-renderer');
				if (disposed) return;
				renderer = createDomainLandscapeRenderer(canvas, {
					onStatus: (next, message) => {
						renderState = next === 'error' ? 'fallback' : next;
						onstatus?.(renderState, message);
					},
					onCameraChange: (camera) => oncamera?.(camera),
					onMeshStats: (message) => onmeshstatus?.(message)
				});
				renderer.setControlsEnabled(false);
				renderer.setState({ node, preset, explorer, pinnedPoint });
				renderState = 'ready';
				onstatus?.('ready', 'Three-dimensional landscape ready.');
				observer = new ResizeObserver(resize);
				observer.observe(host);
				intersectionObserver = new IntersectionObserver((entries) => {
					onscreen = entries[0]?.isIntersecting ?? true;
					if (onscreen && active) renderer?.render();
				});
				intersectionObserver.observe(host);
				resize();
			} catch (error) {
				if (disposed) return;
				renderState = 'fallback';
				onstatus?.(
					'fallback',
					error instanceof Error
						? `The 3D landscape could not start: ${error.message}`
						: 'The 3D landscape could not start on this device.'
				);
			}
		})();
		const visibility = () => {
			if (!document.hidden && active && onscreen) renderer?.render();
		};
		document.addEventListener('visibilitychange', visibility);
		return () => {
			disposed = true;
			document.removeEventListener('visibilitychange', visibility);
			observer?.disconnect();
			intersectionObserver?.disconnect();
			renderer?.dispose();
			renderer = null;
		};
	});
</script>

<div
	bind:this={host}
	class:engaged
	class="field-3d"
	data-renderer-state={renderState}
	data-testid="domain-3d-stage"
>
	<img src={fallbackPoster} alt="" class:visible={renderState !== 'ready'} class="poster" />
	<canvas
		bind:this={canvas}
		class:visible={renderState === 'ready' || renderState === 'context-lost'}
		aria-describedby={descriptionId}
		aria-label={explorer.viewMode === 'sheets'
			? explorer.allSheets
				? `Connected displayed Riemann-sheet projection for ${preset?.label ?? functionSource}. Press Enter to pin the domain centre.`
				: `Principal-branch Riemann-sheet projection with open cut edges for ${preset?.label ?? functionSource}. Press Enter to pin the domain centre.`
			: `Three-dimensional ${explorer.height.lens} landscape for f(z) = ${functionSource}. Press Enter to pin the domain centre.`}
		tabindex="0"
		onpointerdown={pointerDown}
		onpointerup={pointerUp}
		onpointercancel={() => (pointerStart = null)}
		onkeydown={keydown}
	>
		Three-dimensional complex-function projection. A synchronized text description follows.
	</canvas>
	<div class="camera-presets" aria-label="3D camera presets">
		<button type="button" onclick={() => cameraPreset('isometric')}>Isometric</button>
		<button type="button" onclick={() => cameraPreset('top')}>Top</button>
		<button type="button" onclick={() => cameraPreset('front-real')}>Front—real</button>
		<button type="button" onclick={() => cameraPreset('front-imaginary')}>Front—imaginary</button>
	</div>
	<div class="axis-legend" aria-hidden="true">{axisLegend()}</div>
	<button
		type="button"
		class="engage"
		aria-pressed={engaged}
		onclick={() => {
			engaged = !engaged;
			renderer?.setControlsEnabled(engaged);
			canvas.focus();
		}}
	>
		{engaged ? 'Release camera' : 'Use camera gestures'}
	</button>
	{#if renderState === 'loading'}<div class="state-card" role="status">
			Preparing 3D terrain…
		</div>{/if}
	{#if renderState === 'fallback'}
		<div class="fallback-card" role="status">
			<strong>3D is unavailable.</strong>
			<span>The interactive 2D field and full mathematical description remain available.</span>
		</div>
	{/if}
	{#if renderState === 'context-lost'}<div class="state-card" role="status">
			3D context interrupted; restoring…
		</div>{/if}
</div>

<style>
	.field-3d {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		min-height: 20rem;
		overflow: hidden;
		background: #05070d;
		isolation: isolate;
	}

	canvas,
	.poster {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
	}

	canvas.visible,
	.poster.visible {
		opacity: 1;
	}

	canvas {
		touch-action: pan-y;
		cursor: grab;
	}

	.engaged canvas {
		touch-action: none;
	}

	.poster {
		object-fit: contain;
	}

	.camera-presets {
		position: absolute;
		z-index: 4;
		top: 0.55rem;
		left: 0.55rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	button {
		min-height: 2.35rem;
		border: 1px solid rgb(255 255 255 / 0.32);
		border-radius: 0.4rem;
		background: rgb(5 7 13 / 0.82);
		padding: 0.35rem 0.55rem;
		font: inherit;
		font-size: 0.68rem;
		font-weight: 700;
		color: #f8fafc;
		backdrop-filter: blur(5px);
	}

	.engage {
		position: absolute;
		z-index: 4;
		right: 0.55rem;
		bottom: 0.55rem;
	}

	.axis-legend {
		position: absolute;
		z-index: 4;
		bottom: 0.55rem;
		left: 0.55rem;
		max-width: calc(100% - 11rem);
		border-radius: 0.3rem;
		background: rgb(5 7 13 / 0.78);
		padding: 0.3rem 0.45rem;
		font:
			600 0.64rem/1.35 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
		color: #dbeafe;
	}

	.state-card,
	.fallback-card {
		position: absolute;
		z-index: 5;
		display: grid;
		place-items: center;
		gap: 0.35rem;
		background: rgb(5 7 13 / 0.76);
		font-size: 0.8rem;
		color: #dbeafe;
		text-align: center;
	}

	.state-card {
		inset: 0;
	}

	.fallback-card {
		inset: auto 1rem 1rem;
		padding: 0.8rem;
	}

	@media (max-width: 680px) {
		.field-3d {
			min-height: 17rem;
		}

		.camera-presets {
			right: 0.45rem;
			left: 0.45rem;
		}

		.camera-presets button {
			flex: 1 1 calc(50% - 0.3rem);
		}

		.axis-legend {
			max-width: calc(100% - 9rem);
			font-size: 0.58rem;
		}
	}

	@media (forced-colors: active) {
		button {
			border: 1px solid ButtonText;
			background: Canvas;
			color: ButtonText;
		}
	}
</style>
