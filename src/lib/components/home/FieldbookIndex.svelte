<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ReadingPathSummary } from '$lib/content/reading-paths';
	import type { FeaturedSeries } from './FeaturedSeriesIndex.svelte';

	let {
		paths,
		series
	}: {
		paths: readonly ReadingPathSummary[];
		series: FeaturedSeries;
	} = $props();

	const startHereHref = resolve('/start-here');
</script>

<section
	class="fb-index"
	aria-labelledby="fieldbook-index-heading"
	data-fieldbook-index
	data-reading-path-rail
>
	<div class="fb-index__routes">
		<p class="fb-index__eyebrow">A reader’s index</p>
		<h2 id="fieldbook-index-heading">
			Five ways<br />into the work<span aria-hidden="true">.</span>
		</h2>
		<p class="fb-index__intro">
			A thread to follow, if you’re not sure where to begin. Each route brings a few related pieces
			together.
		</p>
		<ol class="fb-index__paths" data-reading-path-list>
			{#each paths as path, index (path.id)}
				<li data-path-id={path.id} data-path-order={index + 1}>
					<!-- startHereHref is already resolved above; append only the curated section fragment. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						class="fb-index__path"
						href={`${startHereHref}#${path.id}`}
						data-reading-path-card
						data-path-id={path.id}
					>
						<span class="fb-index__path-number" aria-hidden="true"
							>{String(index + 1).padStart(2, '0')}</span
						>
						<div>
							<span class="fb-index__path-topic">{path.eyebrow}</span>
							<h3>{path.label}</h3>
						</div>
						<span class="fb-index__path-arrow" aria-hidden="true">↗</span>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</li>
			{/each}
		</ol>
		<a class="fb-index__all-paths" href={startHereHref}
			>Explore all five paths <span aria-hidden="true">↗</span></a
		>
	</div>

	<aside
		class="fb-index__series"
		aria-labelledby="fieldbook-series-heading"
		data-featured-series={series.id}
	>
		<div class="fb-index__series-heading">
			<p class="fb-index__eyebrow">In the fieldbook</p>
			<span class="fb-index__series-count"
				>{String(series.parts.length).padStart(2, '0')}
				{series.parts.length === 1 ? 'published part' : 'published parts'}</span
			>
		</div>
		<p class="fb-index__series-topic">{series.eyebrow}</p>
		<h3 id="fieldbook-series-heading">{series.title}</h3>
		<p class="fb-index__series-description">{series.description}</p>
		<ol class="fb-index__parts" aria-label={`${series.title} installments`} data-series-list>
			{#each series.parts as part (part.slug)}
				<li data-series-part={part.part}>
					<a
						class="fb-index__series-part"
						href={resolve('/blog/[category]/[slug]', {
							category: part.categorySlug,
							slug: part.slug
						})}
					>
						<div class="fb-index__part-caption">
							<div>
								<p class="fb-index__part-number">
									Part {String(part.part).padStart(2, '0')}{#if part.chapter}<span
											aria-hidden="true"
										>
											/
										</span>{part.chapter}{/if}
								</p>
								<h4>{part.title}</h4>
								<p class="fb-index__part-meta">
									{part.interactiveFirst ? 'Interactive visual essay' : part.categoryLabel}
									{#if part.readingTime}<span aria-hidden="true"> · </span>{part.readingTime}{/if}
								</p>
							</div>
							<span class="fb-index__part-arrow" aria-hidden="true">↗</span>
						</div>
					</a>
				</li>
			{/each}
		</ol>
	</aside>
</section>

<style>
	.fb-index {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: clamp(3rem, 7vw, 7rem);
		padding-block: clamp(3rem, 6vw, 6rem);
		border-top: 1px solid var(--fb-rule);
		color: var(--fb-ink);
	}
	.fb-index__routes,
	.fb-index__series {
		min-width: 0;
	}
	.fb-index__eyebrow,
	.fb-index__path-number,
	.fb-index__path-topic,
	.fb-index__series-count,
	.fb-index__series-topic,
	.fb-index__part-number,
	.fb-index__part-meta {
		font-family: var(--fb-mono);
		font-size: 0.65rem;
		font-weight: 400;
		line-height: 1.65;
	}
	.fb-index__eyebrow {
		margin: 0 0 1rem;
		color: var(--fb-muted);
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.fb-index h2 {
		margin: 0;
		font-family: var(--fb-serif);
		font-size: clamp(2.5rem, 4.5vw, 4.25rem);
		font-weight: 400;
		line-height: 0.98;
		letter-spacing: -0.045em;
	}
	.fb-index h2 > span {
		color: var(--fb-accent);
	}
	.fb-index__intro {
		max-width: 43ch;
		margin: 1.3rem 0 1.7rem;
		color: var(--fb-muted);
		font-family: var(--fb-sans);
		font-size: 0.9rem;
		line-height: 1.75;
	}
	.fb-index__paths,
	.fb-index__parts {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.fb-index__path {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		padding-block: 0.9rem;
		border-top: 1px solid var(--fb-rule);
		color: inherit;
		text-decoration: none;
	}
	.fb-index__path-number {
		align-self: start;
		padding-top: 0.1rem;
		color: var(--fb-muted);
	}
	.fb-index__path-topic {
		display: block;
		margin-bottom: 0.2rem;
		color: var(--fb-muted);
	}
	.fb-index__path h3 {
		margin: 0;
		font-family: var(--fb-serif);
		font-size: clamp(1.18rem, 1.6vw, 1.5rem);
		font-weight: 450;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}
	.fb-index__path-arrow {
		font-family: var(--fb-sans);
		font-size: 1rem;
		color: var(--fb-teal);
	}
	.fb-index__all-paths {
		display: inline-flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.1rem;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid currentColor;
		color: var(--fb-ink);
		font-family: var(--fb-sans);
		font-size: 0.75rem;
		text-decoration: none;
	}
	.fb-index__series {
		align-self: start;
		padding: clamp(1.4rem, 3vw, 2.25rem);
		border: 1px solid var(--fb-rule);
		background: var(--fb-surface);
	}
	.fb-index__series-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid var(--fb-rule);
		margin-bottom: 1.25rem;
	}
	.fb-index__series-heading .fb-index__eyebrow {
		margin: 0;
	}
	.fb-index__series-count {
		flex-shrink: 0;
		color: var(--fb-muted);
		font-size: 0.6rem;
	}
	.fb-index__series-topic {
		margin: 0 0 0.65rem;
		color: var(--fb-teal);
	}
	.fb-index__series > h3 {
		max-width: 18ch;
		margin: 0;
		font-family: var(--fb-serif);
		font-size: clamp(1.85rem, 2.8vw, 2.5rem);
		font-weight: 400;
		line-height: 1.06;
		letter-spacing: -0.035em;
	}
	.fb-index__series-description {
		margin: 1rem 0 1.5rem;
		color: var(--fb-muted);
		font-family: var(--fb-sans);
		font-size: 0.83rem;
		line-height: 1.7;
	}
	.fb-index__series-part {
		display: block;
		color: inherit;
		text-decoration: none;
	}
	.fb-index__parts > li + li {
		margin-top: 1.1rem;
		padding-top: 1.1rem;
		border-top: 1px solid var(--fb-rule);
	}
	.fb-index__part-caption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}
	.fb-index__part-number {
		margin: 0 0 0.35rem;
		color: var(--fb-teal);
	}
	.fb-index__part-caption h4 {
		margin: 0;
		font-family: var(--fb-serif);
		font-size: 1.25rem;
		font-weight: 450;
		line-height: 1.2;
		letter-spacing: -0.02em;
		text-wrap: pretty;
	}
	.fb-index__part-meta {
		margin: 0.5rem 0 0;
		color: var(--fb-muted);
		font-size: 0.6rem;
	}
	.fb-index__part-arrow {
		display: grid;
		width: 2.5rem;
		height: 2.5rem;
		flex-shrink: 0;
		place-items: center;
		border: 1px solid var(--fb-rule);
		border-radius: 50%;
		font-family: var(--fb-sans);
		font-size: 1.1rem;
	}
	.fb-index a:hover h3,
	.fb-index a:hover h4,
	.fb-index__all-paths:hover {
		color: var(--fb-teal);
	}
	.fb-index a:focus-visible {
		outline: 2px solid var(--fb-teal);
		outline-offset: 5px;
	}
	@media (max-width: 850px) {
		.fb-index {
			gap: 2.5rem;
		}
		.fb-index__series-heading {
			flex-wrap: wrap;
			gap: 0.35rem;
		}
	}
	@media (max-width: 660px) {
		.fb-index {
			grid-template-columns: minmax(0, 1fr);
			gap: 2.5rem;
		}
		.fb-index__intro {
			font-size: 0.86rem;
		}
		.fb-index__path {
			padding-block: 0.85rem;
		}
		.fb-index__series {
			padding: 1.35rem;
		}
		.fb-index__series-heading {
			flex-wrap: nowrap;
		}
		.fb-index__series > h3 {
			font-size: 2rem;
		}
	}
</style>
