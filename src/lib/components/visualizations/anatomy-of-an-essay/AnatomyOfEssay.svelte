<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import './essay-anatomy.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	onMount(() => {
		let disposed = false;
		const load = () =>
			void import('./EssayRuntime.svelte')
				.then((module) => {
					if (!disposed) Runtime = module.default;
				})
				.catch(() => {
					if (!disposed) failed = true;
				});
		if (!('IntersectionObserver' in window)) {
			load();
			return () => {
				disposed = true;
			};
		}
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
	class="essay-atlas not-prose"
	id="essay-atlas"
	aria-label="The Anatomy of an Essay"
	data-tts-exclude
	bind:this={host}
>
	<header class="ea-masthead">
		<div class="ea-edition">
			<span>THE CABINET OF LITERARY NATURAL HISTORY</span><span>PLATE 01 · TEXT / FORM / LIFE</span>
		</div>
		<div class="ea-title-row">
			<div>
				<span class="ea-eyebrow">THE ANATOMY OF AN ESSAY</span>
				<h1>Every essay<br />has a <em>body.</em></h1>
			</div>
			<div class="ea-premise">
				<p>Paragraphs become organs.<br />Sentences grow ribs.<br />A thought acquires a pulse.</p>
				<span>Read the essay. Watch it come alive.</span>
			</div>
		</div>
	</header>
	{#if Runtime}<Runtime />{:else}
		<div class="ea-loading">
			<img
				src="/images/visualizations/anatomy-of-an-essay/poster.svg"
				width="1200"
				height="900"
				alt="A literary specimen with paragraph chambers, articulated sentence ribs and branching vessels, generated from an essay’s actual text"
			/>
			<p>
				{failed
					? 'The interactive atlas could not load. Reload to try again; the specimen and explanation remain available.'
					: 'Opening the specimen cabinet…'}
			</p>
			<noscript
				><p>
					JavaScript enables passage selection, comparison and local text analysis. This portrait is
					a static specimen; the methodology remains readable below.
				</p></noscript
			>
		</div>
	{/if}
</section>
