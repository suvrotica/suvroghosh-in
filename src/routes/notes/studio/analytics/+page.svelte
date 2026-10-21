<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import AnalyticsDashboard from '$lib/components/analytics/AnalyticsDashboard.svelte';
	import { navigating } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO
	title="Fieldbook Observatory | SuvroGhosh.IN"
	description="Private, aggregate audience reports for the site owner."
	canonicalUrl={undefined}
	robots="noindex,nofollow,noarchive"
	schema={null}
/>

<AnalyticsDashboard
	report={data.report}
	period={data.period}
	pending={navigating.to?.url.pathname === '/notes/studio/analytics'}
/>
