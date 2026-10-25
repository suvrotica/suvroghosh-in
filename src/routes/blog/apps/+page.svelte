<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		breadcrumbSchema,
		collectionPageSchema,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import { postPath } from '$lib/content/posts';

	let { data }: { data: PageData } = $props();
	const title = 'Apps — Useful Browser Tools | Suvro Ghosh';
	const description =
		'Practical web applications by Suvro Ghosh. Inspect prompts, count characters and explore their structure with Prompt Atlas, a tool that runs in your browser.';
	const canonicalUrl = `${siteUrl}/blog/apps`;
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	keywords={['Browser tools', 'Web applications', 'Prompt Atlas', 'Prompt analyzer', 'Mind maps']}
	schema={withSiteGraph([
		collectionPageSchema({
			name: 'Apps — Useful Browser Tools',
			description,
			url: canonicalUrl,
			about: 'Practical interactive applications by Suvro Ghosh'
		}),
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Blog', url: `${siteUrl}/blog` },
			{ name: 'Apps', url: canonicalUrl }
		]),
		{
			'@context': 'https://schema.org',
			'@type': 'ItemList',
			name: 'Useful browser applications',
			itemListElement: data.posts.map((post, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				name: post.title,
				url: siteUrl + postPath(post)
			}))
		}
	])}
/>

