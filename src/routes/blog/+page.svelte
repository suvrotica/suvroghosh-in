<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { collectionPageSchema, siteUrl } from '$lib/components/seo/SEO';
	import PostBrowse from '$lib/components/blog/PostBrowse.svelte';
	import PostSearch from '$lib/components/search/PostSearch.svelte';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';

	let { data } = $props();
</script>

<SEO
	title="All Posts | SuvroGhosh.In"
	description="Complete archive of essays by Suvro Ghosh on healthcare IT, AI, systems thinking, public health, Calcutta culture, and first-principles analysis."
	canonicalUrl={siteUrl + '/blog'}
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
	schema={collectionPageSchema({
		name: 'All Posts',
		description:
			'Complete archive of essays by Suvro Ghosh on healthcare IT, AI, systems thinking, public health, Calcutta culture, and first-principles analysis.',
		url: siteUrl + '/blog',
		about: 'Essays and blog posts'
	})}
/>

<ScrollReveal class="page-enter">
	<section>
		<header class="mb-8">
			<h1 class="mb-4 text-center">All Posts</h1>
			<p class="mx-auto max-w-2xl text-center text-base text-neutral-600 dark:text-neutral-400">
				The complete archive of essays, satire, and reflections. Search by phrase or category, or
				begin with the latest writing.
			</p>
		</header>

		{#if data.isSearching}
			<PostSearch
				initialQuery={data.search}
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
