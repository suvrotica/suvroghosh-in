<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import '@fontsource-variable/archivo';
	import '@fontsource-variable/newsreader';
	import './soap-film.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		let requested = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting) || requested) return;
				requested = true;
				observer.disconnect();
				void import('./SoapFilmApp.svelte')
					.then((module) => {
						if (!disposed) Runtime = module.default;
					})
					.catch(() => {
						if (!disposed) failed = true;
					});
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
	bind:this={host}
	class="sf-shell"
	aria-label="Soap film interactive explanation"
	data-tts-exclude
>
	<header class="sf-heading">
		<div class="sf-kicker">
			<span class="sf-spectrum"></span> LIGHT, UP CLOSE
			<span class="sf-credit">An interactive explanation · Suvro Ghosh</span>
		</div>
		<h1>Why soap bubbles<br />change <em>colour.</em></h1>
		<p>
			Change the thickness. Move around the bubble.<br class="sf-mobile-break" /> Watch which colours
			come back.
		</p>
	</header>
	{#if Runtime}
		<Runtime />
	{:else}
		<div class="sf-placeholder">
			<img
				src="/images/visualizations/soap-film/poster.png"
				alt="Bright bands of reflected colour across a spherical soap bubble against black"
				width="1200"
				height="900"
			/>
			<p role="status">
				{failed
					? 'The interactive film could not load. The image and explanation are still available.'
					: 'Preparing the soap film…'}
			</p>
			<noscript
				><p>
					This still shows the soap bubble. Enable JavaScript to change its film thickness and
					viewing angle.
				</p></noscript
			>
		</div>
	{/if}
</section>
