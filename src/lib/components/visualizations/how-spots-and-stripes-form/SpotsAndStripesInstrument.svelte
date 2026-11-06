<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import './spots-and-stripes.css';

	let AppComponent = $state<Component<{ initialReducedMotion?: boolean }> | null>(null);
	let forceStaticFallback = $state<boolean>(false);
	let initialReducedMotion = $state<boolean>(false);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('canvas') === 'off' || params.get('fallback') === '1') {
			forceStaticFallback = true;
			return;
		}
		if (
			params.get('motion') === 'reduce' ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			initialReducedMotion = true;
		}

		try {
			const mod = await import('./SpotsAndStripesApp.svelte');
			AppComponent = mod.default;
		} catch (err) {
			loadError =
				err instanceof Error
					? err.message
					: 'The interactive simulation module could not be loaded.';
		}
	});
</script>

{#if AppComponent && !forceStaticFallback}
	<AppComponent {initialReducedMotion} />
{:else}
	<section
		class="spots-fallback"
		aria-label="Computed static preview of how spots and stripes form"
		data-testid="spots-static-fallback"
	>
		<p class="spots-fallback__badge">
			Computed example. Press Grow from noise to see how it forms.
		</p>
		<h3>How a nearly uniform surface develops spots or stripes</h3>
		<p>
			This computed preview compares the three verified Turing regimes at model time
			<code>t = 60.0</code> from the same initial seed (<code>1952</code>, Grid <code>96 × 96</code>,
			spacing <code>h = 0.8</code>, inhibitor spreading <code>15×</code> faster than activator
			spreading, <code>D_u = 0.6</code>, <code>D_v = 9.0</code>) against an equal-spreading control
			(<code>1×</code>, <code>D_v = D_u = 0.6</code>). When both signals spread at the same rate,
			initial disturbances fade back to a flat equilibrium.
		</p>

		{#if loadError}
			<p role="alert" style="color: #F4938A; font-weight: 600;">
				Interactive workbench unavailable ({loadError}). Showing verified computed output below.
			</p>
		{/if}

		<img
			src="/images/visualizations/how-spots-and-stripes-form/poster.png"
			alt="Computed reaction–diffusion comparison showing isolated spots (k = -0.075), labyrinthine stripes (k = 0.000), inverse spots (k = +0.075) at 15x inhibitor spreading, and a uniform surface when both signals spread at equal rates (1x)."
			width="1200"
			height="750"
			loading="eager"
			decoding="async"
		/>
	</section>
{/if}

<noscript>
	<section class="spots-fallback" aria-label="No-JavaScript fallback for How spots and stripes form">
		<p class="spots-fallback__badge">Static fallback (JavaScript disabled)</p>
		<p>
			Enable JavaScript to run the live finite-difference solver in your browser and compare
			differential spreading (<code>15×</code>) against equal spreading (<code>1×</code>) in real
			time.
		</p>
	</section>
</noscript>
