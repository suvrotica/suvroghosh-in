<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	let hasScrolled = $state(false);

	onMount(() => {
		const updateCue = () => {
			if (window.scrollY > 24) hasScrolled = true;
		};
		updateCue();
		window.addEventListener('scroll', updateCue, { passive: true });
		return () => window.removeEventListener('scroll', updateCue);
	});
</script>

<section
	class="home-breakout living-hero page-enter"
	aria-labelledby="living-hero-heading"
	data-living-hero
	data-scene-state="hero"
>
	<p class="living-hero__index">Index 00 / The Living Index</p>
	<div class="living-hero__content">
		<p class="living-hero__eyebrow">
			Healthcare IT &middot; Interoperability &middot; Applied AI &middot; Calcutta
		</p>
		<h1 id="living-hero-heading">Suvro Ghosh</h1>
		<p class="living-hero__role">Healthcare IT Architect &amp; Clinical Data Systems Consultant</p>
		<p class="living-hero__description">
			I design the architecture beneath health-information exchange: how clinical records move,
			survive translation, and become reliable enough for care and applied AI. This site also
			follows other signals—scientific experiments, essays, games, and ordinary life in Calcutta.
		</p>

		<div class="living-hero__actions" aria-label="Introduction links">
			<a class="living-hero__primary" href={resolve('/projects')}>View Projects</a>
			<a class="living-hero__secondary" href={resolve('/consulting')}>Healthcare IT Consulting</a>
		</div>

		<nav class="living-hero__tertiary" aria-label="More about Suvro Ghosh">
			<a href={resolve('/resume')}>Resume</a>
			<a href={resolve('/writing')}>Writing</a>
			<a href={resolve('/contact')}>Contact</a>
		</nav>
	</div>

	<div class="living-hero__coordinates" aria-label="Calcutta coordinates">
		<span>22.5726° N</span>
		<span>88.3639° E</span>
	</div>

	<p class="living-hero__cue" hidden={hasScrolled}>
		Follow the signals <span aria-hidden="true">↓</span>
	</p>
</section>
