<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import { resolve } from '$app/paths';
	import './epidemic-mosaic.css';

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
			const mod = await import('./EpidemicMosaicApp.svelte');
			AppComponent = mod.default;
		} catch (err) {
			loadError =
				err instanceof Error
					? err.message
					: 'The interactive epidemic mosaic module could not be loaded.';
		}
	});
</script>

<section
	class="epidemic-mosaic-shell not-prose"
	aria-label="The Epidemic Mosaic interactive network epidemiology experiment"
	data-testid="epidemic-mosaic-shell"
	data-tts-exclude
>
	<header class="em-intro">
		<div class="em-intro__top">
			<h1 class="em-intro__title">The Epidemic Mosaic</h1>
			<p class="em-intro__meta">
				By <a href={resolve('/resume')} rel="author">Suvro Ghosh</a>
				<span aria-hidden="true">·</span>
				Published <time datetime="2026-11-07">7 November 2026</time>
				<span aria-hidden="true">·</span>
				Updated <time datetime="2026-11-07">7 November 2026</time>
			</p>
		</div>

		<p class="em-intro__lead" data-testid="intro-copy-primary">
			Two communities. One infection. Add a connection and see what changes.
		</p>
		<p class="em-intro__sub" data-testid="intro-copy-secondary">
			Each shape contains people. Lines show contact between regions. Sharing a border does not
			create contact.
		</p>

		<div class="em-intro__rules" data-testid="intro-rules">
			<p>
				<strong>Equal regional populations:</strong> Every region starts with 100 people (3,600 in total
				across 36 regions). Polygon size does not represent population.
			</p>
			<p>
				<strong>Contact links, not migration:</strong> Edges represent contact opportunities between residents.
				People remain assigned to their home regions; this is not a model of physical travel or migration.
			</p>
		</div>
	</header>

	{#if AppComponent && !forceStaticFallback}
		<AppComponent />
	{:else}
		<div class="em-fallback" data-testid="epidemic-mosaic-static-fallback">
			<p style="margin: 0; font-weight: 700; color: var(--em-text-main);">
				What changes when two separate communities gain one connection?
			</p>
			<p style="margin: 0; color: var(--em-text-secondary);">
				A reproducible synthetic city of 36 Voronoi regions (18 in Community A, 18 in Community B,
				100 people per region) begins with 5 initial infections in <strong>A5 · Market Cross</strong>
				and none in Community B. Adding a single undirected bridge between
				<strong>A6 · Foundry Quay</strong> and <strong>B3 · Canal Basin</strong> allows transmission to
				cross between the communities without guaranteed spread on every run.
			</p>

			{#if loadError}
				<p role="alert" style="margin: 0; color: var(--em-accent-amber-bright); font-weight: 600;">
					Interactive simulation unavailable ({loadError}). Showing the verified computed comparison
					below.
				</p>
			{/if}

			<img
				src="/images/visualizations/the-epidemic-mosaic/poster.png"
				alt="Computed side-by-side comparison of The Epidemic Mosaic: 36 Voronoi regions divided into Community A and Community B, showing area-proportional horizontal colour bands for susceptible, infectious, recovered, and vaccinated populations with and without a cross-community bridge."
				width="1200"
				height="750"
				loading="eager"
				decoding="async"
			/>

			<p style="margin: 0; font-size: 0.85rem; color: var(--em-text-secondary);">
				<strong>Note:</strong> This is a synthetic city for exploring transmission. It does not predict
				an outbreak in a real place.
			</p>
		</div>
	{/if}

	<noscript>
		<p style="margin-top: 0.75rem; color: var(--em-text-secondary);">
			Enable JavaScript to run the live stochastic epidemic comparison and equal-budget vaccination
			experiments in your browser.
		</p>
	</noscript>
</section>
