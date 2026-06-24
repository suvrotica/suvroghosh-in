<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import PostTabs from '$lib/components/blog/PostTabs.svelte';
	import PostGallery from '$lib/components/blog/PostGallery.svelte';
	let { data } = $props();
</script>

<SEO
	title="All Posts | SuvroGhosh.In"
	description="Complete archive of essays by Suvro Ghosh on healthcare IT, AI, systems thinking, public health, Calcutta culture, and first-principles analysis."
	canonicalUrl={`${siteUrl}/blog`}
	keywords={['Blog', 'Essays', 'Healthcare IT', 'AI', 'Systems Thinking', 'Calcutta', 'Suvro Ghosh', 'Public Health', 'Healthcare Interoperability']}
/>

<section>
	<h1 class="text-center mb-8">Suvro Ghosh Posts</h1>

	{#if data.search}
		<div class="mb-6 flex items-center justify-between border-b border-neutral-300 dark:border-neutral-700 pb-2">
			<p class="text-sm text-neutral-600 dark:text-neutral-400">
				{#if data.posts.length > 0}
					Showing {data.posts.length} {data.posts.length === 1 ? 'result' : 'results'} for &ldquo;{data.search}&rdquo;
				{:else}
					No posts found for &ldquo;{data.search}&rdquo;
				{/if}
			</p>
			<a href="/blog" class="text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-gold transition-colors">
				Clear ✕
			</a>
		</div>

		{#if data.posts.length > 0}
			<PostGallery posts={data.posts} />
		{/if}
	{:else if data.posts.length > 0}
		<PostTabs posts={data.posts} basePath="/blog" />
	{:else}
		<div class="text-center py-12 text-neutral-500">
			<p>No posts found.</p>
		</div>
	{/if}
</section>