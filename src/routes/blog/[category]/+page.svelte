<script lang="ts">
    import type { PageData } from './$types';
    // Import your existing PostGallery or UI components if needed
    // import PostGallery from '$lib/components/blog/PostGallery.svelte';

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>{data.category} IT Engineering | SuvroGhosh.In</title>
    <meta name="description" content="Healthcare IT engineering articles categorized under {data.category}." />
</svelte:head>

<section class="category-layout">
    <header class="category-header">
        <h1>{data.category}</h1>
        <p>Exploring concepts, workflows, and code in {data.category}.</p>
    </header>

    <div class="category-grid">
        {#each data.posts as post}
            <article class="post-card">
                <a href="/blog/{post.slug}" class="post-link">
                    <h2>{post.title}</h2>
                    {#if post.description}
                        <p>{post.description}</p>
                    {/if}
                    <time datetime={post.date}>{new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
                </a>
            </article>
        {/each}
    </div>
</section>
