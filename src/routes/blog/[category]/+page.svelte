<script lang="ts">
    import type { PageData } from './$types';
    import PostGallery from '$lib/components/blog/PostGallery.svelte';
    import SEO from '$lib/components/seo/SEO.svelte';
    import { siteUrl } from '$lib/components/seo/SEO';

    let { data }: { data: PageData } = $props();
</script>

<SEO
    title={`${data.categoryDisplay} | SuvroGhosh.In`}
    description={`Essays by Suvro Ghosh on ${data.categoryDisplay}, with a focus on systems, evidence, and technology.`}
    canonicalUrl={`${siteUrl}/blog/${data.categorySlug}`}
    keywords={[data.categoryDisplay, 'Suvro Ghosh', 'Essays', 'Blog', ...data.posts.flatMap(p => (p.title || '').split(/\s+/).filter((w: string) => w.length > 3)).slice(0, 10)]}
/>

<section class="category-layout">
    <header class="category-header">
        <h1>{data.categoryDisplay}</h1>
        <p>Exploring concepts, systems, and logic in {data.categoryDisplay}.</p>
    </header>

    <PostGallery posts={data.posts} />
</section>