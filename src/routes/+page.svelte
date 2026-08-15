<script lang="ts">
	import ClosingInvitation from '$lib/components/home/ClosingInvitation.svelte';
	import FeaturedSeriesIndex from '$lib/components/home/FeaturedSeriesIndex.svelte';
	import FourWaysField from '$lib/components/home/FourWaysField.svelte';
	import LivingHero from '$lib/components/home/LivingHero.svelte';
	import LivingIndexScene from '$lib/components/home/LivingIndexScene.svelte';
	import ReadingPathRail from '$lib/components/home/ReadingPathRail.svelte';
	import RecentSignalGrid from '$lib/components/home/RecentSignalGrid.svelte';
	import WorkWorlds from '$lib/components/home/WorkWorlds.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteSEO, withSiteGraph } from '$lib/components/seo/SEO';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO {...siteSEO} schema={withSiteGraph()} />

<div class="living-home" data-living-home data-living-index-narrative>
	<LivingIndexScene />
	<LivingHero />

	<FourWaysField />

	<FeaturedSeriesIndex series={data.featuredSeries} />

	<ReadingPathRail paths={data.readingPaths} />

	<WorkWorlds />

	<RecentSignalGrid posts={data.recentPosts} />

	<ClosingInvitation />
</div>
