<script lang="ts">
	import { onMount } from 'svelte';
	import { FLOORS } from '$lib/visualizations/scale-elevator/core';
	import type { ElevatorRenderer, RenderState } from '$lib/visualizations/scale-elevator/types';
	let {
		view,
		floor,
		onstatus
	}: { view: RenderState; floor: number; onstatus: (status: string) => void } = $props();
	let host: HTMLDivElement;
	let canvas = $state<HTMLCanvasElement>();
	let engine = $state.raw<ElevatorRenderer | null>(null);
	let status = $state('loading');
	let generation = $state(0);
	let mounted = false;
	let token = 0;
	let visible = $state(false);
	let renderedProgress = $state('');
	function draw(next: RenderState) {
		if (!engine) return;
		engine.update(next);
		renderedProgress = next.progress.toFixed(4);
	}
	function fallback(message: string) {
		status = message;
		onstatus('fallback');
	}
	async function initialise() {
		const current = ++token;
		if (new URLSearchParams(location.search).get('webgl') === 'off') {
			fallback('WebGL is off. Explore the same model using the diagrams and measurements.');
			return;
		}
		try {
			const { createElevatorRenderer } =
				await import('$lib/visualizations/scale-elevator/renderer');
			if (!mounted || current !== token || !canvas) return;
			const renderer = createElevatorRenderer(canvas, (message) => {
				if (mounted && current === token) {
					engine?.dispose();
					engine = null;
					fallback(message);
				}
			});
			if (!mounted || current !== token) {
				renderer.dispose();
				return;
			}
			engine = renderer;
			draw($state.snapshot(view));
			status = 'ready';
			onstatus('ready');
		} catch {
			if (mounted && current === token) {
				engine?.dispose();
				engine = null;
				fallback(
					'The 3D view could not open. The selected floor remains available as a still and a working explanatory diagram.'
				);
			}
		}
	}
	async function retry() {
		engine?.dispose();
		engine = null;
		generation++;
		status = 'loading';
		const { tick } = await import('svelte');
		await tick();
		if (mounted) void initialise();
	}
	onMount(() => {
		mounted = true;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries.at(-1);
				if (!entry) return;
				visible = entry.isIntersecting;
				if (visible && status === 'loading') void initialise();
				else if (visible) draw($state.snapshot(view));
			},
			{ rootMargin: '300px' }
		);
		observer.observe(host);
		return () => {
			mounted = false;
			token++;
			observer.disconnect();
			engine?.dispose();
			engine = null;
		};
	});
	$effect(() => {
		const next = $state.snapshot(view);
		if (engine && visible) draw(next);
	});
</script>

<div
	bind:this={host}
	class="se-canvas-wrap"
	data-testid="scale-stage"
	data-render-status={status === 'ready' ? 'ready' : status === 'loading' ? 'loading' : 'fallback'}
	data-render-progress={renderedProgress}
>
	{#if status !== 'ready'}
		<img
			class="se-scene-poster"
			src={`/images/visualizations/scale-elevator/scene-${String(floor + 1).padStart(2, '0')}-${FLOORS[floor].id}.jpg`}
			alt={`Schematic oxygen view at the ${FLOORS[floor].name.toLowerCase()} scale. The diagram and measurements beside it explain this floor.`}
			width="1000"
			height="650"
		/>
	{/if}
	{#key generation}<canvas
			bind:this={canvas}
			aria-label="Three-dimensional schematic of the selected oxygen scale. The adjacent explanation and diagram provide its accessible description."
			class:se-hidden={status !== 'ready'}
		></canvas>{/key}
	{#if status !== 'ready'}<div class="se-render-notice" role="status">
			<span>{status === 'loading' ? 'Preparing the oxygen journey…' : status}</span
			>{#if status !== 'loading'}<button type="button" onclick={retry}>Retry 3D</button>{/if}
		</div>{/if}
</div>
