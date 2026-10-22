<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import Cabinet from './Cabinet.svelte';
	import CollectionLedger from './CollectionLedger.svelte';
	import { ARCHIVE } from '$lib/visualizations/the-museum-of-almost/fixtures';
	import { collectionLabel, collectionTally } from '$lib/visualizations/the-museum-of-almost/model';
	import './museum.css';
	const tally = collectionTally(ARCHIVE);
	const contentStatus =
		tally.demonstration === tally.total
			? 'demonstration'
			: tally.verified === tally.total
				? 'verified'
				: 'mixed';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				void import('./MuseumRuntime.svelte')
					.then((module) => {
						if (!disposed) Runtime = module.default;
					})
					.catch(() => {
						if (!disposed) failed = true;
					});
			},
			{ rootMargin: '450px' }
		);
		observer.observe(host);
		return () => {
			disposed = true;
			observer.disconnect();
		};
	});
</script>

<section
	class="ma-museum"
	aria-label="The Museum of Almost interactive specimen cabinet"
	data-tts-exclude
	data-maker-feature="the-museum-of-almost"
	data-maker-content-status={contentStatus}
	bind:this={host}
>
	{#if Runtime}
		<Runtime />
	{:else}
		<div data-maker-capture class="ma-static">
			<header class="ma-masthead">
				<div class="ma-edition">
					<span>THE EVERYDAY SYSTEMS COLLECTION</span><span>03 / AN INSPECTABLE ARCHIVE</span>
				</div>
				<p class="ma-demonstration">{collectionLabel(ARCHIVE)}</p>
				<h1>The Museum<br />of <em>Almost.</em></h1>
				<p class="ma-question">These things did not work out.<br />What, if anything, survived?</p>
			</header>
			<div class="ma-overview">
				<div class="ma-art iso-plate"><Cabinet /></div>
				<CollectionLedger />
			</div>
			<p class="ma-static-caption">
				An object’s purpose is a promise. Its record asks how much of the story we can support.
			</p>
		</div>
		<p class="ma-loading">
			{failed
				? 'The interactive cabinet could not load. Reload to try again; the records and explanation below remain readable.'
				: 'The cabinet opens as you approach.'}
		</p>
		<noscript
			><p>
				{collectionLabel(ARCHIVE)}. Read all {tally.total} records in the article below. Enable JavaScript
				to inspect the trouble spots, evidence and supported comparisons.
			</p></noscript
		>
	{/if}
</section>
