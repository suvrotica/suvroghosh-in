<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import PostTabs from '$lib/components/blog/PostTabs.svelte';
	import PostGallery from '$lib/components/blog/PostGallery.svelte';
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
/>

<ScrollReveal class="page-enter">
	<section>
		<header class="mb-8">
			<h1 class="mb-4 text-center">All Posts</h1>
			<p class="mx-auto max-w-2xl text-center text-base text-neutral-600 dark:text-neutral-400">
				The complete archive of essays, satire, and reflections. Use the tabs to browse by category,
				or search for a specific topic.
			</p>
		</header>

		{#if data.search}
			<div
				class="mb-6 flex items-center justify-between border-b border-neutral-300 pb-2 dark:border-neutral-700"
			>
				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					{#if data.posts.length > 0}
						Showing {data.posts.length}
						{data.posts.length === 1 ? 'result' : 'results'} for &ldquo;{data.search}&rdquo;
					{:else}
						No posts found for &ldquo;{data.search}&rdquo;
					{/if}
				</p>
				<a
					href="/blog"
					class="text-xs font-bold tracking-wider text-neutral-500 uppercase transition-colors hover:text-neutral-400"
				>
					Clear &times;
				</a>
			</div>

			{#if data.posts.length > 0}
				<PostGallery posts={data.posts} />
			{/if}
		{:else if data.posts.length > 0}
			<PostTabs posts={data.posts} basePath="/blog" />
		{:else}
			<div class="py-12 text-center text-neutral-500">
				<p>No posts found.</p>
			</div>
		{/if}
	</section>
</ScrollReveal>
