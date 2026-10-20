<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import { BLOG_PAGE_SIZE } from '$lib/content/pagination';
	import ArchivePagination from '$lib/components/blog/ArchivePagination.svelte';
	import PostGallery from '$lib/components/blog/PostGallery.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { collectionPageSchema, siteUrl, withSiteGraph } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import GamesLanding from '$lib/components/games/GamesLanding.svelte';

	let { data }: { data: PageData } = $props();

	let categoryPath = $derived(`/blog/${data.categorySlug}`);
	let isPoetry = $derived(data.categoryBreadcrumbs.some((category) => category.slug === 'poetry'));
	let canonicalUrl = $derived(
		data.page > 1 ? `${siteUrl}${categoryPath}?page=${data.page}` : `${siteUrl}${categoryPath}`
	);
	let pageTitle = $derived(
		data.categorySlug === 'games'
			? 'Games | SuvroGhosh.In'
			: `${data.categoryDisplay} Category${data.page > 1 ? ` — Page ${data.page}` : ''} | SuvroGhosh.In`
	);
	let pageDescription = $derived(
		data.categorySlug === 'games'
			? 'Original browser games by Suvro Ghosh: simulations, learning tools, procedural trouble, and strange little systems built for keyboard and touch.'
			: isPoetry
				? `${data.categoryDisplay} by Suvro Ghosh: personal verse about hope, worry, and everyday life.`
				: `Essays by Suvro Ghosh on ${data.categoryDisplay}, with a focus on systems, evidence, and technology.`
	);
	let rangeStart = $derived((data.page - 1) * BLOG_PAGE_SIZE + 1);
	let rangeEnd = $derived(rangeStart + data.posts.length - 1);
</script>

<SEO
	title={pageTitle}
	description={pageDescription}
	{canonicalUrl}
	keywords={data.categorySlug === 'games'
		? ['Games', 'Browser Games', 'Learning Games', 'Interactive Games', 'Suvro Ghosh']
		: [data.categoryDisplay, 'Suvro Ghosh', isPoetry ? 'Poetry' : 'Essays', 'Blog']}
	schema={withSiteGraph([
		collectionPageSchema({
			name:
				data.categorySlug === 'games'
					? 'Games — Original Browser Games and Learning Tools'
					: isPoetry
						? `${data.categoryDisplay} archive`
						: `${data.categoryDisplay} Category Essays`,
			description: pageDescription,
			url: canonicalUrl,
			about:
				data.categorySlug === 'games'
					? 'Original browser games and learning tools'
					: data.categoryDisplay
		})
	])}
/>

{#if data.categorySlug === 'games'}
	<GamesLanding />
{:else}
	<section class="category-layout page-enter">
		<header class="category-header" data-route-scene="writing">
			<a
				href={resolve('/blog')}
				class="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-neutral-600 underline decoration-neutral-400 underline-offset-4 hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-400 dark:hover:text-white dark:focus-visible:outline-neutral-300"
			>
				<span aria-hidden="true">←</span>&nbsp;All posts
			</a>
			{#if data.categoryBreadcrumbs.length > 1}
				<nav aria-label="Parent categories" class="mb-4 flex flex-wrap gap-3 text-sm">
					{#each data.categoryBreadcrumbs.slice(0, -1) as category (category.slug)}
						<a
							href={resolve('/blog/[category]', { category: category.slug })}
							class="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
							>← {category.label}</a
						>
					{/each}
				</nav>
			{/if}
			<p
				class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				Category archive
			</p>
			<h1 class="archive-title">{data.categoryDisplay}</h1>
			<p>
				Browse {data.totalResults}
				{data.totalResults === 1 ? 'post' : 'posts'} in this category, newest first.
			</p>
			{#if data.subcategories.length}
				<nav aria-label="Subcategories" class="mt-4 flex flex-wrap gap-3">
					{#each data.subcategories as category (category.slug)}
						<a
							href={resolve('/blog/[category]', { category: category.slug })}
							class="inline-flex min-h-11 items-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold hover:underline dark:border-neutral-700"
							>{category.label} <span>({category.count})</span></a
						>
					{/each}
				</nav>
			{/if}
		</header>

		<ScrollReveal>
			<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
				<h2 class="!m-0 !text-2xl !leading-tight text-neutral-950 dark:text-neutral-50">
					Latest in {data.categoryDisplay}
				</h2>
				<p class="!m-0 !text-sm text-neutral-500 dark:text-neutral-400">
					Showing {rangeStart}–{rangeEnd} of {data.totalResults} · Page {data.page} of
					{data.totalPages}
				</p>
			</div>
			<PostGallery posts={data.posts} />
			<ArchivePagination
				currentPage={data.page}
				totalPages={data.totalPages}
				label={`${data.categoryDisplay} pagination`}
				basePath={categoryPath}
			/>
		</ScrollReveal>
	</section>
{/if}