<div class="apps-catalog mx-auto max-w-6xl px-1 pb-12">
	<nav class="collection-nav" aria-label="Collections">
		<a href={resolve('/blog')}>All writing</a>
		<a href={resolve('/blog/visualizations')}>Viz</a>
		<a href={resolve('/blog/apps')} aria-current="page">Apps</a>
	</nav>
	<header class="collection-header">
		<div>
			<p class="eyebrow">The useful shelf</p>
			<h1>Small apps.<br /><em>Room to think.</em></h1>
			<p class="intro">
				Tools for the work between an idea and a clear result. Open one, bring your own material,
				and make something useful.
			</p>
		</div>
		<div class="shelf-mark" aria-hidden="true">
			<span>INPUT</span><i></i><span>INSPECT</span><i></i><span>MAKE SENSE</span>
		</div>
	</header>
	<section aria-labelledby="apps-heading">
		<div class="shelf-heading">
			<h2 id="apps-heading">Apps</h2>
			<span>{data.posts.length} {data.posts.length === 1 ? 'tool' : 'tools'} on the shelf</span>
		</div>
		{#if data.posts.length === 0}
			<p>
				The first tool is being prepared. Visit the <a href={resolve('/blog/visualizations')}
					>Viz collection</a
				> to explore the interactive experiments.
			</p>
		{:else}
			<div class="app-grid">
				{#each data.posts as post (post.slug)}
					<article class="app-card">
						<a
							class="preview-link"
							href={resolve('/blog/[category]/[slug]', {
								category: post.categorySlug,
								slug: post.slug
							})}
							aria-label={`Open ${post.title}`}
						>
							{#if post.thumbnail}
								<img
									src={post.thumbnail}
									alt={post.thumbnailAlt ?? post.title}
									width="1200"
									height="630"
									loading="lazy"
								/>
							{/if}
						</a>
						<div class="card-copy">
							<p class="tool-type">Browser app · Visualization</p>
							<h3>
								<a
									href={resolve('/blog/[category]/[slug]', {
										category: post.categorySlug,
										slug: post.slug
									})}>{post.title}</a
								>
							</h3>
							<p>{post.description}</p>
							<a
								class="open-app"
								href={resolve('/blog/[category]/[slug]', {
									category: post.categorySlug,
									slug: post.slug
								})}>Open app <span aria-hidden="true">↗</span></a
							>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
	<aside class="collection-note">
		<p class="eyebrow">Another way in</p>
		<p>
			Some tools also belong in <a href={resolve('/blog/visualizations')}>Viz</a>, where the drawing
			is part of the explanation. Both shelves open the same application.
		</p>
	</aside>
</div>

<style>
	.apps-catalog {
		color: var(--color-neutral-900, #252b2a);
	}
	.collection-nav {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin: 0.5rem 0 2rem;
		font-family: var(--font-sans, sans-serif);
	}
	.collection-nav a {
		min-height: 2.75rem;
		display: inline-flex;
		align-items: center;
		border: 1px solid #b7c3c0;
		border-radius: 3rem;
		padding: 0.4rem 1rem;
		font-size: 0.85rem;
		font-weight: 650;
		text-decoration: none;
	}
	.collection-nav a[aria-current] {
		background: #204d45;
		border-color: #204d45;
		color: #fff;
	}
	.collection-header {
		display: flex;
		justify-content: space-between;
		gap: 3rem;
		padding: 2rem 0 3rem;
		border-bottom: 1px solid #b7c3c0;
	}
	.eyebrow,
	.tool-type {
		font-family: var(--font-sans, sans-serif);
		text-transform: uppercase;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.15em;
	}
	.eyebrow {
		color: #315c51;
		margin: 0 0 1rem;
	}
	h1 {
		margin: 0;
		font-size: clamp(3rem, 7vw, 6rem);
		line-height: 1.02;
		letter-spacing: -0.055em;
		font-weight: 600;
	}
	h1 em {
		color: #315c51;
		font-weight: 400;
	}
	.intro {
		max-width: 36rem;
		font-size: 1.1rem;
		line-height: 1.7;
		margin: 1.6rem 0 0;
	}
	.shelf-mark {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 0 0 10rem;
		color: #46665e;
		font: 700 0.75rem var(--font-sans, sans-serif);
		letter-spacing: 0.12em;
	}
	.shelf-mark span {
		border: 1px solid #a6b9b1;
		border-radius: 0.5rem;
		padding: 0.9rem 1rem;
		width: 100%;
		text-align: center;
		background: #eaf0eb;
	}
	.shelf-mark i {
		height: 1.6rem;
		border-left: 1px solid #7d9c91;
	}
	.shelf-heading {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		margin: 2.5rem 0 1.2rem;
	}
	.shelf-heading h2 {
		margin: 0;
		font-size: 1.6rem;
	}
	.shelf-heading span {
		font: 0.8rem var(--font-sans, sans-serif);
		color: #56665f;
	}
	.app-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		gap: 1.5rem;
		max-width: 52rem;
	}
	.app-card {
		border: 1px solid #acbdb3;
		border-radius: 1rem;
		overflow: hidden;
		background: #f4f6ef;
	}
	.preview-link {
		display: block;
		background: #e4ede8;
	}
	.preview-link img {
		width: 100%;
		height: auto;
		display: block;
		aspect-ratio: 1200 / 630;
		object-fit: cover;
		margin: 0;
		border-radius: 0;
	}
	.card-copy {
		padding: 1.8rem;
	}
	.tool-type {
		color: #46665e;
		margin: 0 0 0.8rem;
	}
	h3 {
		margin: 0 0 0.9rem;
		font-size: 1.65rem;
		line-height: 1.22;
		letter-spacing: -0.025em;
	}
	h3 a {
		text-decoration: none;
	}
	.card-copy > p:not(.tool-type) {
		margin: 0;
		line-height: 1.65;
	}
	.open-app {
		display: inline-flex;
		align-items: center;
		gap: 2.5rem;
		min-height: 2.75rem;
		padding: 0.65rem 1rem;
		margin-top: 1.4rem;
		background: #204d45;
		color: white;
		border-radius: 0.4rem;
		text-decoration: none;
		font: 650 0.9rem var(--font-sans, sans-serif);
	}
	.collection-note {
		max-width: 42rem;
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid #b7c3c0;
	}
	.collection-note p:last-child {
		line-height: 1.7;
		margin-bottom: 0;
	}
	a:focus-visible {
		outline: 3px solid #ac651c;
		outline-offset: 4px;
	}
	:global(.dark) .apps-catalog {
		color: #e1e9e4;
	}
	:global(.dark) h1 em,
	:global(.dark) .eyebrow,
	:global(.dark) .tool-type {
		color: #a7d2ba;
	}
	:global(.dark) .shelf-mark {
		color: #c7dfd1;
	}
	:global(.dark) .shelf-mark span {
		background: #20362d;
		border-color: #597d6b;
	}
	:global(.dark) .app-card {
		background: #18251f;
		border-color: #597367;
	}
	:global(.dark) .shelf-heading span {
		color: #aec4b8;
	}
	:global(.dark) .collection-nav a[aria-current],
	:global(.dark) .open-app {
		background: #b8d7c5;
		color: #122a20;
		border-color: #b8d7c5;
	}
	@media (max-width: 640px) {
		.shelf-mark {
			display: none;
		}
		.collection-header {
			padding-top: 0.5rem;
		}
		.card-copy {
			padding: 1.25rem;
		}
	}
</style>
