<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import { BLOG_PAGE_SIZE } from '$lib/content/pagination';
	import ArchivePagination from '$lib/components/blog/ArchivePagination.svelte';
	import PostGallery from '$lib/components/blog/PostGallery.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { collectionPageSchema, siteUrl } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';

	let { data }: { data: PageData } = $props();

	let categoryPath = $derived(`/blog/${data.categorySlug}`);
	let canonicalUrl = $derived(
		data.page > 1 ? `${siteUrl}${categoryPath}?page=${data.page}` : `${siteUrl}${categoryPath}`
	);
	let pageTitle = $derived(
		`${data.categoryDisplay}${data.page > 1 ? ` — Page ${data.page}` : ''} | SuvroGhosh.In`
	);
	let rangeStart = $derived((data.page - 1) * BLOG_PAGE_SIZE + 1);
	let rangeEnd = $derived(rangeStart + data.posts.length - 1);
</script>

<SEO
	title={pageTitle}
	description={`Essays by Suvro Ghosh on ${data.categoryDisplay}, with a focus on systems, evidence, and technology.`}
	{canonicalUrl}
	keywords={[data.categoryDisplay, 'Suvro Ghosh', 'Essays', 'Blog']}
	schema={collectionPageSchema({
		name: `${data.categoryDisplay} Essays`,
		description: `Essays by Suvro Ghosh on ${data.categoryDisplay}, with a focus on systems, evidence, and technology.`,
		url: `${siteUrl}/blog/${data.categorySlug}`,
		about: data.categoryDisplay
	})}
/>

<section class="category-layout page-enter">
	<header class="category-header">
		<a
			href={resolve('/blog')}
			class="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-neutral-600 underline decoration-neutral-400 underline-offset-4 hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-400 dark:hover:text-white dark:focus-visible:outline-neutral-300"
		>
			<span aria-hidden="true">←</span>&nbsp;All posts
		</a>
		<h1>{data.categoryDisplay}</h1>
		<p>
			Browse {data.totalResults}
			{data.totalResults === 1 ? 'post' : 'posts'} in this category, newest first.
		</p>
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
