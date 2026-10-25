<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import SyntheticDataLab from '$lib/components/synthetic-data-lab/SyntheticDataLab.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
</script>

<SEO
	title="Synthetic Data Lab — Generate, Explore & Download | Suvro Ghosh"
	description="Design synthetic datasets with live distribution controls, event arrivals, machine learning targets and validation. Compare shapes and download reproducible CSV datasets."
	canonicalUrl={`${siteUrl}/tools/synthetic-data-lab`}
/>
<SyntheticDataLab />
