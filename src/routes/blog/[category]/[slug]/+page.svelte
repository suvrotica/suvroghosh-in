<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import WordCloud from '$lib/components/visual/WordCloud.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let PostContent = $derived(data.content);
	let relatedPosts = $derived(data.relatedPosts ?? []);
</script>

<SEO {...data.seo} />

<article class="page-enter mx-auto max-w-3xl px-4 py-12 md:px-8">
	<nav aria-label="Breadcrumb" class="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
		<ol class="flex flex-wrap items-center gap-2">
			<li><a href="/" class="transition-colors hover:text-neutral-400">Home</a></li>
			<li><span aria-hidden="true">/</span></li>
			<li><a href="/blog" class="transition-colors hover:text-neutral-400">Blog</a></li>
			<li><span aria-hidden="true">/</span></li>
			<li>
				<a
					href={`/blog/${data.metadata.categorySlug}`}
					class="transition-colors hover:text-neutral-400">{data.metadata.categoryLabel}</a
				>
			</li>
			<li><span aria-hidden="true">/</span></li>
			<li class="truncate font-medium text-neutral-900 dark:text-neutral-200" aria-current="page">
				{data.metadata.title}
			</li>
		</ol>
	</nav>

	<header class="mb-12 border-b border-neutral-200 pb-8 dark:border-neutral-800">
		<h1
			class="mb-6 text-3xl font-bold tracking-tight text-neutral-900 md:text-5xl md:leading-tight dark:text-white"
		>
			{data.metadata.title}
		</h1>
		<div
			class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400"
		>
			<span
				>By <a
					href="/resume"
					rel="author"
					class="font-medium transition-colors hover:text-neutral-400"
					>{data.metadata.author ?? 'Suvro Ghosh'}</a
				></span
			>
			{#if data.metadata.date}<span aria-hidden="true">&middot;</span><time
					datetime={data.metadata.date}
					>{new Date(data.metadata.date).toLocaleDateString('en-IN', {
						year: 'numeric',
						month: 'long',
						day: 'numeric'
					})}</time
				>{/if}
			{#if data.metadata.dateModified}<span aria-hidden="true">&middot;</span><span
					>Updated <time datetime={data.metadata.dateModified}
						>{new Date(data.metadata.dateModified).toLocaleDateString('en-IN')}</time
					></span
				>{/if}
			{#if data.metadata.readingTime}<span aria-hidden="true">&middot;</span><span
					>{data.metadata.readingTime} read</span
				>{/if}
		</div>
		{#if data.metadata.status === 'living'}<p
				class="mt-6 inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
			>
				This is a living essay and may be updated as facts change.
			</p>{/if}
	</header>

	<div
		class="prose max-w-none prose-neutral dark:prose-invert prose-headings:scroll-mt-20 prose-img:rounded-xl"
	>
		<PostContent />
	</div>

	{#if data.metadata.tags && data.metadata.tags.length > 0}
		<ScrollReveal>
			<footer class="mt-16">
				<Separator class="mb-8" />
				<h2
					class="mb-2 text-center text-xs font-semibold tracking-wider text-neutral-900 uppercase dark:text-white"
				>
					Topics Discussed
				</h2>
				<WordCloud tags={data.metadata.tags} />
			</footer>
		</ScrollReveal>
	{/if}

	{#if relatedPosts.length > 0}
		<ScrollReveal delay={100}>
			<section class="mt-16">
				<Separator class="mb-8" />
				<h2 class="mb-6 text-2xl font-bold text-neutral-900 dark:text-white">Read Next</h2>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{#each relatedPosts as post (post.slug)}
						<a
							href={`/blog/${post.category}/${post.slug}`}
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
						</a>
					{/each}
				</div>
			</section>
		</ScrollReveal>
	{/if}
</article>
