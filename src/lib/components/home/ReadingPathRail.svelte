<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ReadingPathSummary } from '$lib/content/reading-paths';
	import LivingCard from './LivingCard.svelte';

	let { paths }: { paths: readonly ReadingPathSummary[] } = $props();

	const startHereHref = resolve('/start-here');
</script>

<section
	class="home-breakout reading-paths"
	aria-labelledby="start-here-heading"
	data-reading-path-rail
>
	<div class="reading-paths__intro">
		<div>
			<p class="reading-paths__eyebrow">New to the site?</p>
			<h2 id="start-here-heading">Not sure where to begin?</h2>
			<p class="reading-paths__description">
				Follow five short reading paths through the essays, healthcare systems work, science,
				Calcutta, and fiction.
			</p>
		</div>
		<a class="reading-paths__route-link" href={startHereHref}>
			Explore the reading paths <span aria-hidden="true">→</span>
		</a>
	</div>

	<ol class="reading-paths__rail">
		{#each paths as path, index (path.id)}
			<li data-path-id={path.id}>
				<LivingCard
					href={`${startHereHref}#${path.id}`}
					variant="path"
					data-reading-path-card
					data-path-id={path.id}
				>
					<span class="reading-path-card__number">
						{String(index + 1).padStart(2, '0')}
					</span>
					<span class="reading-path-card__eyebrow">{path.eyebrow}</span>
					<h3>{path.label}</h3>
					<span class="reading-path-card__description">{path.description}</span>
					<span class="reading-path-card__arrow" aria-hidden="true">Follow path →</span>
				</LivingCard>
			</li>
		{/each}
	</ol>
</section>
