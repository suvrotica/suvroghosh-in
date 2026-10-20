<script lang="ts">
	import { resolve } from '$app/paths';

	type RecentPost = Readonly<{
		slug: string;
		title: string;
		description?: string;
		date: string;
		categorySlug: string;
		categoryLabel: string;
		sectionLabel: string;
		readingTime?: string;
		interactiveFirst: boolean;
		thumbnail?: string;
		thumbnailAlt?: string;
		imageWidth?: number;
		imageHeight?: number;
	}>;

	let { posts }: { posts: readonly RecentPost[] } = $props();

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(value));
	}
</script>

<section class="fb-recent" aria-labelledby="recent-writing-heading" data-recent-signal-grid>
	<div class="fb-recent__heading">
		<div>
			<p class="fb-recent__eyebrow">From the desk</p>
			<h2 id="recent-writing-heading">Recent writing<span aria-hidden="true">.</span></h2>
		</div>
		<a class="fb-recent__archive" href={resolve('/blog')}>
			All writing <span aria-hidden="true">↗</span>
		</a>
	</div>

	<ol class="fb-recent__grid">
		{#each posts as post, index (post.slug)}
			<li
				class="fb-recent__item"
				class:fb-recent__item--lead={index === 0}
				data-signal-position={index === 0 ? 'lead' : 'supporting'}
			>
				<a
					class="fb-recent__article"
					href={resolve('/blog/[category]/[slug]', {
						category: post.categorySlug,
						slug: post.slug
					})}
					data-recent-signal-card={post.slug}
					data-card-emphasis={index === 0 ? 'lead' : 'supporting'}
					data-content-section={post.sectionLabel}
				>
					{#if post.thumbnail}
						<figure
							class="fb-recent__media"
							data-media-orientation={(post.imageHeight ?? 0) > (post.imageWidth ?? 0)
								? 'portrait'
								: 'landscape'}
						>
							<img
								src={post.thumbnail}
								alt={post.thumbnailAlt ?? ''}
								width={post.imageWidth}
								height={post.imageHeight}
								loading="lazy"
								decoding="async"
							/>
						</figure>
					{:else}
						<div class="fb-recent__media fb-recent__placeholder" aria-hidden="true">
							<span>{String(index + 1).padStart(2, '0')}</span><span>{post.categoryLabel}</span>
						</div>
					{/if}
					<div class="fb-recent__body">
						<p class="fb-recent__meta">
							<span>{post.categoryLabel}</span><span aria-hidden="true">/</span>
							<time datetime={post.date}>{formatDate(post.date)}</time>
						</p>
						<h3>{post.title}</h3>
						{#if post.description}<p class="fb-recent__description">{post.description}</p>{/if}
						<p class="fb-recent__footnote">
							<span
								>{post.interactiveFirst ? 'Interactive essay' : (post.readingTime ?? 'Essay')}</span
							>
							{#if post.interactiveFirst && post.readingTime}
								<span>{post.readingTime}</span>
							{/if}
							<span class="fb-recent__action"
								>{post.interactiveFirst ? 'Explore' : 'Read'}
								<span aria-hidden="true">↗</span></span
							>
						</p>
					</div>
				</a>
			</li>
		{/each}
	</ol>
</section>

<style>
	.fb-recent {
		color: var(--fb-ink);
		padding-block: clamp(3rem, 6vw, 6rem);
		border-top: 1px solid var(--fb-rule);
	}
	.fb-recent__heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}
	.fb-recent__eyebrow,
	.fb-recent__meta,
	.fb-recent__footnote {
		font-family: var(--fb-mono);
		font-size: 0.65rem;
		font-weight: 400;
		line-height: 1.65;
	}
	.fb-recent__eyebrow {
		margin: 0 0 0.75rem;
		color: var(--fb-muted);
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.fb-recent h2 {
		margin: 0;
		font-family: var(--fb-serif);
		font-size: clamp(2.4rem, 4vw, 4rem);
		font-weight: 400;
		line-height: 1;
		letter-spacing: -0.045em;
	}
	.fb-recent h2 > span {
		color: var(--fb-accent);
	}
	.fb-recent__archive {
		display: inline-flex;
		align-items: center;
		gap: 1.2rem;
		flex-shrink: 0;
		padding-bottom: 0.35rem;
		border-bottom: 1px solid var(--fb-ink);
		color: var(--fb-ink);
		font-family: var(--fb-sans);
		font-size: 0.8rem;
		text-decoration: none;
	}
	.fb-recent__grid {
		display: grid;
		grid-template-columns: minmax(0, 1.03fr) minmax(0, 1fr);
		column-gap: clamp(2rem, 5vw, 5rem);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.fb-recent__item {
		min-width: 0;
		padding-block: 1.25rem;
		border-top: 1px solid var(--fb-rule);
	}
	.fb-recent__item:nth-child(2) {
		padding-top: 0;
		border-top: 0;
	}
	.fb-recent__item:last-child {
		padding-bottom: 0;
	}
	.fb-recent__item--lead {
		grid-row: span 3;
		padding: 0;
		border-top: 0;
	}
	.fb-recent__article {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 7rem;
		align-items: start;
		column-gap: 1.25rem;
		color: inherit;
		text-decoration: none;
	}
	.fb-recent__media {
		grid-column: 2;
		grid-row: 1;
		margin: 0;
		overflow: hidden;
		background: var(--fb-surface);
		aspect-ratio: 1;
	}
	.fb-recent__media img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		transition: opacity 180ms ease;
	}
	.fb-recent__body {
		grid-column: 1;
		grid-row: 1;
		min-width: 0;
	}
	.fb-recent__meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.55rem;
		margin: 0 0 0.55rem;
		color: var(--fb-muted);
	}
	.fb-recent__meta > span:first-child {
		color: var(--fb-teal);
	}
	.fb-recent h3 {
		margin: 0;
		font-family: var(--fb-serif);
		font-size: clamp(1.35rem, 1.8vw, 1.75rem);
		font-weight: 450;
		line-height: 1.14;
		letter-spacing: -0.025em;
		text-wrap: pretty;
	}
	.fb-recent__description {
		margin: 0.7rem 0 0;
		color: var(--fb-muted);
		font-family: var(--fb-sans);
		font-size: 0.81rem;
		line-height: 1.65;
	}
	.fb-recent__item:not(.fb-recent__item--lead) .fb-recent__description {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
	.fb-recent__footnote {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin: 0.85rem 0 0;
		color: var(--fb-muted);
	}
	.fb-recent__action {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--fb-ink);
	}
	.fb-recent__placeholder {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 1rem;
		color: var(--fb-teal);
		font-family: var(--fb-mono);
		font-size: 0.6rem;
	}
	.fb-recent__placeholder > span:first-child {
		font-family: var(--fb-serif);
		font-size: 2.5rem;
	}
	.fb-recent__item--lead .fb-recent__article {
		display: block;
	}
	.fb-recent__item--lead .fb-recent__media {
		margin-bottom: 1.4rem;
		aspect-ratio: auto;
	}
	.fb-recent__item--lead .fb-recent__media img {
		height: auto;
		max-height: 25rem;
	}
	.fb-recent__item--lead .fb-recent__placeholder {
		min-height: 18rem;
	}
	.fb-recent__item--lead h3 {
		font-size: clamp(1.85rem, 2.75vw, 2.75rem);
		line-height: 1.08;
	}
	.fb-recent__item--lead .fb-recent__description {
		max-width: 54ch;
		font-size: 0.9rem;
	}
	.fb-recent__article:hover h3,
	.fb-recent__archive:hover {
		color: var(--fb-teal);
	}
	.fb-recent__article:hover img {
		opacity: 0.88;
	}
	.fb-recent a:focus-visible {
		outline: 2px solid var(--fb-teal);
		outline-offset: 6px;
	}
	@media (max-width: 850px) {
		.fb-recent__grid {
			column-gap: 2rem;
		}
		.fb-recent__article {
			grid-template-columns: minmax(0, 1fr) 5rem;
			column-gap: 0.9rem;
		}
	}
	@media (max-width: 660px) {
		.fb-recent__heading {
			gap: 1rem;
			margin-bottom: 1.6rem;
		}
		.fb-recent__archive {
			gap: 0.65rem;
			font-size: 0.7rem;
		}
		.fb-recent__grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.fb-recent__item--lead {
			grid-row: auto;
			padding-bottom: 1.8rem;
		}
		.fb-recent__item:nth-child(2) {
			padding-top: 1.25rem;
			border-top: 1px solid var(--fb-rule);
		}
		.fb-recent__article {
			grid-template-columns: minmax(0, 1fr) clamp(4.75rem, 22vw, 7rem);
		}
		.fb-recent__item--lead .fb-recent__media {
			margin-bottom: 1.15rem;
		}
		.fb-recent__meta {
			font-size: 0.6rem;
		}
		.fb-recent__description {
			font-size: 0.79rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fb-recent__media img {
			transition: none;
		}
	}
</style>
