<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		absoluteUrl,
		breadcrumbSchema,
		collectionPageSchema,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import ImageCollectionNav from '$lib/components/images/ImageCollectionNav.svelte';
	import ArtworkDetail from '$lib/components/sketch-museum/ArtworkDetail.svelte';
	import SketchCollection from '$lib/components/sketch-museum/SketchCollection.svelte';
	import SketchMuseum from '$lib/components/sketch-museum/SketchMuseum.svelte';
	import type { SketchArtwork } from '$lib/sketches/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const title = 'Sketch Museum | Suvro Ghosh';
	const description =
		'Explore an atmospheric three-dimensional museum and an accessible collection of digital sketches by Suvro Ghosh.';
	const canonicalUrl = `${siteUrl}/images/sketches`;
	let featuredArtwork = $derived(
		data.artworks.find((artwork) => artwork.featured) ?? data.artworks[0] ?? null
	);

	let selectedArtwork = $state<SketchArtwork | null>(null);
	let detailOpen = $state(false);
	let initialSelectionApplied = $state(false);
	let selectedSlug = $derived(selectedArtwork?.slug ?? null);

	let imageGallerySchema = $derived({
		'@type': 'ImageGallery',
		'@id': `${canonicalUrl}#gallery`,
		name: 'Sketch Museum collection',
		description,
		url: canonicalUrl,
		isPartOf: { '@id': canonicalUrl },
		associatedMedia: data.artworks.map((artwork) => ({
			'@type': 'ImageObject',
			'@id': `${canonicalUrl}?art=${encodeURIComponent(artwork.slug)}#image`,
			name: artwork.title,
			description: artwork.description || undefined,
			caption: artwork.description || undefined,
			contentUrl: absoluteUrl(artwork.variants.detail.src),
			thumbnailUrl: absoluteUrl(artwork.variants.thumbnail.src),
			width: artwork.variants.detail.width,
			height: artwork.variants.detail.height,
			encodingFormat: 'image/webp',
			representativeOfPage: artwork.featured,
			creator: { '@id': `${siteUrl}/#person` },
			url: `${canonicalUrl}?art=${encodeURIComponent(artwork.slug)}`
		}))
	});

	$effect(() => {
		if (initialSelectionApplied) return;
		initialSelectionApplied = true;
		const requested = data.selectedSlug;
		selectedArtwork = requested
			? (data.artworks.find((artwork) => artwork.slug === requested) ?? null)
			: null;
		detailOpen = Boolean(selectedArtwork);
	});

	onMount(() => {
		const syncFromLocation = () => {
			const requested = new URL(window.location.href).searchParams.get('art');
			selectedArtwork = requested
				? (data.artworks.find((artwork) => artwork.slug === requested) ?? null)
				: null;
			detailOpen = Boolean(selectedArtwork);
		};
		window.addEventListener('popstate', syncFromLocation);
		return () => window.removeEventListener('popstate', syncFromLocation);
	});

	function replaceArtworkUrl(artwork: SketchArtwork | null) {
		if (typeof window === 'undefined') return;
		const route = artwork
			? (`/images/sketches?art=${encodeURIComponent(artwork.slug)}#sketch-collection` as const)
			: ('/images/sketches' as const);
		replaceState(resolve(route), {});
	}

	function selectInMuseum(slug: string) {
		const artwork = data.artworks.find((candidate) => candidate.slug === slug);
		if (!artwork) return;
		selectedArtwork = artwork;
		detailOpen = false;
		replaceArtworkUrl(artwork);
	}

	function openDetails(artwork: SketchArtwork) {
		selectedArtwork = artwork;
		detailOpen = true;
		replaceArtworkUrl(artwork);
	}

	function closeDetails() {
		detailOpen = false;
		selectedArtwork = null;
		replaceArtworkUrl(null);
	}

	function focusMuseum(artwork: SketchArtwork) {
		selectedArtwork = artwork;
		detailOpen = false;
		replaceArtworkUrl(artwork);
		requestAnimationFrame(() =>
			document.getElementById('museum-view-heading')?.scrollIntoView({
				behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
				block: 'start'
			})
		);
	}
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	ogImageUrl={featuredArtwork ? absoluteUrl(featuredArtwork.variants.detail.src) : undefined}
	ogImageAlt={featuredArtwork?.alt}
	ogImageWidth={featuredArtwork?.variants.detail.width}
	ogImageHeight={featuredArtwork?.variants.detail.height}
	keywords={['Sketch Museum', 'Digital sketches', 'Drawing collection', 'Suvro Ghosh']}
	schema={withSiteGraph([
		collectionPageSchema({
			name: 'Sketch Museum',
			description,
			url: canonicalUrl,
			about: 'Digital sketches and drawings'
		}),
		imageGallerySchema,
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Images', url: `${siteUrl}/images` },
			{ name: 'Sketches', url: canonicalUrl }
		])
	])}
