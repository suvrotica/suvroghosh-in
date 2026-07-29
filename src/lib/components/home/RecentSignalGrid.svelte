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
>
	<div class="recent-signals__heading">
		<div>
			<p class="recent-signals__eyebrow">Recently published</p>
			<h2 id="recent-writing-heading">Latest from the library</h2>
		</div>
		<a class="recent-signals__route-link" href={resolve('/blog')}>
			Browse all writing <span aria-hidden="true">→</span>
		</a>
	</div>

	<ol class="recent-signals__grid">
		{#each posts as post (post.slug)}
			<li>
				<LivingCard
					href={resolve('/blog/[category]/[slug]', {
						category: post.categorySlug,
						slug: post.slug
					})}
					variant="signal"
					data-recent-signal-card={post.slug}
				>
					<SignalGlyph slug={post.slug} category={post.categorySlug} />
					<span class="recent-signal-card__meta">
						<span>{post.sectionLabel}</span>
						<span aria-hidden="true">·</span>
						<time datetime={post.date}>{formatDate(post.date)}</time>
					</span>
					<h3>{post.title}</h3>
					{#if post.description}
						<span class="recent-signal-card__description">{post.description}</span>
					{/if}
				</LivingCard>
			</li>
		{/each}
	</ol>
</section>
