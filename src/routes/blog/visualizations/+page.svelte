<script lang="ts">
	import type { PageData } from './$types';
	import SEO from '$lib/components/seo/SEO.svelte';
	import VisualizationsLanding from '$lib/components/visualizations/VisualizationsLanding.svelte';
	import {
		breadcrumbSchema,
		collectionPageSchema,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import { postPath } from '$lib/content/posts';

	let { data }: { data: PageData } = $props();

	const title = 'Visualizations — Interactive Science Gallery | SuvroGhosh.In';
	const description =
		'Interactive educational experiments by Suvro Ghosh, including deterministic artificial-life and evolution models, D3 notebooks, Canvas simulations, generative graphics, and GPU shaders.';
	const canonicalUrl = `${siteUrl}/blog/visualizations`;
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	keywords={[
		'Interactive visualizations',
		'D3',
		'Observable notebooks',
		'SVG',
		'Canvas',
		'p5.js',
		'GLSL shaders',
		'Artificial life',
		'Evolution simulation',
		'Evolving Microbe Garden',
		'Science simulations',
		'Computer science education',
		'Suvro Ghosh'
	]}
	schema={withSiteGraph([
		collectionPageSchema({
			name: 'Visualizations — Interactive Science Gallery',
			description,
			url: canonicalUrl,
			about:
				'Interactive science, artificial life, mathematics, computer science, and machine-learning education'
		}),
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Blog', url: `${siteUrl}/blog` },
			{ name: 'Visualizations', url: canonicalUrl }
		]),
		{
			'@context': 'https://schema.org',
			'@type': 'ItemList',
			name: 'Published interactive experiments',
			itemListElement: data.posts.map((post, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				url: siteUrl + postPath(post),
				name: post.title
			}))
		}
	])}
/>

<VisualizationsLanding posts={data.posts} totalResults={data.totalResults} />
