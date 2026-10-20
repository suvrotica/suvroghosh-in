<script lang="ts">
	import '$lib/components/home/fieldbook.css';
	import ClosingInvitation from '$lib/components/home/ClosingInvitation.svelte';
	import FieldbookIndex from '$lib/components/home/FieldbookIndex.svelte';
	import LivingHero from '$lib/components/home/LivingHero.svelte';
	import RecentSignalGrid from '$lib/components/home/RecentSignalGrid.svelte';
	import WorkWorlds from '$lib/components/home/WorkWorlds.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteSEO, withSiteGraph } from '$lib/components/seo/SEO';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO {...siteSEO} schema={withSiteGraph()} />

<div class="fieldbook-home" data-fieldbook-home data-living-home>
	<div class="fb-edition" aria-label="A personal fieldbook">
		<span>THE CALCUTTA FIELDBOOK</span><span>Ideas, experiments &amp; things worth noticing.</span
		><span lang="bn">সুভ্র ঘোষ</span>
	</div>
	<LivingHero />
	<WorkWorlds projects={data.featuredProjects} />
	<RecentSignalGrid posts={data.recentPosts} />
	<FieldbookIndex paths={data.readingPaths} series={data.featuredSeries} />
	<ClosingInvitation />
</div>
