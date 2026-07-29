<script lang="ts">
	import { resolve } from '$app/paths';
	import { beforeNavigate } from '$app/navigation';
	import { resetAllLivingCards } from '$lib/attachments/living-card';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import LivingHero from '$lib/components/home/LivingHero.svelte';
	import ReadingPathRail from '$lib/components/home/ReadingPathRail.svelte';
	import RecentSignalGrid from '$lib/components/home/RecentSignalGrid.svelte';
	import WorldPortal, { type PortalLink } from '$lib/components/home/WorldPortal.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteSEO, withSiteGraph } from '$lib/components/seo/SEO';
	import { substackLinks } from '$lib/config/links';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const professionalLinks: readonly PortalLink[] = [
		{ label: 'Projects', href: resolve('/projects') },
		{ label: 'Resume', href: resolve('/resume') },
		{ label: 'Consulting', href: resolve('/consulting') },
		{ label: 'Gulf / Kuwait', href: resolve('/healthcare-it-gulf') }
	];

	const writingLinks: readonly PortalLink[] = [
		{ label: 'Writings', href: resolve('/writing') },
		{ label: 'All Posts', href: resolve('/blog') },
		{ label: 'Images', href: resolve('/images') },
		{ label: 'Music', href: resolve('/topics/[slug]', { slug: 'songs' }) },
		{ label: 'Newsletter', href: substackLinks.subscribe, external: true }
	];

	beforeNavigate(resetAllLivingCards);
</script>

<SEO {...siteSEO} schema={withSiteGraph()} />

<div class="living-home" data-living-home>
	<LivingHero />

	<ReadingPathRail paths={data.readingPaths} />

	<ScrollReveal class="home-breakout world-portals">
		<WorldPortal
			kind="professional"
			title="Professional"
			description="Healthcare IT, HL7/FHIR, HIE, clinical data systems, SQL/ETL, health informatics, and AI-ready healthcare data architecture. Open to Gulf, remote, hybrid, consulting, and advisory opportunities."
			links={professionalLinks}
		/>
		<WorldPortal
			kind="writing"
			title="Writing"
			description="Essays, satire, fiction, sketches, and reflections on technology, illness, corruption, social decay, and Calcutta life. Personal, analytical, sometimes comic, sometimes dark, and intentionally human."
			links={writingLinks}
		/>
	</ScrollReveal>

	<RecentSignalGrid posts={data.recentPosts} />
</div>
