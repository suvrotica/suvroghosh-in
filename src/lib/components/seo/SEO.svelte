<script lang="ts">
	import { xProfile } from '$lib/config/links';
	import { indexRobots, siteSEO, withSiteGraph } from './SEO';
	type Props = {
		title?: string;
		description?: string;
		canonicalUrl?: string;
		ogImageUrl?: string;
		ogImageAlt?: string;
		ogImageWidth?: number;
		ogImageHeight?: number;
		keywords?: string[];
		schema?: unknown;
		type?: 'website' | 'article';
		publishedTime?: string;
		modifiedTime?: string;
		author?: string;
		category?: string;
		tags?: string[];
		robots?: string;
	};

	// We set the default values to fall back to your new SEO profile
	let {
		title = siteSEO.title,
		description = siteSEO.description,
		canonicalUrl = siteSEO.canonicalUrl,
		ogImageUrl = siteSEO.ogImageUrl,
		ogImageAlt = siteSEO.ogImageAlt,
		ogImageWidth = ogImageUrl === siteSEO.ogImageUrl ? 1200 : undefined,
		ogImageHeight = ogImageUrl === siteSEO.ogImageUrl ? 800 : undefined,
		keywords = siteSEO.keywords,
		schema = withSiteGraph(), // Default to the shared site graph; pages pass page-specific entities
		type = 'website',
		publishedTime,
		modifiedTime,
		author = 'Suvro Ghosh',
		category,
		tags,
		robots = indexRobots
	}: Props = $props();

	function serializeJsonLd(value: unknown) {
		return JSON.stringify(value, null, 2).replace(/[<>&\u2028\u2029]/g, (character) => {
			const escapes: Record<string, string> = {
				'<': '\\u003c',
				'>': '\\u003e',
				'&': '\\u0026',
				'\u2028': '\\u2028',
				'\u2029': '\\u2029'
			};
			return escapes[character] ?? character;
		});
	}

	let jsonLd = $derived(
		schema ? `<script type="application/ld+json">${serializeJsonLd(schema)}</${'script'}>` : ''
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />

	{#if canonicalUrl}
		<link rel="canonical" href={canonicalUrl} />
	{/if}

	<meta property="og:type" content={type} />
	<meta property="og:site_name" content="SuvroGhosh.In" />
	<meta name="author" content={author} />

	<meta name="robots" content={robots} />

	{#if type === 'article' && publishedTime}
		<meta property="article:published_time" content={publishedTime} />
	{/if}

	{#if type === 'article' && modifiedTime}
		<meta property="article:modified_time" content={modifiedTime} />
	{/if}

	{#if type === 'article' && category}
		<meta property="article:section" content={category} />
	{/if}

	{#if type === 'article' && tags && tags.length > 0}
		{#each tags as tag (tag)}
			<meta property="article:tag" content={tag} />
		{/each}
	{/if}

	{#if canonicalUrl}
		<meta property="og:url" content={canonicalUrl} />
	{/if}
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />

	{#if ogImageUrl}
		<meta property="og:image" content={ogImageUrl} />
		{#if (ogImageWidth ?? 0) > 0 && (ogImageHeight ?? 0) > 0}
			<meta property="og:image:width" content={String(ogImageWidth)} />
			<meta property="og:image:height" content={String(ogImageHeight)} />
		{/if}
	{/if}
	{#if ogImageAlt}
		<meta property="og:image:alt" content={ogImageAlt} />
	{/if}

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:creator" content={xProfile.handle} />
	{#if canonicalUrl}
		<meta property="twitter:url" content={canonicalUrl} />
	{/if}
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	{#if ogImageUrl}
		<meta name="twitter:image" content={ogImageUrl} />
		{#if ogImageAlt}
			<meta name="twitter:image:alt" content={ogImageAlt} />
		{/if}
	{/if}

	{#if keywords && keywords.length > 0}
		<meta name="keywords" content={keywords.join(', ')} />
	{/if}

	{#if schema}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html jsonLd}
	{/if}
</svelte:head>
