<script lang="ts">
	import BlogPostPage from '../../[category]/[slug]/+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<BlogPostPage {data} />
