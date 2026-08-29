<script lang="ts">
  import MeaningConnectionMap from '$lib/visualizations/meaning-connection-map/MeaningConnectionMap.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.metadata.title}</title>
  <meta name="description" content={data.metadata.description} />
  <style>
    /* Remove site shell constraints for full-screen visualization */
    :global(body) { overflow: hidden; }
  </style>
</svelte:head>

<MeaningConnectionMap />
