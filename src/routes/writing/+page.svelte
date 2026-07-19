<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import { Badge } from '$lib/components/ui/badge';
	import { substackLinks } from '$lib/config/links';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const title = 'Writing & Essays | Suvro Ghosh';
	const description =
		'Long-form writing by Suvro Ghosh across essays, fiction, healthcare systems, science, technology, society, and ordinary life in Calcutta.';
	const canonicalUrl = siteUrl + '/writing';

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(value));
	}
</script>

<SEO {title} {description} {canonicalUrl} />

<section class="page-enter mx-auto max-w-4xl py-8 md:py-12">
	<header class="mb-10">
		<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-5xl dark:text-neutral-100">
			Writing &amp; Essays
		</h1>
		<p class="text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
			A reading room for essays, fiction, healthcare systems, science, technology, society, and
			ordinary life in Calcutta. The work is personal and analytical, sometimes comic, sometimes
			dark, and intentionally human.
		</p>
	</header>

	<aside
		aria-labelledby="newsletter-heading"
		class="mb-12 flex flex-col gap-5 rounded-lg border border-neutral-300 bg-neutral-100 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-700 dark:bg-neutral-900/70"
	>
		<div>
			<p
				class="mb-1 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				SuvroGhosh.IN — Writing &amp; Systems
			</p>
			<h2 id="newsletter-heading" class="mb-1 text-xl font-bold text-neutral-950 dark:text-white">
				Selected essays, sent occasionally
			</h2>
			<p class="mb-0 max-w-2xl text-left text-sm text-neutral-600 dark:text-neutral-400">
				Subscribe on Substack for a curated selection from this library—healthcare systems, applied
				AI, science, technology, society, and life in Calcutta.
			</p>
		</div>
		<a
			href={substackLinks.subscribe}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-300 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
		>
			Subscribe on Substack <span class="ml-2" aria-hidden="true">↗</span>
			<span class="sr-only">, opens in a new tab</span>
		</a>
	</aside>

	<section class="mb-12" aria-labelledby="recent-writing-heading">
		<div
			class="mb-6 flex flex-col gap-3 border-b border-neutral-300 pb-3 sm:flex-row sm:items-end sm:justify-between dark:border-neutral-700"
		>
			<h2
				id="recent-writing-heading"
				class="m-0 text-2xl font-bold text-neutral-900 dark:text-neutral-100"
			>
				Recent writing
			</h2>
			<a
				href={resolve('/blog')}
				class="w-fit text-xs font-bold tracking-wider text-neutral-500 uppercase transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
			>
				Search the complete archive &rarr;
			</a>
		</div>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#each data.recentPosts as post (post.slug)}
				<a
					href={resolve('/blog/[category]/[slug]', {
						category: post.categorySlug,
						slug: post.slug
					})}
					class="post-card group block rounded-lg border border-neutral-200 bg-white p-4 no-underline shadow-sm dark:border-neutral-800 dark:bg-neutral-800/50"
				>
					<div
						class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-wide text-neutral-500 dark:text-neutral-400"
					>
						<span class="font-semibold uppercase">{post.categoryLabel}</span>
						<span aria-hidden="true">·</span>
						<time datetime={post.date}>{formatDate(post.date)}</time>
					</div>
					<div
						class="font-semibold text-neutral-900 transition-colors group-hover:text-neutral-600 dark:text-neutral-100 dark:group-hover:text-neutral-300"
					>
						{post.title}
					</div>
					{#if post.description}
						<p
							class="mt-2 mb-0 line-clamp-2 text-left text-sm text-neutral-600 dark:text-neutral-400"
						>
							{post.description}
						</p>
					{/if}
				</a>
			{/each}
		</div>
	</section>

	<section aria-labelledby="major-categories-heading">
		<div class="mb-6 border-b border-neutral-300 pb-4 dark:border-neutral-700">
			<h2
				id="major-categories-heading"
				class="m-0 text-2xl font-bold text-neutral-900 dark:text-neutral-100"
			>
				Major shelves
			</h2>
			<p class="mt-2 mb-0 text-left text-sm text-neutral-600 dark:text-neutral-400">
				Eleven of the largest published catalogues, plus the interactive Visualizations laboratory.
				The complete archive currently contains {data.categoryCount} categories.
			</p>
		</div>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.majorCategories as cat (cat.slug)}
				<a
					href={resolve('/blog/[category]', { category: cat.slug })}
					aria-label={`Browse ${cat.label}: ${cat.count} ${cat.count === 1 ? 'post' : 'posts'}`}
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
		<a
			href={resolve('/blog')}
			class="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-neutral-700 underline decoration-neutral-400 underline-offset-4 hover:text-neutral-500 dark:text-neutral-300 dark:hover:text-neutral-100"
		>
			Browse and search every category <span class="ml-1" aria-hidden="true">→</span>
		</a>
	</section>
</section>
