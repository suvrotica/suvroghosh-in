<script lang="ts">
    import type { PageData } from './$types';
    import PostGallery from '$lib/components/blog/PostGallery.svelte';
    import SEO from '$lib/components/seo/SEO.svelte';

    let { data }: { data: PageData } = $props();
</script>

<SEO 
    title="{data.categoryDisplay} | SuvroGhosh.In" 
    description="Essays by Suvro Ghosh on {data.categoryDisplay}, with a focus on systems, evidence, and technology."
    canonicalUrl="https://www.suvroghosh.in/blog/{data.categorySlug}"
/>

<section class="category-layout">
    <header class="category-header">
        <h1>{data.categoryDisplay}</h1>
        <p>Exploring concepts, systems, and logic in {data.categoryDisplay}.</p>
    </header>

    <PostGallery posts={data.posts} />
</section>
