<script lang="ts">
	import { onMount } from 'svelte';
	import { normalizeExhibitState } from '$lib/visualizations/chitin-engine/genome';
	import { FallbackRenderer } from '$lib/visualizations/chitin-engine/fallback-renderer';
	import { buildCreaturePhenotype } from '$lib/visualizations/chitin-engine/phenotype-builder';
	import { createCreaturePose } from '$lib/visualizations/chitin-engine/pose';
	import { getPalette, getWorldPreset } from '$lib/visualizations/chitin-engine/presets';
	import { describeWorldTransform } from '$lib/visualizations/chitin-engine/world-transforms';
	import type { CreatureGenome, WorldId } from '$lib/visualizations/chitin-engine/types';

	type Props = {
		genome: CreatureGenome;
		worldId: WorldId;
		onUse: (world: WorldId) => void;
	};

	let { genome, worldId, onUse }: Props = $props();
	let canvas: HTMLCanvasElement;
	let host: HTMLDivElement;
	let renderer: FallbackRenderer | undefined;
	let world = $derived(getWorldPreset(worldId));
	let transformedGenome = $derived({ ...genome, world: worldId });
	let changes = $derived(describeWorldTransform(transformedGenome));

	function draw() {
		if (!renderer || !host) return;
		const bounds = host.getBoundingClientRect();
		if (bounds.width < 2 || bounds.height < 2) return;
		const phenotype = buildCreaturePhenotype(transformedGenome);
		const pose = createCreaturePose(phenotype, { paused: true, genomeTime: 1.84 });
		const state = normalizeExhibitState({ genome: transformedGenome, paused: true });
		renderer.setSize(bounds.width, bounds.height, Math.min(window.devicePixelRatio || 1, 1.5));
		renderer.render(phenotype, pose, state, {
			palette: getPalette(phenotype.genome.palette),
			includeLabel: false,
			includeOverlays: false,
			exportSafe: true,
			time: 1.84
		});
	}

	onMount(() => {
		renderer = new FallbackRenderer(canvas);
		let drawn = false;
		const observer =
			typeof IntersectionObserver === 'undefined'
				? undefined
				: new IntersectionObserver(
						(entries) => {
							if (entries.some((entry) => entry.isIntersecting)) {
								drawn = true;
								draw();
							}
						},
						{ rootMargin: '160px' }
					);
		observer?.observe(host);
		if (!observer) {
			drawn = true;
			draw();
		}
		const resize =
			typeof ResizeObserver === 'undefined'
				? undefined
				: new ResizeObserver(() => {
						if (drawn) draw();
					});
		resize?.observe(host);
		return () => {
			observer?.disconnect();
			resize?.disconnect();
			renderer?.dispose();
			renderer = undefined;
		};
	});

	$effect(() => {
		void genome;
		void worldId;
		draw();
	});
</script>

<article class="miniature">
	<div class="canvas-host" bind:this={host}>
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
	</div>
	<div class="copy">
		<p class="world-label">Speculative world heuristic</p>
		<h4>{world.name}</h4>
		<ul>
			{#each changes as change (change)}<li>{change}</li>{/each}
		</ul>
		<button type="button" onclick={() => onUse(worldId)}>Send to foundry</button>
	</div>
</article>

<style>
	.miniature {
		overflow: hidden;
		border: 1px solid rgb(255 255 255 / 9%);
		border-radius: 0.9rem;
		background: #070812;
		color: #d9dbe5;
	}
	.canvas-host {
		position: relative;
		aspect-ratio: 4 / 3;
		min-height: 10rem;
		background: #050610;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	.copy {
		display: grid;
		gap: 0.45rem;
		padding: 0.8rem;
	}
	.world-label,
	h4,
	ul {
		margin: 0;
	}
	.world-label {
		color: #af8dcc;
		font: 700 0.58rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	h4 {
		color: white;
		font-size: 0.96rem;
	}
	ul {
		padding-left: 1.1rem;
		color: #9fa2b1;
		font-size: 0.7rem;
		line-height: 1.5;
		text-transform: capitalize;
	}
	button {
		width: fit-content;
		min-height: 2.75rem;
		margin-top: 0.2rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid rgb(184 255 61 / 30%);
		border-radius: 0.45rem;
		background: rgb(184 255 61 / 7%);
		color: #dfffaa;
		cursor: pointer;
		font: 650 0.7rem/1.2 var(--font-sans, system-ui, sans-serif);
	}
</style>
