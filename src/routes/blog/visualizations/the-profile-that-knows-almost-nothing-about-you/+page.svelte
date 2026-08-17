<script lang="ts">
	import barnumCriticalCss from './barnum-lab-critical.css?inline';
	import BlogPostPage from '../../[category]/[slug]/+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<svelte:element this={'style'} data-barnum-critical>{barnumCriticalCss}</svelte:element>
</svelte:head>

<BlogPostPage {data} />
