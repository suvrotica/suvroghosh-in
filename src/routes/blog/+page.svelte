<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
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
    {#if data.posts.length > 0}
        <PostGallery posts={data.posts} />
    {:else}
        <div class="text-center py-12 text-neutral-500">
            <p>No posts found.</p>
        </div>
    {/if}
</section>