<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { collectionPageSchema, siteUrl } from '$lib/components/seo/SEO';
	import { MIN_TOPIC_CATEGORIES, MIN_TOPIC_POSTS } from '$lib/content/topics';

	let { data }: { data: PageData } = $props();

	const title = 'Recurring Topics | SuvroGhosh.In';
	const description =
		'Recurring subjects across the writing of Suvro Ghosh, selected by transparent publication frequency and category breadth.';
	const canonicalUrl = `${siteUrl}/blog/topics`;
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	keywords={['Topics', 'Essays', 'Writing archive', 'Suvro Ghosh']}
	schema={collectionPageSchema({
		name: 'Recurring Topics',
		description,
		url: canonicalUrl,
		about: 'Recurring subjects in the writing of Suvro Ghosh'
	})}
/>

<section class="page-enter mx-auto max-w-4xl py-4 md:py-8">
	<nav aria-label="Breadcrumb" class="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
		<ol class="flex flex-wrap items-center gap-2">
			<li>
				<a
					href={resolve('/blog')}
					class="inline-flex min-h-11 items-center font-semibold underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:hover:text-white dark:focus-visible:outline-neutral-300"
					>All posts</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li aria-current="page" class="font-medium text-neutral-800 dark:text-neutral-200">Topics</li>
		</ol>
	</nav>

	<header class="mb-10 border-b border-neutral-300 pb-7 dark:border-neutral-700">
		<p
			class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Thematic index
		</p>
		<h1 class="mb-3 text-4xl font-bold text-neutral-950 md:text-5xl dark:text-neutral-50">
			Recurring topics
		</h1>
		<p class="mb-3 max-w-2xl text-left text-base text-neutral-600 dark:text-neutral-400">
			A compact map of subjects that recur across the library. Select a topic to browse its articles
			in reverse chronological order.
		</p>
		<p class="mb-0 max-w-2xl text-left text-sm text-neutral-500 dark:text-neutral-500">
			A topic usually appears here after occurring in at least {MIN_TOPIC_POSTS} published articles across
			at least {MIN_TOPIC_CATEGORIES} categories. Media collections such as Music are assembled automatically
			from the post body. Rarer tags remain available through archive search.
		</p>
	</header>

	<p class="mb-5 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
		{data.topics.length} established {data.topics.length === 1 ? 'topic' : 'topics'}
	</p>
	<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.topics as topic (topic.slug)}
			<li>
				<a
					href={resolve('/blog/topics/[topic]', { topic: topic.slug })}
					class="group flex h-full min-h-28 flex-col rounded-lg border border-neutral-300 bg-white p-4 no-underline shadow-sm transition-colors hover:border-neutral-500 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-300"
				>
					<span class="text-lg font-bold text-neutral-950 dark:text-neutral-50">{topic.label}</span>
					<span class="mt-auto pt-3 text-sm text-neutral-500 dark:text-neutral-400">
						{topic.count}
						{topic.count === 1 ? 'article' : 'articles'} · {topic.categoryCount}
						{topic.categoryCount === 1 ? 'category' : 'categories'}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</section>
