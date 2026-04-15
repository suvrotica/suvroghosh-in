<script lang="ts">
    import PostGallery from '$lib/components/blog/PostGallery.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // 🚨 THE FIX: Force Svelte 5 to react to route changes
    let category = $derived(data.category);
    let posts = $derived(data.posts);
</script>

<svelte:head>
    <title>{category} Posts | SuvroGhosh.In</title>
</svelte:head>

<section>
    <h1 class="capitalize text-center mb-8">Category: {category}</h1>
    
    {#if posts.length > 0}
        <PostGallery posts={posts} />
    {:else}
        <div class="my-12 p-8 text-center border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
            <p class="text-neutral-500 dark:text-neutral-400 mb-4 font-medium">No posts found in this category.</p>
            <a href="/blog" class="btn-primary inline-block">View all posts</a>
        </div>
    {/if}
</section>