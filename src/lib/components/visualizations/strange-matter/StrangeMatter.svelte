<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import '@fontsource-variable/archivo';
	import '@fontsource-variable/newsreader';
	import './strange-matter.css';
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		void import('./StrangeMatterApp.svelte')
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

<section class="sm-shell" aria-label="Strange Matter generative art playground" data-tts-exclude>
	{#if Runtime}
		<Runtime />
	{:else}
		<div class="sm-placeholder">
			<h1 class="sm-placeholder-title">
				<span>✳</span> STRANGE MATTER <small>AN EXPERIMENT IN BEAUTIFUL ACCIDENTS</small>
			</h1>
			<img
				src="/images/visualizations/strange-matter/poster.png"
				alt="An iridescent liquid sculpture twisting through a dark space"
				width="1200"
				height="750"
			/>
			<p role="status">
				{failed
					? 'The studio could not load. Reload the page to try again.'
					: 'A little order. A little chaos. Preparing your studio…'}
			</p>
			<noscript
				><p>
					Enable JavaScript to shape, animate and export these sculptures. Read the guide below to
					explore the four visual worlds.
				</p></noscript
			>
		</div>
	{/if}
</section>
