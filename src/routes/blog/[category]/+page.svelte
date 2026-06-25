<script lang="ts">
    import type { PageData } from './$types';
    import PostGallery from '$lib/components/blog/PostGallery.svelte';
    import SEO from '$lib/components/seo/SEO.svelte';
    import { siteUrl } from '$lib/components/seo/SEO';
    import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';

    let { data }: { data: PageData } = $props();
</script>

<SEO
    title={`${data.categoryDisplay} | SuvroGhosh.In`}
    description={`Essays by Suvro Ghosh on ${data.categoryDisplay}, with a focus on systems, evidence, and technology.`}
    canonicalUrl={`${siteUrl}/blog/${data.categorySlug}`}
    keywords={[data.categoryDisplay, 'Suvro Ghosh', 'Essays', 'Blog']}
/>

<section class="category-layout page-enter">
    <header class="category-header">
        <h1>{data.categoryDisplay}</h1>
        <p>Exploring concepts, systems, and logic in {data.categoryDisplay}.</p>
    </header>

    <ScrollReveal>
        <PostGallery posts={data.posts} />
    </ScrollReveal>
</section>