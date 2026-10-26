<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import './living-systems.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				void import('./LivingRuntime.svelte')
					.then((module) => {
						if (!disposed) Runtime = module.default;
					})
					.catch(() => {
						if (!disposed) failed = true;
					});
			},
			{ rootMargin: '350px' }
		);
		observer.observe(host);
		return () => {
			disposed = true;
			observer.disconnect();
		};
	});
</script>

<section
	class="ls-lab"
	aria-label="Living Systems simulation playground"
	data-tts-exclude
	bind:this={host}
>
	<header class="ls-masthead">
		<div class="ls-edition">
			<span><i></i> THE SMALL RULES OBSERVATORY</span><span
				>FOUR EXPERIMENTS / ONE WORLD AT A TIME</span
			>
		</div>
		<div class="ls-title-row">
			<div>
				<span class="ls-eyebrow">AN INTERACTIVE FIELD GUIDE TO EMERGENCE</span>
				<h1>Living <em>Systems.</em></h1>
			</div>
			<p>
				Small rules.<br /><em>Unexpected worlds.</em><span
					>Change a beginning. See what follows.</span
				>
			</p>
		</div>
	</header>
	{#if Runtime}<Runtime />{:else}
		<div class="ls-loading">
			<img
				src="/images/visualizations/living-systems/social.png"
				alt="A field of living cellular patterns in the Living Systems observatory"
				width="1200"
				height="1183"
			/>
			<p>
				{failed
					? 'The interactive field could not load. Reload to try again; the guide below remains available.'
					: 'Preparing four small worlds…'}
			</p>
			<noscript
				><p>
					Enable JavaScript to run the simulations. The rules and explanations below remain
					readable.
				</p></noscript
			>
		</div>
	{/if}
</section>
