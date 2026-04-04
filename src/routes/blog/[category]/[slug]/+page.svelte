<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	let { data } = $props();

    let Content = $derived(data.content);
    let meta = $derived(data.metadata);

    const colorStyles: Record<string, string> = {
        red: 'bg-red-800 text-white border-red-950',
        black: 'bg-neutral-950 text-white border-neutral-800',
        blue: 'bg-blue-700 text-white border-blue-900',
        green: 'bg-emerald-700 text-white border-emerald-900',
        orange: 'bg-orange-600 text-white border-orange-800'
    };

    let headerClass = $derived(
        colorStyles[(meta.color ?? '').toLowerCase()] ?? colorStyles['orange']
    );
</script>

{#if data.seo}
    <SEO {...data.seo} schema={data.schema} />
{/if}

<article class="blog-post-container max-w-4xl mx-auto">
    <header class={`mb-8 rounded-lg p-8 shadow-lg border-b-4 ${headerClass}`}>
        <h1 class="text-3xl md:text-5xl font-bold leading-tight mb-4 text-center">
            {meta.title}
        </h1>
        
        <div class="flex justify-center items-center gap-4 text-sm font-medium opacity-90 uppercase tracking-widest">
            <span>{meta.category}</span>
            <span>•</span>
            <span>{new Date(meta.date || new Date()).toLocaleDateString()}</span>
        </div>
    </header>

    <div class="prose prose-lg dark:prose-invert mx-auto">
        {#if Content}
            <Content />
        {/if}
    </div>
</article>