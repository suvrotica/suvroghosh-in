<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import { BLOG_PAGE_SIZE } from '$lib/content/pagination';
	import { topicPath } from '$lib/content/topics';
	import ArchivePagination from '$lib/components/blog/ArchivePagination.svelte';
	import PostGallery from '$lib/components/blog/PostGallery.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { collectionPageSchema, siteUrl } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';

	let { data }: { data: PageData } = $props();

	let archivePath = $derived(topicPath(data.topic.slug));
	let canonicalUrl = $derived(
		data.page > 1 ? `${siteUrl}${archivePath}?page=${data.page}` : `${siteUrl}${archivePath}`
	);
	let pageTitle = $derived(
		`${data.topic.label}${data.page > 1 ? ` — Page ${data.page}` : ''} | SuvroGhosh.In`
	);
	let pageDescription = $derived(
		`Essays and articles by Suvro Ghosh about ${data.topic.label}${data.page > 1 ? ` — page ${data.page}` : ''}.`
	);
	let rangeStart = $derived((data.page - 1) * BLOG_PAGE_SIZE + 1);
	let rangeEnd = $derived(rangeStart + data.posts.length - 1);
</script>

<SEO
	title={pageTitle}
	description={pageDescription}
	{canonicalUrl}
	keywords={[data.topic.label, 'Suvro Ghosh', 'Essays', 'Writing']}
	schema={collectionPageSchema({
		name: `${data.topic.label}${data.page > 1 ? ` — Page ${data.page}` : ''}`,
		description: pageDescription,
		url: canonicalUrl,
		about: data.topic.label
	})}
/>

<section class="page-enter mx-auto max-w-4xl py-4 md:py-8">
	<nav aria-label="Breadcrumb" class="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
		<ol class="flex flex-wrap items-center gap-2">
			<li>
				<a
					href={resolve('/blog')}
					class="inline-flex min-h-11 items-center transition-colors hover:text-neutral-950 dark:hover:text-white"
					>All posts</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li>
				<a
					href={resolve('/blog/topics')}
					class="inline-flex min-h-11 items-center transition-colors hover:text-neutral-950 dark:hover:text-white"
					>Topics</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li aria-current="page" class="font-medium text-neutral-800 dark:text-neutral-200">
				{data.topic.label}
			</li>
		</ol>
	</nav>

	<header class="mb-10 border-b border-neutral-300 pb-7 dark:border-neutral-700">
		<p
			class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Recurring topic
		</p>
		<h1 class="mb-3 text-4xl font-bold text-neutral-950 md:text-5xl dark:text-neutral-50">
			{data.topic.label}
		</h1>
		<p class="mb-0 max-w-2xl text-left text-base text-neutral-600 dark:text-neutral-400">
			{data.totalResults}
			{data.totalResults === 1 ? 'article' : 'articles'} across
			{data.topic.categoryCount}
			{data.topic.categoryCount === 1 ? 'category' : 'categories'}, newest first.
		</p>
	</header>

	<ScrollReveal>
		<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
			<h2 class="!m-0 !text-2xl !leading-tight text-neutral-950 dark:text-neutral-50">
				Writing about {data.topic.label}
			</h2>
			<p class="!m-0 !text-left !text-sm text-neutral-500 dark:text-neutral-400">
				Showing {rangeStart}–{rangeEnd} of {data.totalResults} · Page {data.page} of
				{data.totalPages}
			</p>
		</div>

		<PostGallery posts={data.posts} />
		<ArchivePagination
			currentPage={data.page}
			totalPages={data.totalPages}
			label={`${data.topic.label} topic pagination`}
			basePath={archivePath}
		/>
	</ScrollReveal>

	<nav
		aria-label="Other established topics"
		class="mt-10 border-t border-neutral-300 pt-6 dark:border-neutral-700"
	>
		<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
			<h2 class="m-0 text-lg font-bold text-neutral-950 dark:text-neutral-50">Other topics</h2>
			<a
				href={resolve('/blog/topics')}
				class="inline-flex min-h-11 items-center text-sm font-semibold text-neutral-600 underline decoration-neutral-400 underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
				>View the complete topic index</a
			>
		</div>
		<ul class="flex flex-wrap gap-2">
			{#each data.topics
				.filter((topic) => topic.slug !== data.topic.slug)
				.slice(0, 12) as topic (topic.slug)}
				<li>
					<a
						href={resolve('/blog/topics/[topic]', { topic: topic.slug })}
						class="inline-flex min-h-11 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700 no-underline transition-colors hover:border-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:outline-neutral-300"
					>
						{topic.label}
						<span class="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400"
							>({topic.count})</span
						>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</section>
