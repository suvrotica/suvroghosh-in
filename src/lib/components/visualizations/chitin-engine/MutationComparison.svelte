<script lang="ts">
	import { onMount } from 'svelte';
	import { normalizeExhibitState } from '$lib/visualizations/chitin-engine/genome';
	import { FallbackRenderer } from '$lib/visualizations/chitin-engine/fallback-renderer';
	import { buildCreaturePhenotype } from '$lib/visualizations/chitin-engine/phenotype-builder';
	import { createCreaturePose } from '$lib/visualizations/chitin-engine/pose';
	import { getPalette } from '$lib/visualizations/chitin-engine/presets';
	import type { CreatureGenome } from '$lib/visualizations/chitin-engine/types';

	type Props = {
		parent: CreatureGenome;
		child: CreatureGenome;
		changedGroups?: readonly string[];
		onClose: () => void;
	};

	let { parent, child, changedGroups = [], onClose }: Props = $props();
	let parentHost: HTMLDivElement;
	let childHost: HTMLDivElement;
	let parentCanvas: HTMLCanvasElement;
	let childCanvas: HTMLCanvasElement;
	let parentRenderer: FallbackRenderer | undefined;
	let childRenderer: FallbackRenderer | undefined;

	function drawOne(
		host: HTMLDivElement,
		renderer: FallbackRenderer,
		genome: CreatureGenome,
		time: number
	) {
		const bounds = host.getBoundingClientRect();
		if (bounds.width < 2 || bounds.height < 2) return;
		const phenotype = buildCreaturePhenotype(genome);
		const pose = createCreaturePose(phenotype, { paused: true, genomeTime: time });
		const state = normalizeExhibitState({ genome, paused: true });
		renderer.setSize(bounds.width, bounds.height, Math.min(window.devicePixelRatio || 1, 1.5));
		renderer.render(phenotype, pose, state, {
			palette: getPalette(phenotype.genome.palette),
			includeLabel: false,
			includeOverlays: false,
			exportSafe: true,
			time
		});
	}

	function draw() {
		if (parentRenderer) drawOne(parentHost, parentRenderer, parent, 1.31);
		if (childRenderer) drawOne(childHost, childRenderer, child, 1.31);
	}

	onMount(() => {
		parentRenderer = new FallbackRenderer(parentCanvas);
		childRenderer = new FallbackRenderer(childCanvas);
		const observer = new ResizeObserver(draw);
		observer.observe(parentHost);
		observer.observe(childHost);
		draw();
		return () => {
			observer.disconnect();
			parentRenderer?.dispose();
			childRenderer?.dispose();
		};
	});

	$effect(() => {
		void parent;
		void child;
		draw();
	});
</script>

<section class="mutation-comparison" aria-labelledby="mutation-comparison-heading">
	<header>
		<div>
			<p>Deterministic mutation audit</p>
			<h3 id="mutation-comparison-heading">Parent and child, held to one pose</h3>
		</div>
		<button type="button" onclick={onClose} aria-label="Close parent comparison">Close</button>
	</header>
	<div class="comparison-grid">
		<figure>
			<div class="canvas-host" bind:this={parentHost}>
				<canvas bind:this={parentCanvas} aria-hidden="true"></canvas>
			</div>
			<figcaption><b>Parent</b><code>{parent.seed}</code></figcaption>
		</figure>
		<figure>
			<div class="canvas-host" bind:this={childHost}>
				<canvas bind:this={childCanvas} aria-hidden="true"></canvas>
			</div>
			<figcaption><b>Child</b><code>{child.seed}</code></figcaption>
		</figure>
	</div>
	<p class="changes">
		Changed groups:
		<strong
			>{changedGroups.length > 0
				? changedGroups.join(', ')
				: 'manual edits or repaired constraints'}</strong
		>. Both thumbnails use the same frozen clock, camera, and simplified Canvas2D renderer.
	</p>
</section>

<style>
	.mutation-comparison {
		display: grid;
		gap: 0.9rem;
		padding: 1rem;
		border: 1px solid rgb(209 159 255 / 24%);
		border-radius: 1rem;
		background: linear-gradient(145deg, #0b0814, #060711);
		color: #d9dbe5;
		font: 0.78rem/1.45 var(--font-sans, system-ui, sans-serif);
	}
	header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
	}
	header p,
	header h3,
	figure,
	figcaption,
	.changes {
		margin: 0;
	}
	header p {
		color: #c49be8;
		font: 700 0.6rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	header h3 {
		margin-top: 0.25rem;
		color: white;
		font-size: 1rem;
	}
	header button {
		min-height: 2.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid rgb(255 255 255 / 14%);
		border-radius: 0.5rem;
		background: rgb(255 255 255 / 5%);
		color: #e8eaf1;
		cursor: pointer;
	}
	.comparison-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}
	figure {
		overflow: hidden;
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 0.7rem;
		background: #050610;
	}
	.canvas-host {
		aspect-ratio: 16 / 10;
		min-height: 10rem;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	figcaption {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.55rem 0.7rem;
		border-top: 1px solid rgb(255 255 255 / 8%);
	}
	code {
		color: #b8ff3d;
		font-family: var(--font-mono, monospace);
	}
	.changes {
		color: #999cad;
	}
	.changes strong {
		color: #d6b1f6;
		font-weight: 650;
		text-transform: capitalize;
	}
	@media (max-width: 36rem) {
		.comparison-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
