<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import ArticleActions from '$lib/components/blog/ArticleActions.svelte';
	import AuthorPanel from '$lib/components/blog/AuthorPanel.svelte';
	import PostNavigation from '$lib/components/blog/PostNavigation.svelte';
	import TableOfContents from '$lib/components/blog/TableOfContents.svelte';
	import WordCloud from '$lib/components/visual/WordCloud.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let PostContent = $derived(data.content);
	let authorName = $derived(data.metadata.author?.trim() || 'Suvro Ghosh');
	let isSiteAuthor = $derived(authorName.toLocaleLowerCase('en') === 'suvro ghosh');
	let headings = $derived(data.metadata.headings ?? []);
	let postNavigation = $derived(data.postNavigation);
	let postTopics = $derived(data.postTopics ?? []);
	let relatedPosts = $derived(data.relatedPosts ?? []);
</script>

<SEO {...data.seo} />

<div
	class="article-shell page-enter mx-auto max-w-6xl px-4 py-12 md:px-8 xl:grid xl:w-[72rem] xl:max-w-none xl:grid-cols-[minmax(0,48rem)_16rem] xl:items-start xl:gap-12"
>
	<article class="article-print mx-auto max-w-3xl min-w-0 xl:mx-0">
		<nav
			aria-label="Breadcrumb"
			class="mb-8 text-sm text-neutral-500 dark:text-neutral-400 print:hidden"
		>
			<ol class="flex min-w-0 flex-wrap items-center gap-2">
				<li>
					<a
						href={resolve('/')}
						class="transition-colors hover:text-neutral-950 dark:hover:text-neutral-100">Home</a
					>
				</li>
				<li><span aria-hidden="true">/</span></li>
				<li>
					<a
						href={resolve('/blog')}
						class="transition-colors hover:text-neutral-950 dark:hover:text-neutral-100">Blog</a
					>
				</li>
				<li><span aria-hidden="true">/</span></li>
				<li>
					<a
						href={resolve('/blog/[category]', { category: data.metadata.categorySlug })}
						class="transition-colors hover:text-neutral-950 dark:hover:text-neutral-100"
						>{data.metadata.categoryLabel}</a
					>
				</li>
				<li class="hidden sm:block"><span aria-hidden="true">/</span></li>
				<li
					class="hidden min-w-0 flex-1 truncate font-medium text-neutral-900 sm:block dark:text-neutral-200"
					aria-current="page"
					title={data.metadata.title}
				>
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
						href={resolve('/resume')}
						rel="author"
						class="font-medium transition-colors hover:text-neutral-950 dark:hover:text-neutral-100"
						>{authorName}</a
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
			{#if postTopics.length > 0}
				<nav aria-label="Post topics" class="mt-6 flex flex-wrap gap-2 print:hidden">
					{#each postTopics as topic (topic.href)}
						<a
							href={resolve(topic.href as '/blog')}
							class="inline-flex min-h-11 items-center rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
							title={topic.hasLandingPage ? `Browse the ${topic.label} topic` : undefined}
						>
							{topic.label}
						</a>
					{/each}
				</nav>
			{/if}

			<ArticleActions title={data.metadata.title} />
		</header>

		<div class="print:hidden">
			<TableOfContents {headings} variant="mobile" />
		</div>

		{#if data.metadata.inPlainEnglish || data.metadata.keyTerms?.length || data.metadata.faq?.length}
			<section
				aria-labelledby="answer-summary"
				class="mb-10 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/60"
			>
				<h2 id="answer-summary" class="mb-3 text-lg font-bold text-neutral-900 dark:text-white">
					Quick Answer
				</h2>
				{#if data.metadata.inPlainEnglish}
					<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
						{data.metadata.inPlainEnglish}
					</p>
				{/if}
				{#if data.metadata.keyTerms?.length}
					<div class="mt-4">
						<h3 class="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
							Key Terms
						</h3>
						<ul class="flex flex-wrap gap-2">
							{#each data.metadata.keyTerms as term (term)}
								<li
									class="rounded-md bg-white px-2.5 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
								>
									{term}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				{#if data.metadata.faq?.length}
					<div class="mt-4 space-y-3">
						{#each data.metadata.faq as item (item.question)}
							<div>
								<h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
									{item.question}
								</h3>
								<p class="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
									{item.answer}
								</p>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		<div
			class="article-prose mx-auto prose max-w-[var(--article-width)] font-serif prose-neutral dark:prose-invert prose-headings:scroll-mt-20 prose-headings:font-sans prose-code:font-mono prose-pre:font-mono prose-img:rounded-xl"
		>
			<PostContent />
		</div>

		{#if isSiteAuthor}
			<AuthorPanel />
		{/if}

		<div class="print:hidden">
			<ScrollReveal>
				<Separator class="mt-16" />
				<WordCloud slug={data.slug} title={data.metadata.title} />
			</ScrollReveal>
		</div>

		<div class="print:hidden">
			<PostNavigation newer={postNavigation.newer} older={postNavigation.older} />
		</div>

		{#if relatedPosts.length > 0}
			<ScrollReveal delay={100}>
				<section aria-labelledby="related-reading-heading" class="mt-12 print:hidden">
					<h2
						id="related-reading-heading"
						class="mb-2 text-2xl font-bold text-neutral-900 dark:text-white"
					>
						Related reading
					</h2>
					<p class="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
						Selected by shared topics and section, with closer publication dates breaking ties.
					</p>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{#each relatedPosts as post (post.slug)}
							<a
								href={resolve('/blog/[category]/[slug]', {
									category: post.categorySlug,
									slug: post.slug
								})}
								class="post-card group flex min-h-32 flex-col rounded-lg border border-neutral-200 bg-white p-4 no-underline shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/50 dark:focus-visible:outline-neutral-300"
							>
								<div class="mb-1 text-xs font-medium tracking-wider text-neutral-400 uppercase">
									{post.categoryLabel}
								</div>
								<div
									class="font-semibold text-neutral-900 transition-colors group-hover:text-neutral-600 dark:text-neutral-100 dark:group-hover:text-neutral-300"
								>
									{post.title}
								</div>
								<div
									class="mt-auto pt-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400"
								>
									{#if post.sharedTags.length > 0}
										Shared topics: {post.sharedTags.join(' · ')}
									{:else}
										More in {post.categoryLabel}
									{/if}
								</div>
							</a>
						{/each}
					</div>
				</section>
			</ScrollReveal>
		{/if}
	</article>

	{#if headings.length >= 2}
		<aside class="hidden xl:block xl:pt-20 print:hidden">
			<TableOfContents {headings} variant="desktop" />
		</aside>
	{/if}
</div>
