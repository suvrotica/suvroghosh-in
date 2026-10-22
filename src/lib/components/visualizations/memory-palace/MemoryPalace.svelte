<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import './memory-palace.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		const load = () => {
			void import('./PalaceRuntime.svelte')
				.then((module) => {
					if (!disposed) Runtime = module.default;
				})
				.catch(() => {
					if (!disposed) failed = true;
				});
		};
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					load();
				}
			},
			{ rootMargin: '400px' }
		);
		observer.observe(host);
		return () => {
			disposed = true;
			observer.disconnect();
		};
	});
</script>

<section
	class="mp-lab not-prose article-breakout"
	data-memory-palace
	data-tts-exclude
	aria-label="Build a memory palace"
	bind:this={host}
>
	<header class="mp-masthead">
		<div class="mp-eyebrow">
			<span>THE CALCUTTA FIELDBOOK</span><span>AN EXPERIMENT IN REMEMBERING</span>
		</div>
		<div class="mp-title-row">
			<h2>A place for<br /><em>every idea.</em></h2>
			<div>
				<p class="mp-deck">
					A few words. A familiar walk.<br />&#32;Something to remember at every turn.
				</p>
				<p class="mp-fine">Learn the route · Make a scene · Try remembering</p>
			</div>
		</div>
	</header>
	{#if Runtime}<Runtime />{:else}
		<div class="mp-fallback">
			<img
				src="/images/visualizations/memory-palace/social.png"
				width="1200"
				height="630"
				alt="A Calcutta house with twelve numbered landmarks, from its garden gate to its roof terrace"
			/>
			<p>
				{failed
					? 'The interactive palace could not load. Reload to try again; the complete guide remains below.'
					: 'Opening the house. The interactive practice loads as you approach.'}
			</p>
			<noscript
				><p>
					The house above is a static illustration. Follow the worked routes in the article using
					paper, or enable JavaScript to build and practise your own.
				</p></noscript
			>
		</div>
	{/if}
</section>
