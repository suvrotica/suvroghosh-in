<script lang="ts">
	import PostTabs from '$lib/components/blog/PostTabs.svelte';
	import { siteSEO, personSchema, websiteSchema } from '$lib/components/seo/SEO';
	import SEO from '$lib/components/seo/SEO.svelte';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO
	{...siteSEO}
	schema={{
		'@context': 'https://schema.org',
		'@graph': [personSchema, websiteSchema]
	}}
/>

<section class="page-enter mb-12">
	<div class="relative overflow-hidden rounded-xl border border-neutral-300 dark:border-neutral-700 bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800/60 dark:to-neutral-900 p-8 md:p-12">
		<div class="absolute top-0 right-0 w-48 h-48 bg-gold/5 rounded-full blur-3xl -mr-16 -mt-16" aria-hidden="true"></div>

		<div class="relative">
			<p class="text-sm font-semibold uppercase tracking-widest text-gold mb-3">
				Healthcare IT · Applied AI · Calcutta
			</p>
			<h1 class="text-4xl md:text-6xl font-bold mb-4 text-neutral-900 dark:text-neutral-100">
				Suvro Ghosh
			</h1>
			<p class="text-lg md:text-xl text-neutral-700 dark:text-neutral-300 max-w-2xl leading-relaxed font-medium">
				Where clinical entropy meets structural intent. Notes on enterprise healthcare IT, data architecture, and the first-principles thinking required to build technology that outlasts its own hype. Calcutta.
			</p>
		</div>
	</div>
</section>

<ScrollReveal>
	<section>
		<div class="flex items-end justify-between mb-6 border-b border-neutral-300 dark:border-neutral-700 pb-2">
			<h2 class="text-2xl font-bold m-0 text-neutral-900 dark:text-neutral-100">Latest Writing</h2>
			<a href="/blog" class="text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-gold transition-colors mb-1">
				View All &rarr;
			</a>
		</div>

		{#if data.posts.length > 0}
			<PostTabs posts={data.posts} basePath="/" />
		{:else}
			<div class="py-12 text-center text-neutral-500 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg">
				<p>No posts published yet. Check back soon.</p>
			</div>
		{/if}
	</section>
</ScrollReveal>