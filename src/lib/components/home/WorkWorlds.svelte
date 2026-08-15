<script lang="ts">
	import { resolve } from '$app/paths';
	import { substackLinks } from '$lib/config/links';
	import WorldPortal, { type PortalLink } from './WorldPortal.svelte';

	const professionalCapabilities = [
		'Healthcare IT',
		'HL7/FHIR',
		'HIE',
		'Clinical data systems',
		'SQL/ETL',
		'Health informatics',
		'AI-ready healthcare data architecture'
	] as const;

	const creativeCapabilities = [
		'Essays',
		'Satire',
		'Fiction',
		'Scientific visualizations',
		'Games',
		'Images',
		'Music'
	] as const;

	const professionalLinks: readonly PortalLink[] = [
		{ label: 'Projects', href: resolve('/projects') },
		{ label: 'Resume', href: resolve('/resume') },
		{ label: 'Consulting', href: resolve('/consulting') },
		{ label: 'Gulf / Kuwait', href: resolve('/healthcare-it-gulf') },
		{ label: 'Contact', href: resolve('/contact') }
	];

	const creativeLinks: readonly PortalLink[] = [
		{ label: 'Essays', href: resolve('/writing') },
		{ label: 'Satire', href: resolve('/blog/[category]', { category: 'satire' }) },
		{ label: 'Fiction', href: resolve('/blog/[category]', { category: 'short-fiction' }) },
		{ label: 'Visualizations', href: resolve('/blog/visualizations') },
		{ label: 'Games', href: resolve('/blog/games') },
		{ label: 'Images', href: resolve('/images') },
		{ label: 'Music', href: resolve('/topics/[slug]', { slug: 'songs' }) },
		{ label: 'Newsletter', href: substackLinks.subscribe, external: true }
	];
</script>

<section
	class="home-breakout work-worlds"
	aria-labelledby="work-worlds-heading"
	data-work-worlds
	data-scene-section
	data-scene-state="work"
>
	<header class="work-worlds__intro">
		<p class="work-worlds__index">Index 04 / Work in two registers</p>
		<h2 id="work-worlds-heading">Professional and creative work</h2>
		<p class="work-worlds__description">
			Clinical information systems and independent creative work sit side by side here. Both are
			concerned with how difficult structures become legible.
		</p>
	</header>

	<div class="world-portals work-worlds__grid">
		<WorldPortal
			kind="professional"
			title="Professional systems work"
			description="Healthcare data architecture, interoperability, and the dependable movement of clinical information. Available for Gulf, remote, hybrid, consulting, and advisory work."
			capabilities={professionalCapabilities}
			links={professionalLinks}
		/>
		<WorldPortal
			kind="creative"
			title="Creative and experimental work"
			description="Essays, satire, fiction, images, music, and browser experiments about technology, illness, corruption, Calcutta, and the strange machinery of ordinary life."
			capabilities={creativeCapabilities}
			links={creativeLinks}
		/>
	</div>
</section>
