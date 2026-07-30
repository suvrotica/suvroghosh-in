<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import ResourceDetail from '$lib/components/resources/ResourceDetail.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO {...data.seo} />

<div class="page-enter">
	<ResourceDetail
		resource={data.resource}
		relatedResources={data.relatedResources}
		thumbnailWidth={data.thumbnailWidth}
		thumbnailHeight={data.thumbnailHeight}
		content={data.content}
	/>
</div>
