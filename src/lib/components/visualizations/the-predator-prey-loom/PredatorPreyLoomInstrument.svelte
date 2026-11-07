<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import { resolve } from '$app/paths';
	import './predator-prey-loom.css';

	let AppComponent = $state<Component | null>(null);
	let forceStaticFallback = $state<boolean>(false);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('canvas') === 'off' || params.get('fallback') === '1') {
			forceStaticFallback = true;
			return;
		}

		try {
			const mod = await import('./PredatorPreyLoomApp.svelte');
			AppComponent = mod.default;
		} catch (err) {
			loadError =
				err instanceof Error
					? err.message
					: 'The interactive Predator–Prey Loom instrument could not be loaded.';
		}
	});
</script>

<section
	class="predator-prey-loom-shell not-prose"
	aria-label="The Predator–Prey Loom interactive population dynamics visualisation"
	data-testid="predator-prey-loom-shell"
	data-tts-exclude
>
	<header class="ppl-intro">
		<div class="ppl-intro__top">
			<h1 class="ppl-intro__title">The Predator–Prey Loom</h1>
			<p class="ppl-intro__meta">
				By <a href={resolve('/resume')} rel="author">Suvro Ghosh</a>
				<span aria-hidden="true">·</span>
				Published <time datetime="2026-11-07">7 November 2026</time>
				<span aria-hidden="true">·</span>
				Updated <time datetime="2026-11-07">7 November 2026</time>
			</p>
		</div>

		<p class="ppl-intro__lead" data-testid="intro-copy-primary">
			More food can support more prey. That gives predators more to eat, but their population takes
			time to respond. By the time predator numbers have risen, prey may already be declining.
		</p>
		<p class="ppl-intro__sub" data-testid="intro-copy-secondary">
			This visualisation lets you follow that sequence. Add food, reduce the predator population, or
			change how effectively predators hunt. Watch what happens to both populations—and whether
			their earlier pattern returns.
		</p>
	</header>

	{#if AppComponent && !forceStaticFallback}
		<AppComponent />
	{:else}
		<div class="ppl-fallback" data-testid="predator-prey-loom-static-fallback">
			<p style="margin: 0; font-weight: 700; color: var(--ppl-text);">
				Why do predator numbers often peak after prey numbers—and how can increasing the food
				available to prey produce larger population swings?
			</p>
			<p style="margin: 0; color: var(--ppl-text-secondary);">
				Using the Rosenzweig–MacArthur predator–prey model (illustrative population densities <em
					>N</em
				>
				for prey and <em>P</em> for predators over model-time units), the phase portrait records
				both populations at the same moment (“Right means more prey. Up means more predators. Follow
				the arrows to see what changes next.”), while the two aligned time-history tracks below show
				that <strong>predators peak later</strong> than prey. For the starting configuration (<em
					>r</em
				>
				= 1, <em>h</em> = 1, <em>e</em> = 0.5, <em>m</em> = 0.2,
				<em>a</em> = 1), the coexistence equilibrium loses stability at <em>K</em> = 7/3 ≈ 2.33:
				oscillations settle towards steady coexistence at <em>K</em> = 1.5, form a persistent
				repeating cycle at <em>K</em> = 3.0, and produce larger swings with lower prey troughs at
				<em>K</em> = 4.0.
			</p>

			{#if loadError}
				<p role="alert" style="margin: 0; color: var(--ppl-predator); font-weight: 600;">
					Interactive simulation unavailable ({loadError}). Showing the verified computed figure
					below.
				</p>
			{/if}

			<img
				src="/images/visualizations/the-predator-prey-loom/poster.png"
				alt="Computed Predator–Prey Loom instrument showing the phase portrait trajectory with prey and predator peaks highlighted, alongside two aligned time-history tracks for prey in mint green and predators in warm amber."
				width="1200"
				height="750"
				loading="eager"
				decoding="async"
			/>

			<p style="margin: 0; font-size: 0.84rem; color: var(--ppl-text-secondary);">
				<strong>Note:</strong> Populations are shown as illustrative densities over model-time units,
				not measured counts from a specific wild ecosystem. Low values in a deterministic continuous model
				do not establish extinction, which in real ecosystems also depends on chance fluctuations.
			</p>
		</div>
	{/if}

	<noscript>
		<p style="margin-top: 0.75rem; color: var(--ppl-text-secondary);">
			Enable JavaScript to run the interactive phase portrait, time-history cursor, interventions,
			and 3 × 3 stability comparison grid in your browser.
		</p>
	</noscript>
</section>
