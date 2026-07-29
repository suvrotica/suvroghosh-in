<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import KineticLine from './KineticLine.svelte';
</script>

<section
	class="home-breakout living-hero page-enter"
	aria-labelledby="living-hero-heading"
	data-living-hero
>
	<div class="living-hero__content">
		<p class="living-hero__eyebrow">
			Healthcare IT &middot; Interoperability &middot; Applied AI &middot; Calcutta
		</p>
		<h1 id="living-hero-heading">Suvro Ghosh</h1>
		<p class="living-hero__role">Healthcare IT Architect &amp; Clinical Data Systems Consultant</p>
		<p class="living-hero__description">
			I work on healthcare data systems, interoperability, clinical data architecture, and AI-ready
			health information infrastructure. I also write essays and satire on technology, illness,
			corruption, society, and ordinary life in Calcutta.
		</p>

		<KineticLine />

		<div class="living-hero__actions" role="group" aria-label="Introduction links">
			<Button href={resolve('/resume')} size="lg" class="px-6">View Resume</Button>
			<Button href={resolve('/projects')} variant="outline" size="lg" class="px-6">Projects</Button>
			<Button href={resolve('/consulting')} variant="outline" size="lg" class="px-6"
				>Healthcare IT Consulting</Button
			>
			<Button href={resolve('/writing')} variant="outline" size="lg" class="px-6">Writings</Button>
			<Button href={resolve('/contact')} variant="ghost" size="lg" class="px-6">Contact</Button>
		</div>
	</div>

	<div class="living-hero__specimen" aria-hidden="true">
		<span class="living-hero__plane"></span>
		<span class="living-hero__orbit living-hero__orbit--outer"></span>
		<span class="living-hero__orbit living-hero__orbit--inner"></span>
		<span class="living-hero__trace"></span>
		<span class="living-hero__node living-hero__node--a"></span>
		<span class="living-hero__node living-hero__node--b"></span>
		<span class="living-hero__node living-hero__node--c"></span>
		<span class="living-hero__coordinate">22.5726° N · 88.3639° E</span>
	</div>
</section>
