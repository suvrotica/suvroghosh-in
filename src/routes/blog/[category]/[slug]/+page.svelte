<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import type { PageData } from './$types';

	// Svelte 5 Runes for incoming data
	let { data }: { data: PageData } = $props();

	// Alias the component so Svelte recognizes it as a valid tag
	let PostContent = $derived(data.content);
</script>

<SEO {...data.seo} />

<article class="mx-auto max-w-3xl px-4 py-12 md:px-8">
	<nav aria-label="Breadcrumb" class="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
		<ol class="flex flex-wrap items-center gap-2">
			<li>
				<a href="/" class="transition-colors hover:text-neutral-900 dark:hover:text-white">Home</a>
			</li>
			<li><span aria-hidden="true">/</span></li>
			<li>
				<a href="/blog" class="transition-colors hover:text-neutral-900 dark:hover:text-white">Blog</a>
			</li>
			<li><span aria-hidden="true">/</span></li>
			<li>
				<a 
					href={`/blog/${data.metadata.categorySlug}`} 
					class="transition-colors hover:text-neutral-900 dark:hover:text-white"
				>
					{data.metadata.categoryLabel}
				</a>
			</li>
			<li><span aria-hidden="true">/</span></li>
			<li class="truncate font-medium text-neutral-900 dark:text-neutral-200" aria-current="page">
				{data.metadata.title}
			</li>
		</ol>
	</nav>

	<header class="mb-12 border-b border-neutral-200 pb-8 dark:border-neutral-800">
		<h1 class="mb-6 text-3xl font-bold tracking-tight text-neutral-900 md:text-5xl md:leading-tight dark:text-white">
			{data.metadata.title}
		</h1>

		<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
			<span>By <a href="/resume" rel="author" class="font-medium hover:text-neutral-900 dark:hover:text-white">{data.metadata.author ?? 'Suvro Ghosh'}</a></span>
			
			{#if data.metadata.date}
				<span aria-hidden="true">·</span>
				<time datetime={data.metadata.date}>
					{new Date(data.metadata.date).toLocaleDateString('en-IN', {
						year: 'numeric',
						month: 'long',
						day: 'numeric'
					})}
				</time>
			{/if}

			{#if data.metadata.dateModified}
				<span aria-hidden="true">·</span>
				<span>Updated <time datetime={data.metadata.dateModified}>{new Date(data.metadata.dateModified).toLocaleDateString('en-IN')}</time></span>
			{/if}

			{#if data.metadata.readingTime}
				<span aria-hidden="true">·</span>
				<span>{data.metadata.readingTime} read</span>
			{/if}
		</div>

		{#if data.metadata.status === 'living'}
			<p class="mt-6 inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
				This is a living essay and may be updated as facts change.
			</p>
		{/if}
	</header>

	<div class="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-img:rounded-xl">
		<PostContent />
	</div>

	{#if data.metadata.tags && data.metadata.tags.length > 0}
		<footer class="mt-16 border-t border-neutral-200 pt-8 dark:border-neutral-800">
			<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-900 dark:text-white">
				Topics Discussed
			</h2>
			<ul class="flex flex-wrap gap-2">
				{#each data.metadata.tags as tag}
					<li>
						<span class="inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
							{tag}
						</span>
					</li>
				{/each}
			</ul>
		</footer>
	{/if}
</article>