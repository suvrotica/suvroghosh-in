<script lang="ts">
    import SEO from '$lib/components/seo/SEO.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    
    let PostContent = $derived(data.content);
</script>
<SEO {...data.seo} />

<article class="prose prose-neutral dark:prose-invert max-w-none mx-auto lg:prose-lg prose-headings:font-bold prose-a:text-gold prose-img:rounded-xl">
    <header class="mb-12 text-center not-prose">
        <h1 class="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-4">
            {data.metadata.title}
        </h1>
        
        <div class="flex items-center justify-center gap-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            
            <span class="uppercase tracking-wider text-gold">{data.metadata.category}</span>
        </div>
    </header>

    <div class="mt-8">
        <PostContent />
    </div>
</article>