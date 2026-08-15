<script lang="ts">
	import { resolve } from '$app/paths';
	import { substackLinks } from '$lib/config/links';
</script>

<section
	class="home-breakout home-invitation"
	aria-labelledby="home-invitation-heading"
	data-home-invitation
	data-scene-section
	data-scene-state="closing"
>
	<div class="home-invitation__coordinate" aria-hidden="true">
		<span class="home-invitation__point"></span>
		<span>22.5726° N · 88.3639° E</span>
	</div>

	<div class="home-invitation__content">
		<p class="home-invitation__index">Index 06 / A direct line</p>
		<h2 id="home-invitation-heading">
			Have a difficult healthcare system, data problem, or mechanism that needs to be made
			intelligible?
		</h2>
		<p>Tell me where the information stalls, changes meaning, or becomes difficult to trust.</p>

		<nav class="home-invitation__actions" aria-label="Work with or follow Suvro Ghosh">
			<a class="home-invitation__primary" href={resolve('/contact')}>Contact</a>
			<a href={resolve('/consulting')}>Healthcare IT Consulting</a>
			<!-- The shared newsletter destination is external, not a SvelteKit route. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a href={substackLinks.subscribe} target="_blank" rel="noopener noreferrer">
				Newsletter <span aria-hidden="true">↗</span><span class="sr-only">, opens in a new tab</span
				>
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</nav>
	</div>
</section>
