<script lang="ts">
	import { resolve } from '$app/paths';
	import { substackLinks, youtubeProfile } from '$lib/config/links';
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
		<h2 id="home-invitation-heading">Follow a useful idea. See where it goes.</h2>
		<p>
			Explore the experiments, watch the videos, or stay with the writing. Questions, corrections
			and thoughtful disagreements are welcome.
		</p>

		<nav class="home-invitation__actions" aria-label="Follow or contact Suvro Ghosh">
			<a class="home-invitation__primary" href={resolve('/about')}>About Suvro</a>
			<a href={resolve('/contact')}>Get in touch</a>
			<!-- The shared newsletter destination is external, not a SvelteKit route. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a href={youtubeProfile.url} target="_blank" rel="noopener noreferrer">
				Videos <span aria-hidden="true">↗</span><span class="sr-only">, opens in a new tab</span>
			</a>
			<a href={substackLinks.subscribe} target="_blank" rel="noopener noreferrer">
				Newsletter <span aria-hidden="true">↗</span><span class="sr-only">, opens in a new tab</span
				>
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</nav>
	</div>
</section>
