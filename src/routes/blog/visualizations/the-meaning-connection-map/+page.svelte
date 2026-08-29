<script lang="ts">
  import BlogPostPage from '../../[category]/[slug]/+page.svelte';
  import MeaningConnectionMap from '$lib/visualizations/meaning-connection-map/MeaningConnectionMap.svelte';
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let showMap = $state(false);

  onMount(() => {
    // Show the map after a tick so the SSR-rendered blog shell
    // (with all its SEO metadata) is captured first.
    showMap = true;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  });
</script>

<!-- The standard BlogPostPage emits <h1>, breadcrumbs, canonical,
     JSON-LD BlogPosting schema, and all other SEO metadata.
     The visualization overlays this on mount. -->
<BlogPostPage {data} />

{#if showMap}
  <div class="fixed inset-0 z-50 bg-[#0f1117]">
    <MeaningConnectionMap />
  </div>
{/if}