/>

<article class="page-enter sketches-page">
	<nav aria-label="Breadcrumb" class="breadcrumb">
		<ol>
			<li><a href={resolve('/')}>Home</a></li>
			<li aria-hidden="true">/</li>
			<li><a href={resolve('/images')}>Images</a></li>
			<li aria-hidden="true">/</li>
			<li aria-current="page">Sketches</li>
		</ol>
	</nav>

	<header class="page-header">
		<p class="eyebrow">Drawings in rooms</p>
		<h1>Sketch Museum</h1>
		<p>
			An expanding hanging of figures, faces, creatures, objects, landscapes, and abstract forms.
			Enter the atmospheric gallery or browse every work in the complete collection below.
		</p>
	</header>

	<ImageCollectionNav tabs={data.tabs} activeKey="sketches" />

	<a class="museum-skip-link" href="#sketch-collection"
		>Skip the interactive museum and open the accessible collection</a
	>

	<SketchMuseum
		artworks={data.artworks}
		{selectedSlug}
		onSelect={selectInMuseum}
		onDetails={openDetails}
	/>

	<SketchCollection artworks={data.artworks} {selectedSlug} onOpenDetails={openDetails} />
</article>

{#if detailOpen && selectedArtwork}
	<ArtworkDetail
		artworks={data.artworks}
		artwork={selectedArtwork}
		onClose={closeDetails}
		onSelect={openDetails}
		onMuseumFocus={focusMuseum}
	/>
{/if}

<style>
	.sketches-page {
		padding-block: 1rem 2rem;
	}

	.breadcrumb {
		margin-bottom: 1.35rem;
		color: var(--ink-faint);
		font-size: 0.82rem;
	}

	.breadcrumb ol {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.breadcrumb a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		color: var(--ink-muted);
		font-weight: 750;
		text-underline-offset: 0.25rem;
	}

	.page-header {
		margin-bottom: 1.65rem;
		padding-block: 1.4rem 1.9rem;
		border-block: 1px solid var(--rule);
	}

	.eyebrow {
		margin: 0 0 0.55rem;
		color: var(--ink-faint);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: clamp(2.7rem, 9vw, 5.7rem);
		font-weight: 650;
		letter-spacing: -0.045em;
		line-height: 0.94;
	}

	.page-header > p:last-child {
		max-width: 46rem;
		margin: 1.15rem 0 0;
		color: var(--ink-muted);
		font-family: var(--font-serif);
		font-size: clamp(1.02rem, 2.2vw, 1.25rem);
		line-height: 1.65;
		text-align: left;
	}

	.museum-skip-link {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		margin-top: 0.15rem;
		color: var(--ink-muted);
		font-size: 0.78rem;
		font-weight: 750;
		text-underline-offset: 0.28rem;
	}

	@media (max-width: 38rem) {
		.sketches-page {
			padding-top: 0;
		}
	}
</style>
