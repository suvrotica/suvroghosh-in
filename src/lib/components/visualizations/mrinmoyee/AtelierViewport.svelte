<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type {
		AtelierDesign,
		CameraView,
		ExportOptions
	} from '$lib/visualizations/mrinmoyee/types';
	import type { AtelierRenderer, RenderQuality } from '$lib/visualizations/mrinmoyee/renderer';

	let {
		design,
		quality = 'auto',
		presentation = false,
		ambientMotion = false,
		reducedMotion = false,
		oncamera,
		onstatus,
		onselect,
		onbell
	}: {
		design: AtelierDesign;
		quality?: RenderQuality;
		presentation?: boolean;
		ambientMotion?: boolean;
		reducedMotion?: boolean;
		oncamera?: (camera: CameraView) => void;
		onstatus?: (status: 'loading' | 'ready' | 'fallback', message?: string) => void;
		onselect?: (region: string) => void;
		onbell?: () => void;
	} = $props();
	let canvas = $state<HTMLCanvasElement>();
	let canvasGeneration = $state(0);
	let engine = $state.raw<AtelierRenderer | null>(null);
	let renderStatus = $state<'loading' | 'ready' | 'fallback'>('loading');
	let message = $state('Preparing the sculpture, its materials and light…');
	let mounted = false;
	let generation = 0;

	function status(next: typeof renderStatus, detail?: string) {
		renderStatus = next;
		if (detail) message = detail;
		onstatus?.(next, detail);
	}
	async function initialize() {
		const current = ++generation;
		engine?.dispose();
		engine = null;
		canvasGeneration++;
		status('loading', 'Preparing the sculpture, its materials and light…');
		try {
			await tick();
			const { createAtelierRenderer } = await import('$lib/visualizations/mrinmoyee/renderer');
			if (!mounted || current !== generation || !canvas) return;
			const instance = createAtelierRenderer(
				canvas,
				$state.snapshot(design),
				{ quality, presentation, ambientMotion, reducedMotion },
				{
					oncamera: (camera) => oncamera?.(camera),
					onselect: (region) => onselect?.(region),
					onbell: () => onbell?.(),
					onerror: (detail) => status('fallback', detail)
				}
			);
			if (!mounted || current !== generation) {
				instance.dispose();
				return;
			}
			engine = instance;
			status('ready');
		} catch (error) {
			if (!mounted || current !== generation) return;
			status(
				'fallback',
				error instanceof Error
					? `The interactive sculpture could not open. ${error.message}`
					: 'This device could not open the interactive sculpture.'
			);
		}
	}
	onMount(() => {
		mounted = true;
		void initialize();
		return () => {
			mounted = false;
			generation++;
			engine?.dispose();
			engine = null;
		};
	});
	$effect(() => {
		engine?.update($state.snapshot(design), {
			quality,
			presentation,
			ambientMotion,
			reducedMotion
		});
	});

	export async function exportImage(options: ExportOptions): Promise<Blob> {
		if (!engine || renderStatus !== 'ready')
			throw new Error('Open the interactive sculpture before exporting an image.');
		return engine.exportImage(options);
	}
	export function thumbnail(): string | undefined {
		return engine?.thumbnail();
	}
	export function ringBell(): void {
		engine?.ringBell();
	}
</script>

<div
	class="atelier-viewport"
	class:is-ready={renderStatus === 'ready'}
	data-testid="atelier-viewport"
	data-render-status={renderStatus}
>
	{#if renderStatus !== 'ready'}
		<img
			class="atelier-poster"
			src="/images/visualizations/mrinmoyee/mrinmoyee-poster.jpg"
			alt="Durga in vermilion and gold, with a sculpted crown, ten arms, a lion and brass lamps."
			width="1600"
			height="1400"
		/>
	{/if}
	{#key canvasGeneration}
		<canvas
			bind:this={canvas}
			tabindex={renderStatus === 'ready' ? 0 : -1}
			aria-hidden={renderStatus !== 'ready'}
			aria-label="Interactive Durga sculpture. Drag to orbit, scroll to zoom. Keyboard: left and right arrows rotate; plus and minus zoom. Use the camera buttons for close-ups."
			class:unavailable={renderStatus !== 'ready'}
		></canvas>
	{/key}
	{#if renderStatus !== 'ready'}
		<div class="viewport-status" role="status" aria-live="polite">
			{#if renderStatus === 'loading'}<span class="loading-mark" aria-hidden="true">✦</span>{/if}
			<p>{message}</p>
			{#if renderStatus === 'fallback'}<button type="button" onclick={() => void initialize()}
					>Retry interactive view</button
				>{/if}
		</div>
	{/if}
</div>

<style>
	.atelier-viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #100f0d;
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
		touch-action: none;
		outline: none;
	}
	canvas:focus-visible {
		outline: 2px solid #eac98c;
		outline-offset: -5px;
	}
	canvas.unavailable {
		opacity: 0;
		pointer-events: none;
	}
	.atelier-poster {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.75;
	}
	.viewport-status {
		position: absolute;
		inset: auto 1rem 1rem;
		display: grid;
		justify-items: center;
		gap: 0.65rem;
		padding: 1rem 1.2rem;
		color: #f2e4c9;
		background: #17130fe6;
		border: 1px solid #b4915740;
		border-radius: 0.6rem;
		font: 0.82rem/1.6 var(--font-body, Georgia, serif);
		text-align: center;
		backdrop-filter: blur(12px);
	}
	.viewport-status p {
		max-width: 36rem;
		margin: 0;
	}
	.loading-mark {
		font-size: 1.25rem;
		color: #e5bd75;
	}
	button {
		border: 1px solid #c09a60;
		border-radius: 0.25rem;
		background: #5f4325;
		color: #fff0d8;
		padding: 0.6rem 1rem;
		font: inherit;
		cursor: pointer;
	}
	button:hover {
		background: #76532d;
	}
	button:focus-visible {
		outline: 2px solid #f4ddb0;
		outline-offset: 3px;
	}
</style>
