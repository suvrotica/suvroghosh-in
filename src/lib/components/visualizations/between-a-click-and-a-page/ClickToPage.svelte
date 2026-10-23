<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import {
		createJourney,
		sampleJourney,
		DEFAULT_INPUT
	} from '$lib/visualizations/between-a-click-and-a-page/model';
	import RequestScene from './RequestScene.svelte';
	import './anatomy.css';
	import './network.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	const example = createJourney({ ...DEFAULT_INPUT, lostSegment: true });
	const fallback = sampleJourney(example, example.segments[3].originalArrivalMs + 1);
	onMount(() => {
		let disposed = false;
		const load = () =>
			void import('./RequestRuntime.svelte')
				.then((module) => {
					if (!disposed) Runtime = module.default;
				})
				.catch(() => {
					if (!disposed) failed = true;
				});
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
	class="net-lab not-prose"
	aria-label="Between a Click and a Page interactive instrument"
	data-network-feature
	data-tts-exclude
	bind:this={host}
>
	{#if Runtime}
		<Runtime />
	{:else}
		<header class="net-masthead">
			<div class="net-edition">
				<span>THE EVERYDAY MACHINERY / 01</span><span>AN INTERNET FIELD INSTRUMENT</span>
			</div>
			<h1>Between a click<br />and <em>a page.</em></h1>
			<p>A page seems to arrive all at once. Its obligations arrive one at a time.</p>
		</header>
		<RequestScene snapshot={fallback} selected="buffer" />
		<div class="net-fallback">
			<p>
				<strong>A missing piece holds up the queue.</strong> In this still example, the first 1,200 response
				bytes have arrived in order. Another 2,400 bytes are waiting beyond a missing range. TCP keeps
				those later bytes in its receiving buffer until the gap is repaired.
			</p>
			<p>
				{failed
					? 'The controls could not load. Reload to try again; the instrument and article remain readable.'
					: 'The controls load as you approach the instrument.'}
			</p>
			<noscript
				><p>
					The full explanation below works without JavaScript. JavaScript enables stepping through
					the exchange and changing its conditions.
				</p></noscript
			>
		</div>
	{/if}
</section>
