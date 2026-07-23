<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import PublicNoteCanvas from '$lib/components/notes/PublicNoteCanvas.svelte';
	import {
		breadcrumbSchema,
		personId,
		siteUrl,
		websiteId,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let canonicalUrl = $derived(`${siteUrl}/notes/${data.note.slug}`);
	let title = $derived(data.note.seoTitle || `${data.note.title} | Handwritten Notes`);
	let description = $derived(
		data.note.seoDescription || data.note.excerpt || `A handwritten note by Suvro Ghosh.`
	);
	const defaultSocialImageUrl = `${siteUrl}/images/handwritten-notes-social-card.png`;
	let socialImageUrl = $derived(data.note.coverImageUrl ?? defaultSocialImageUrl);
	let creativeWorkSchema = $derived({
		'@type': 'CreativeWork',
		'@id': `${canonicalUrl}#note`,
		name: data.note.title,
		description,
		url: canonicalUrl,
		datePublished: data.note.publishedAt,
		dateModified: data.note.publishedAt,
		author: { '@id': personId },
		publisher: { '@id': personId },
		isPartOf: { '@id': websiteId },
		keywords: data.note.tags,
		image: socialImageUrl,
		inLanguage: 'en',
		isAccessibleForFree: true
	});

	function formatDate(value: string | null) {
		if (!value) return '';
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(new Date(value));
	}
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	ogImageUrl={socialImageUrl}
	ogImageAlt={data.note.coverImageUrl
		? `Cover image for ${data.note.title}`
		: 'Handwritten Notes by SuvroGhosh.IN, arranged as charcoal marks and movable paper tiles'}
	ogImageWidth={data.note.coverImageUrl ? undefined : 1200}
	ogImageHeight={data.note.coverImageUrl ? undefined : 630}
	type="article"
	publishedTime={data.note.publishedAt ?? undefined}
	tags={data.note.tags}
	schema={withSiteGraph([
		creativeWorkSchema,
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Handwritten Notes', url: `${siteUrl}/notes` },
			{ name: data.note.title, url: canonicalUrl }
		])
	])}
/>

<article class="public-note">
	<header>
		<nav aria-label="Breadcrumb">
			<a href={resolve('/notes')}>Handwritten notes</a>
			<span aria-hidden="true">/</span>
			<span>{data.note.category ?? 'Notebook'}</span>
		</nav>
		<h1>{data.note.title}</h1>
		{#if data.note.excerpt}
			<p class="excerpt">{data.note.excerpt}</p>
		{/if}
		<div class="metadata">
			{#if data.note.publishedAt}
				<time datetime={data.note.publishedAt}>{formatDate(data.note.publishedAt)}</time>
			{/if}
			{#if data.note.tags.length > 0}
				<ul aria-label="Tags">
					{#each data.note.tags as tag (tag)}
						<li>{tag}</li>
					{/each}
				</ul>
			{/if}
		</div>
	</header>

	<section class="canvas-section" aria-labelledby="canvas-heading">
		<div class="canvas-heading-row">
			<div>
				<p>Interactive page</p>
				<h2 id="canvas-heading">Move around the note</h2>
			</div>
			<p>Pan, pinch, zoom, or fit the entire page. Editing controls are not exposed here.</p>
		</div>
		{#key data.note.snapshotId ?? data.note.id}
			<PublicNoteCanvas
				slug={data.note.slug}
				title={data.note.title}
				downloadsEnabled={data.note.downloadsEnabled}
				initialDocument={data.initialDocument}
			/>
		{/key}
	</section>

	{#if data.note.transcript}
		<section class="transcript" aria-labelledby="transcript-heading" data-pagefind-body>
			<p class="section-kicker">Text alternative</p>
			<h2 id="transcript-heading">Transcript</h2>
			<p>{data.note.transcript}</p>
		</section>
	{/if}

	{#if data.related.length > 0}
		<section class="related" aria-labelledby="related-heading">
			<h2 id="related-heading">More handwritten notes</h2>
			<ul>
				{#each data.related as note (note.id)}
					<li>
						<a href={resolve('/notes/[slug]', { slug: note.slug })}>
							<strong>{note.title}</strong>
							<span>{note.excerpt}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</article>

<style>
	.public-note > header {
		max-width: 52rem;
		margin: 0 auto 2.2rem;
		padding-block: 1.5rem 2rem;
		border-bottom: 1px solid var(--rule);
	}

	.public-note nav {
		display: flex;
		gap: 0.45rem;
		margin-bottom: 1.4rem;
		color: var(--ink-faint);
		font-size: 0.75rem;
		font-weight: 750;
	}

	.public-note nav a {
		color: inherit;
		text-underline-offset: 0.2em;
	}

	h1 {
		margin: 0;
		color: var(--ink);
		font-family: var(--font-serif);
		font-size: clamp(2.6rem, 8vw, 5.8rem);
		font-weight: 620;
		letter-spacing: -0.045em;
		line-height: 0.98;
	}

	.excerpt {
		max-width: 42rem;
		margin: 1.1rem 0 0;
		color: var(--ink-muted);
		font-family: var(--font-serif);
		font-size: clamp(1.05rem, 2vw, 1.3rem);
		line-height: 1.58;
	}

	.metadata {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.8rem 1.2rem;
		margin-top: 1.35rem;
		color: var(--ink-faint);
		font-size: 0.75rem;
	}

	.metadata ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.metadata li {
		border: 1px solid var(--rule);
		border-radius: 999px;
		padding: 0.18rem 0.5rem;
	}

	.canvas-section {
		margin-inline: calc(50% - 50vw);
		padding: 1.5rem max(0.75rem, calc((100vw - 88rem) / 2));
	}

	.canvas-heading-row {
		display: flex;
		max-width: 88rem;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin: 0 auto 0.75rem;
	}

	.canvas-heading-row p {
		max-width: 28rem;
		margin: 0;
		color: var(--ink-muted);
		font-size: 0.78rem;
		line-height: 1.45;
	}

	.canvas-heading-row > div > p,
	.section-kicker {
		color: var(--ink-faint);
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.canvas-heading-row h2,
	.transcript h2,
	.related h2 {
		margin: 0.15rem 0 0;
		font-family: var(--font-serif);
		font-size: 1.6rem;
	}

	.transcript,
	.related {
		max-width: 52rem;
		margin: 3.5rem auto 0;
		padding-top: 2rem;
		border-top: 1px solid var(--rule);
	}

	.transcript > p:last-child {
		white-space: pre-wrap;
		color: var(--ink-muted);
		font-family: var(--font-serif);
		font-size: 1.08rem;
		line-height: 1.75;
	}

	.related ul {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		margin: 1rem 0 0;
		padding: 1px;
		background: var(--rule);
		list-style: none;
	}

	.related li {
		background: var(--paper);
	}

	.related a {
		display: grid;
		min-height: 9rem;
		gap: 0.55rem;
		padding: 1rem;
		color: var(--ink);
		text-decoration: none;
	}

	.related a:hover {
		background: var(--paper-raised);
	}

	.related span {
		color: var(--ink-muted);
		font-family: var(--font-serif);
		font-size: 0.85rem;
		line-height: 1.45;
	}

	@media (max-width: 46rem) {
		.canvas-heading-row {
			align-items: start;
			flex-direction: column;
		}

		.related ul {
			grid-template-columns: 1fr;
		}
	}
</style>
