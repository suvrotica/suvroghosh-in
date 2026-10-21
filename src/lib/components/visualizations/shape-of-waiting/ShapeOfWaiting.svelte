<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import './shape-of-waiting.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				void import('./WaitingRuntime.svelte')
					.then((module) => {
						if (!disposed) Runtime = module.default;
					})
					.catch(() => {
						if (!disposed) failed = true;
					});
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

<section class="sow-lab" aria-label="The Shape of Waiting laboratory" bind:this={host}>
	<header class="sow-masthead">
		<div class="sow-edition">
			<span>THE EVERYDAY SYSTEMS LABORATORY</span><span>NO. 008 / OPERATIONS & PROBABILITY</span>
		</div>
		<div class="sow-title-row">
			<h1>The Shape of <em>Waiting.</em></h1>
			<div class="sow-premise">
				<span class="sow-kicker">AN INTERACTIVE QUEUE-DISTRIBUTION LABORATORY</span>
				<p>The average has excellent manners.<br />The queue has other ideas.</p>
				<span>Change a rule. Follow a person. Read the whole distribution.</span>
			</div>
		</div>
	</header>
	{#if Runtime}
		<Runtime />
	{:else}
		<div class="sow-loading">
			<img
				src="/images/visualizations/shape-of-waiting/shape-of-waiting-social.png"
				width="1200"
				height="630"
				alt="A curling queue coloured by waiting age beside its distribution and a reproducible waiting receipt"
			/>
			<p>
				{failed
					? 'The laboratory could not load. Reload to try again; the explanation below remains readable.'
					: 'Opening the counters. The laboratory loads as you approach.'}
			</p>
			<noscript
				><p>
					Enable JavaScript to change the queue. The model, assumptions and a static result are
					explained below.
				</p></noscript
			>
		</div>
	{/if}
</section>
