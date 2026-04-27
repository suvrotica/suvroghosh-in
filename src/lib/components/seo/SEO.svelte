<script lang="ts">
	// Import the master defaults we just created in seo.ts
	// (Adjust the import path based on where your seo.ts file lives)
	import { siteSEO, websiteSchema } from './SEO';
	type Props = {
		title?: string;
		description?: string;
		canonicalUrl?: string;
		ogImageUrl?: string;
		ogImageAlt?: string;
		keywords?: string[];
		schema?: Record<string, any>;
		type?: 'website' | 'article';
		publishedTime?: string;
		modifiedTime?: string;
		author?: string;
	};

	// We set the default values to fall back to your new SEO profile
	let {
		title = siteSEO.title,
		description = siteSEO.description,
		canonicalUrl = siteSEO.canonicalUrl,
		ogImageUrl = siteSEO.ogImageUrl,
		ogImageAlt = siteSEO.ogImageAlt,
		keywords = siteSEO.keywords,
		schema = websiteSchema, // Defaults to WebSite schema, override with BlogPosting for articles
		type = 'website',
		publishedTime,
		modifiedTime,
		author = 'Suvro Ghosh'
	}: Props = $props();
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
	
	<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />

	{#if type === 'article' && publishedTime}
		<meta property="article:published_time" content={publishedTime} />
	{/if}

	{#if type === 'article' && modifiedTime}
		<meta property="article:modified_time" content={modifiedTime} />
	{/if}

	{#if canonicalUrl}
		<meta property="og:url" content={canonicalUrl} />
	{/if}
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	
	{#if ogImageUrl}
		<meta property="og:image" content={ogImageUrl} />
	{/if}
	{#if ogImageAlt}
		<meta property="og:image:alt" content={ogImageAlt} />
	{/if}

	<meta name="twitter:card" content="summary_large_image" />
	{#if canonicalUrl}
		<meta property="twitter:url" content={canonicalUrl} />
	{/if}
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	{#if ogImageUrl}
		<meta name="twitter:image" content={ogImageUrl} />
	{/if}

	{#if keywords && keywords.length > 0}
		<meta name="keywords" content={keywords.join(', ')} />
	{/if}

	{#if schema}
		{@html `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>`}
	{/if}
</svelte:head>