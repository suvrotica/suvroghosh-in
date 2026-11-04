<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import '@fontsource-variable/archivo';
	import './fractal-trip.css';
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		void import('./FractalTripApp.svelte')
			.then((module) => {
				if (!disposed) Runtime = module.default;
			})
			.catch(() => {
				if (!disposed) failed = true;
			});
		return () => {
			disposed = true;
		};
	});
</script>

<section class="ft-shell not-prose" aria-label="Fractal Trip interactive explorer" data-tts-exclude>
	<h1 class="ft-sr-only">Fractal Trip: Change a Number, Follow the Pattern</h1>
	{#if Runtime}
		<Runtime />
	{:else}
		<div class="ft-placeholder">
			<p class="ft-eyebrow">A SMALL RULE. A WORLD OF DETAIL.</p>
			<h2>FRACTAL TRIP</h2>
			<img
				src="/images/visualizations/fractal-trip/poster.png"
				alt="Copper and turquoise fractal filaments opening into intricate violet spirals"
				width="1440"
				height="900"
			/>
			<p role="status">
				{failed ? 'The explorer could not load. Reload to try again.' : 'Preparing your view…'}
			</p>
			<noscript
				><p>
					Enable JavaScript to explore. The guide below explains the shapes and equations.
				</p></noscript
			>
		</div>
	{/if}
</section>
