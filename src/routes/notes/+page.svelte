<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { collectionPageSchema, siteUrl, withSiteGraph } from '$lib/components/seo/SEO';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const title = 'Handwritten Notes | Suvro Ghosh';
	const description =
		'Handwritten field notes, diagrams, marginalia, and visual thinking by Suvro Ghosh.';
	const canonicalUrl = `${siteUrl}/notes`;
	const socialImageUrl = `${siteUrl}/images/handwritten-notes-social-card.png`;

	function formatDate(value: string | null) {
		if (!value) return '';
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(value));
	}
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	ogImageUrl={socialImageUrl}
	ogImageAlt="Handwritten Notes by SuvroGhosh.IN, arranged as charcoal marks and movable paper tiles"
	ogImageWidth={1200}
	ogImageHeight={630}
	schema={withSiteGraph([
		collectionPageSchema({
			name: 'Handwritten Notes',
			description,
			url: canonicalUrl,
			about: 'Handwritten notes and visual thinking'
		})
	])}
/>

<header class="notes-index-header">
	<p class="eyebrow">Ink, diagrams, and field notes</p>
	<h1>Handwritten notes</h1>
	<p>
		A public shelf of pages made with pen, pressure, images, and movable fragments. Open a note to
		pan around it, zoom in, or fit the complete page to your screen.
	</p>
</header>

<form class="notes-search" method="GET" role="search">
	<label for="notes-query">Search published notes</label>
	<div>
		<input
			id="notes-query"
			name="q"
			type="search"
			value={data.query}
			maxlength="100"
			placeholder="Title, transcript, or subject"
		/>
		<button type="submit">Search</button>
	</div>
</form>

{#if data.notes.length > 0}
	<ol class="notes-list">
		{#each data.notes as note (note.id)}
			<li>
				<a href={resolve('/notes/[slug]', { slug: note.slug })}>
					<div class="note-card-topline">
						<span>{note.category ?? 'Notebook'}</span>
						{#if note.publishedAt}
							<time datetime={note.publishedAt}>{formatDate(note.publishedAt)}</time>
						{/if}
					</div>
					<h2>{note.title}</h2>
					{#if note.excerpt}
						<p>{note.excerpt}</p>
					{/if}
					{#if note.tags.length > 0}
						<ul aria-label="Tags">
							{#each note.tags as tag (tag)}
								<li>{tag}</li>
							{/each}
						</ul>
					{/if}
					<span class="open-note">Open canvas <span aria-hidden="true">→</span></span>
				</a>
			</li>
		{/each}
	</ol>

	{#if data.total > data.pageSize}
		<nav class="pagination" aria-label="Notes pages">
			{#if data.page > 1}
				<a
					href={resolve(
						`/notes?q=${encodeURIComponent(data.query)}&page=${data.page - 1}` as '/notes'
					)}>Previous</a
				>
			{/if}
			<span>Page {data.page} of {Math.ceil(data.total / data.pageSize)}</span>
			{#if data.page * data.pageSize < data.total}
				<a
					href={resolve(
						`/notes?q=${encodeURIComponent(data.query)}&page=${data.page + 1}` as '/notes'
					)}>Next</a
				>
			{/if}
		</nav>
	{/if}
{:else}
	<section class="notes-empty" aria-labelledby="notes-empty-heading">
		<p aria-hidden="true">○ · · · ○</p>
		<h2 id="notes-empty-heading">No published note matched that search.</h2>
		<p>Try a broader phrase, or return to the complete handwritten shelf.</p>
		{#if data.query}
			<a href={resolve('/notes')}>Clear search</a>
		{/if}
	</section>
{/if}

<style>
	.notes-index-header {
		margin-bottom: 2.25rem;
		padding: 2rem 0 2.25rem;
		border-block: 1px solid var(--rule);
	}

	.eyebrow {
		margin: 0 0 0.6rem;
		color: var(--ink-faint);
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		color: var(--ink);
		font-family: var(--font-serif);
		font-size: clamp(2.5rem, 8vw, 5.25rem);
		font-weight: 650;
		letter-spacing: -0.035em;
		line-height: 0.98;
	}

	.notes-index-header > p:last-child {
		max-width: 44rem;
		margin: 1.2rem 0 0;
		color: var(--ink-muted);
		font-family: var(--font-serif);
		font-size: clamp(1.05rem, 2vw, 1.28rem);
		line-height: 1.65;
	}

	.notes-search {
		margin-bottom: 2rem;
	}

	.notes-search > label {
		display: block;
		margin-bottom: 0.4rem;
		color: var(--ink-muted);
		font-size: 0.78rem;
		font-weight: 750;
	}

	.notes-search > div {
		display: flex;
		gap: 0.5rem;
	}

	.notes-search input {
		min-width: 0;
		flex: 1;
		min-height: 3rem;
		border: 1px solid var(--control-border);
		border-radius: 0.4rem;
		background: var(--paper-raised);
		padding: 0.65rem 0.8rem;
		color: var(--ink);
	}

	.notes-search button,
	.notes-empty a,
	.pagination a {
		display: inline-flex;
		min-height: 3rem;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--ink);
		border-radius: 0.4rem;
		background: var(--ink);
		padding: 0.6rem 1rem;
		color: var(--paper);
		font-weight: 750;
		text-decoration: none;
	}

	.notes-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		margin: 0;
		padding: 1px;
		background: var(--rule);
		list-style: none;
	}

	.notes-list > li {
		min-width: 0;
		background: var(--paper);
	}

	.notes-list > li > a {
		display: flex;
		min-height: 18rem;
		flex-direction: column;
		padding: 1.5rem;
		color: var(--ink);
		text-decoration: none;
		transition:
			background-color var(--motion-fast) var(--ease-standard),
			transform var(--motion-medium) var(--ease-emphatic);
	}

	.notes-list > li > a:hover {
		background: var(--paper-raised);
	}

	.notes-list > li > a:focus-visible {
		position: relative;
		z-index: 2;
		outline: 3px solid var(--focus);
		outline-offset: 3px;
	}

	.note-card-topline {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: var(--ink-faint);
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.notes-list h2 {
		margin: 2.2rem 0 0.8rem;
		font-family: var(--font-serif);
		font-size: clamp(1.65rem, 4vw, 2.25rem);
		font-weight: 650;
		line-height: 1.08;
	}

	.notes-list p {
		margin: 0;
		color: var(--ink-muted);
		font-family: var(--font-serif);
		line-height: 1.55;
	}

	.notes-list ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;
	}

	.notes-list ul li {
		border: 1px solid var(--rule);
		border-radius: 999px;
		padding: 0.2rem 0.5rem;
		color: var(--ink-muted);
		font-size: 0.7rem;
	}

	.open-note {
		margin-top: auto;
		padding-top: 1.5rem;
		font-size: 0.8rem;
		font-weight: 800;
	}

	.notes-empty {
		border-block: 1px solid var(--rule);
		padding: 4rem 1rem;
		text-align: center;
	}

	.notes-empty > p:first-child {
		color: var(--ink-faint);
		letter-spacing: 0.4em;
	}

	.notes-empty h2 {
		font-family: var(--font-serif);
		font-size: 1.8rem;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: 2rem;
	}

	.pagination a {
		min-height: 2.75rem;
		background: transparent;
		color: var(--ink);
	}

	.pagination span {
		color: var(--ink-muted);
		font-size: 0.8rem;
	}

	@media (max-width: 42rem) {
		.notes-list {
			grid-template-columns: 1fr;
		}

		.notes-list > li > a {
			min-height: 15rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.notes-list > li > a {
			transition: none;
		}
	}
</style>
