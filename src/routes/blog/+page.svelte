<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		collectionPageSchema,
		indexRobots,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import PostBrowse from '$lib/components/blog/PostBrowse.svelte';
	import PostSearch from '$lib/components/search/PostSearch.svelte';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';

	let { data } = $props();

	let canonicalUrl = $derived(
		data.isSearching || data.page <= 1 ? `${siteUrl}/blog` : `${siteUrl}/blog?page=${data.page}`
	);
	let pageTitle = $derived(
		`All Posts${!data.isSearching && data.page > 1 ? ` — Page ${data.page}` : ''} | SuvroGhosh.In`
	);
	let pageDescription = $derived(
		data.isSearching
			? 'Filtered archive of essays by Suvro Ghosh.'
			: `Complete archive of essays by Suvro Ghosh on healthcare IT, AI, systems thinking, public health, Calcutta culture, and first-principles analysis${data.page > 1 ? ` — page ${data.page}` : ''}.`
	);
</script>

<SEO
	title={pageTitle}
	description={pageDescription}
	{canonicalUrl}
	robots={data.isSearching ? 'noindex,follow' : indexRobots}
	keywords={[
		'Blog',
		'Essays',
		'Healthcare IT',
		'AI',
		'Systems Thinking',
		'Calcutta',
		'Suvro Ghosh',
		'Public Health',
		'Healthcare Interoperability'
	]}
	schema={withSiteGraph([
		collectionPageSchema({
			name: data.page > 1 && !data.isSearching ? `All Posts — Page ${data.page}` : 'All Posts',
			description: pageDescription,
			url: canonicalUrl,
			about: 'Essays and blog posts'
		})
	])}
/>

<ScrollReveal class="page-enter">
	<section>
		<header class="mb-8">
			<h1 class="archive-title mb-4 text-center">All Posts</h1>
			<p class="mx-auto max-w-2xl text-center text-base text-neutral-600 dark:text-neutral-400">
				The complete archive of essays, satire, and reflections. Search by phrase or category, or
				begin with the latest writing.
			</p>
		</header>

		{#if !data.isSearching && data.page === 1}
			<aside
				class="mb-8 grid gap-4 border-y-2 border-[#29241d] bg-[#fff9e9] p-5 text-[#29241d] sm:grid-cols-[1fr_auto] sm:items-center"
				aria-labelledby="archive-comic-heading"
			>
				<div>
					<p class="mb-1 text-left text-xs font-bold tracking-[0.13em] text-[#8e342d] uppercase">
						Comic {data.comic.published ? 'album' : 'production edition'}
					</p>
					<h2 id="archive-comic-heading" class="m-0 text-2xl text-[#29241d]">
						{data.comic.title}
					</h2>
					<p class="mt-2 mb-0 max-w-2xl text-left text-sm text-[#625747]">
						{data.comic.description}
					</p>
				</div>
				<a
					href={data.comic.href}
					class="inline-flex min-h-11 items-center font-bold text-[#8e342d]"
				>
					Read {data.comic.pageCount} pages <span class="ml-2" aria-hidden="true">→</span>
				</a>
			</aside>
		{/if}

		{#if data.isSearching}
			<PostSearch
				initialQuery={data.search}
				initialSection={data.section}
				initialCategory={data.category}
				initialTag={data.tag}
				initialYear={data.year}
				initialSort={data.sort}
				initialPage={data.page}
				fallbackPosts={data.posts}
				fallbackResultCount={data.totalResults}
				fallbackPageCount={data.totalPages}
				facets={data.facets}
			/>
		{:else if data.posts.length > 0}
			<PostBrowse
				posts={data.posts}
				facets={data.facets}
				page={data.page}
				totalResults={data.totalResults}
				totalPages={data.totalPages}
			/>
		{:else}
			<div class="py-12 text-center text-neutral-500">
				<p>No posts found.</p>
			</div>
		{/if}
	</section>
</ScrollReveal>
