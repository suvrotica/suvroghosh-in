<script lang="ts">
	import { resolve } from '$app/paths';
	import LivingCard from './LivingCard.svelte';
	import SignalGlyph from './SignalGlyph.svelte';

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

<section
	class="home-breakout recent-signals"
	aria-labelledby="recent-writing-heading"
	data-recent-signal-grid
	data-scene-section
	data-scene-state="latest"
>
	<div class="recent-signals__heading">
		<div>
			<p class="recent-signals__index">Index 05 / Incoming signals</p>
			<p class="recent-signals__eyebrow">Recently published</p>
			<h2 id="recent-writing-heading">Latest from the library</h2>
		</div>
		<a class="recent-signals__route-link" href={resolve('/blog')}>
			Browse all writing <span aria-hidden="true">→</span>
		</a>
	</div>

	<ol class="recent-signals__grid">
		{#each posts as post, index (post.slug)}
			<li
				class:recent-signals__lead={index === 0}
				class:recent-signals__supporting={index > 0}
				data-signal-position={index === 0 ? 'lead' : 'supporting'}
			>
				<LivingCard
					href={resolve('/blog/[category]/[slug]', {
						category: post.categorySlug,
						slug: post.slug
					})}
					variant="signal"
					class={index === 0 ? 'recent-signal-card recent-signal-card--lead' : 'recent-signal-card'}
					data-recent-signal-card={post.slug}
					data-card-emphasis={index === 0 ? 'lead' : 'supporting'}
					data-content-section={post.sectionLabel}
				>
					{#if post.thumbnail && post.imageWidth && post.imageHeight}
						<figure
							class="recent-signal-card__media"
							data-media-orientation={post.imageHeight > post.imageWidth ? 'portrait' : 'landscape'}
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
						<span
							class="recent-signal-card__fallback"
							data-signal-fallback={`${post.categorySlug}:${post.slug}`}
							aria-hidden="true"
						>
							<SignalGlyph slug={post.slug} category={post.categorySlug} />
							<span class="recent-signal-card__initial">{post.title.slice(0, 1)}</span>
						</span>
					{/if}
					<div class="recent-signal-card__body">
						<span class="recent-signal-card__meta">
							<span>{post.categoryLabel}</span>
							<span aria-hidden="true">·</span>
							<time datetime={post.date}>{formatDate(post.date)}</time>
						</span>
						{#if post.interactiveFirst || post.readingTime}
							<span class="recent-signal-card__badges">
								{#if post.interactiveFirst}<span>Interactive</span>{/if}
								{#if post.readingTime}<span>{post.readingTime}</span>{/if}
							</span>
						{/if}
						<h3>{post.title}</h3>
						{#if post.description}
							<span class="recent-signal-card__description">{post.description}</span>
						{/if}
						<span class="recent-signal-card__action">
							{post.interactiveFirst ? 'Open signal' : 'Read'} <span aria-hidden="true">→</span>
						</span>
					</div>
				</LivingCard>
			</li>
		{/each}
	</ol>
</section>
