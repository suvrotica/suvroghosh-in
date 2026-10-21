<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import './openhie.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				void import('./ExchangeRuntime.svelte')
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
	class="ohie-lab"
	aria-label="OpenHIE patient information exchange simulation"
	data-tts-exclude
	bind:this={host}
>
	<header class="ohie-masthead">
		<div class="ohie-edition">
			<span>THE EVERYDAY SYSTEMS LABORATORY</span><span
				>FIELD STUDY / HEALTH INFORMATION EXCHANGE</span
			>
		</div>
		<div class="ohie-title-row">
			<h1>The Patient<br />Between <em>the Systems.</em></h1>
			<div class="ohie-premise">
				<span class="ohie-kicker">AN OPENHIE INSTRUMENT</span>
				<p>The report exists.<br />Can the next hospital use it?</p>
				<span
					>Follow one person. Inspect the agreements.<br />Find the point where a message needs a
					human.</span
				>
			</div>
		</div>
	</header>
	{#if Runtime}
		<Runtime />
	{:else}
		<div class="ohie-loading">
			<img
				src="/images/visualizations/openhie/openhie-social.png"
				width="1200"
				height="630"
				alt="An isometric mechanical exchange instrument with an identity index, reference wheel and shared-record drawers, following a fictional patient between institutions"
			/>
			<p>
				{failed
					? 'The instrument could not load. Reload to try again; the essay and model explanation below remain readable.'
					: 'Opening the exchange. The interactive instrument loads as you approach.'}
			</p>
			<noscript
				><p>
					Enable JavaScript to operate the instrument. The essay below explains the architecture,
					synthetic case and model limits.
				</p></noscript
			>
		</div>
	{/if}
</section>
