<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { slugifyCategory } from '$lib/content/categories';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const title = 'Writing & Essays | Suvro Ghosh';
	const description =
		'Essays, satire, fiction, sketches, and reflections on technology, illness, corruption, society, and ordinary life in Calcutta. The literary side of Suvro Ghosh.';
	const canonicalUrl = siteUrl + '/writing';
</script>

<SEO {title} {description} {canonicalUrl} />

<section class="page-enter mx-auto max-w-4xl py-8 md:py-12">
	<header class="mb-10">
		<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-5xl dark:text-neutral-100">
			Writing &amp; Essays
		</h1>
		<p class="text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
			This is the literary side of the site: essays, satire, fiction, sketches, and reflections on
			technology, illness, corruption, society, and ordinary life in Calcutta. The writing is
			personal, analytical, sometimes comic, sometimes dark, and intentionally human.
		</p>
	</header>

	<ScrollReveal>
		<div class="mb-12">
			<div
				class="mb-6 flex items-end justify-between border-b border-neutral-300 pb-2 dark:border-neutral-700"
			>
				<h2 class="m-0 text-2xl font-bold text-neutral-900 dark:text-neutral-100">Recent Posts</h2>
				<a
					href={resolve('/blog')}
					class="mb-1 text-xs font-bold tracking-wider text-neutral-500 uppercase transition-colors hover:text-neutral-400"
				>
					View All &rarr;
				</a>
			</div>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{#each data.recentPosts as post (post.slug)}
					{@const href = resolve('/blog/[category]/[slug]', {
						category: slugifyCategory(post.category || 'uncategorized'),
						slug: post.slug
					})}
					<a
						{href}
						class="post-card group block rounded-lg border border-neutral-200 bg-white p-4 no-underline shadow-sm dark:border-neutral-800 dark:bg-neutral-800/50"
					>
						<div class="mb-1 text-xs font-medium tracking-wider text-neutral-400 uppercase">
							{post.category}
						</div>
						<div
							class="font-semibold text-neutral-900 transition-colors group-hover:text-neutral-400 dark:text-neutral-100"
						>
							{post.title}
						</div>
						{#if post.description}
							<p class="mt-1 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
								{post.description}
							</p>
						{/if}
					</a>
				{/each}
			</div>
		</div>
	</ScrollReveal>

	<ScrollReveal>
		<div>
			<h2
				class="mb-6 border-b border-neutral-300 pb-2 text-2xl font-bold text-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
			>
				Browse by Category
			</h2>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.categories as cat (cat.slug)}
					<a
						href={resolve('/blog/[category]', { category: cat.slug })}
						class="card group block no-underline"
					>
						<h3 class="m-0 mb-2 text-lg font-bold text-neutral-900 dark:text-neutral-100">
							{cat.label}
						</h3>
						<Badge variant="secondary" class="mb-3"
							>{cat.count} {cat.count === 1 ? 'post' : 'posts'}</Badge
						>
						<ul class="space-y-1">
							{#each cat.posts as post (post.slug)}
								<li class="text-sm text-neutral-600 dark:text-neutral-400">{post.title}</li>
							{/each}
						</ul>
					</a>
				{/each}
			</div>
		</div>
	</ScrollReveal>
</section>
