<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import './missing-data.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		let loading = false;
		async function load() {
			if (loading) return;
			loading = true;
			try {
				const module = await import('./MissingDataRuntime.svelte');
				if (!disposed) Runtime = module.default;
			} catch {
				if (!disposed) failed = true;
			}
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					void load();
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
	class="missing-score"
	aria-label="The Music of Missing Data interactive explorer"
	bind:this={host}
>
	<header class="ms-masthead">
		<div class="ms-edition">
			<span>FIELD NOTES / 007</span><span>AN INSTRUMENT FOR SEEING ABSENCE</span><span
				>SUVRO GHOSH · 2026</span
			>
		</div>
		<div class="ms-title-row">
			<!-- eslint-disable-next-line svelte/no-useless-mustaches -- Preserve a word separator in the accessible title across the visual line break. -->
			<h1>The Music of{' '}<br /><em>Missing Data</em><span class="ms-title-dot">.</span></h1>
			<div class="ms-introduction">
				<span class="ms-overline">A MISSINGNESS-PATTERN EXPLORER</span>
				<p>A dataset can lose a third of its values in several very different ways.</p>
				<p class="ms-muted-ink">Change what disappears. Watch the silence take shape.</p>
			</div>
		</div>
	</header>
	{#if Runtime}
		<Runtime />
	{:else}
		<div class="ms-loading">
			<img
				src="/images/visualizations/missing-data/missing-data-social.png"
				width="1200"
				height="630"
				alt="A dropout-over-time fingerprint with a stepped dark frontier across a teal and coral participant-by-visit matrix, labelled 40 per cent missing and seed 1847"
			/>
			<p>
				{failed
					? 'The interactive instrument could not load. Reload to try again; the article and this static plate remain available.'
					: 'A matrix of light. A score of silences. The interactive instrument loads as you approach.'}
			</p>
			<noscript
				><p>
					Enable JavaScript to change the missingness pattern, hear the score, or download a
					fingerprint. The complete explanation follows below.
				</p></noscript
			>
		</div>
	{/if}
</section>
