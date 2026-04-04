<script lang="ts">
	import PostGallery from '$lib/components/blog/PostGallery.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteTitleLong, siteDescription } from '$lib/components/seo/SEO';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO title={siteTitleLong} description={siteDescription} />

<section class="mb-12 card bg-white/50 dark:bg-neutral-900/50 text-center md:text-left border-l-4 border-l-gold">
	<h1 class="text-4xl md:text-6xl font-bold mb-4 text-neutral-900 dark:text-neutral-100">
		Suvro Ghosh
	</h1>
	<p class="text-lg md:text-xl text-neutral-700 dark:text-neutral-300 max-w-2xl leading-relaxed font-medium">
		Navigating the architecture of chaos. Notes on enterprise healthcare IT, data science, and philosophical pragmatism from Calcutta.
	</p>
</section>

<section>
	<div class="flex items-end justify-between mb-6 border-b border-neutral-300 dark:border-neutral-700 pb-2">
		<h2 class="text-2xl font-bold m-0 text-neutral-900 dark:text-neutral-100">Latest Writing</h2>
		<a href="/blog" class="text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-gold transition-colors mb-1">
            View All →
        </a>
	</div>
	
	{#if data.posts.length > 0}
        <PostGallery posts={data.posts} />
	{:else}
		<div class="py-12 text-center text-neutral-500 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg">
			<p>No posts published yet. Check back soon.</p>
		</div>
	{/if}
</section>