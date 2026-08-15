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
	data-reading-path-list
	data-scene-section
	data-scene-state="guided"
>
	<div class="reading-paths__intro">
		<div>
			<p class="reading-paths__index">Index 03 / Guided routes</p>
			<p class="reading-paths__eyebrow">Guided reading</p>
			<h2 id="start-here-heading">Five ways into the work</h2>
			<p class="reading-paths__description">
				Choose a short route through the essays, healthcare systems work, science, Calcutta, or
				fiction.
			</p>
		</div>
		<a class="reading-paths__route-link" href={startHereHref}>
			Explore all five paths <span aria-hidden="true">→</span>
		</a>
	</div>

	<ol class="reading-paths__rail reading-paths__list">
		{#each paths as path, index (path.id)}
			<li data-path-id={path.id} data-path-order={index + 1}>
				<LivingCard
					href={`${startHereHref}#${path.id}`}
					variant="path"
					data-reading-path-card
					data-path-id={path.id}
				>
					<span class="reading-path-card__number">
						{String(index + 1).padStart(2, '0')}
					</span>
					<span class="reading-path-card__trace" data-path-trace={path.id} aria-hidden="true">
						<span class="reading-path-card__trace-line"></span>
						<span class="reading-path-card__trace-node"></span>
						<span class="reading-path-card__trace-node"></span>
						<span class="reading-path-card__trace-node"></span>
					</span>
					<span class="reading-path-card__eyebrow">{path.eyebrow}</span>
					<h3>{path.label}</h3>
					<span class="reading-path-card__description">{path.description}</span>
					<span class="reading-path-card__arrow">
						Follow path <span aria-hidden="true">→</span>
					</span>
				</LivingCard>
			</li>
		{/each}
	</ol>
</section>
