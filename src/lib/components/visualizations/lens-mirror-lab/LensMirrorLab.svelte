<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import './optics.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		const load = () =>
			void import('./LensMirrorRuntime.svelte')
				.then((module) => {
					if (!disposed) Runtime = module.default;
				})
				.catch(() => {
					if (!disposed) failed = true;
				});
		if (!('IntersectionObserver' in window)) {
			load();
			return () => {
				disposed = true;
			};
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					load();
				}
			},
			{ rootMargin: '500px' }
		);
		observer.observe(host);
		return () => {
			disposed = true;
			observer.disconnect();
		};
	});
</script>

<section
	class="optics-lab not-prose"
	id="lens-mirror-lab"
	aria-label="The Lens and Mirror Lab"
	data-tts-exclude
	bind:this={host}
>
	<header class="optics-masthead">
		<div class="optics-edition">
			<span>THE OPTICAL WORKBENCH</span><span>EXPERIMENT NO. 01 / IMAGE GEOMETRY</span>
		</div>
		<div class="optics-title-row">
			<h1>Reality,<br /><em>with a twist.</em></h1>
			<div class="optics-intro">
				<span class="optics-eyebrow">THE LENS & MIRROR LAB</span>
				<p>
					A straight line. A familiar face. A little change in geometry. Turn a dial and see how an
					image bends.
				</p>
				<a href="#optics-explanation">Explore the optics below <span aria-hidden="true">↗</span></a>
			</div>
		</div>
	</header>
	{#if Runtime}
		<Runtime />
	{:else}
		<div class="optics-placeholder">
			<img
				src="/images/visualizations/through-a-different-glass/poster.png"
				alt="Static comparison of the original calibration chart and barrel distortion."
				width="1400"
				height="1271"
				loading="eager"
			/>
			<p>
				{failed
					? 'The controls could not load. Reload to try again; the comparison and article remain readable.'
					: 'Preparing your optical workbench…'}
			</p>
			<noscript
				><p>
					JavaScript enables the controls. The static comparison and full explanation remain
					available below.
				</p></noscript
			>
		</div>
	{/if}
</section>
