<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { SketchArtwork } from '$lib/sketches/types';

	type Props = {
		artworks: SketchArtwork[];
		selectedSlug?: string | null;
		onOpenDetails: (artwork: SketchArtwork) => void;
	};

	let { artworks, selectedSlug = null, onOpenDetails }: Props = $props();
	const pageSize = 48;
	let query = $derived(page.url.searchParams.get('q')?.trim() ?? '');
	let orientation = $derived(page.url.searchParams.get('orientation') ?? '');
	let sort = $derived(page.url.searchParams.get('sort') === 'title' ? 'title' : 'featured');
	let filtered = $derived.by(() => {
		const needle = query.toLocaleLowerCase();
		const results = artworks.filter(
			(artwork) =>
				(!needle ||
					`${artwork.title} ${artwork.description} ${artwork.alt}`
						.toLocaleLowerCase()
						.includes(needle)) &&
				(!orientation || artwork.orientation === orientation)
		);
		return sort === 'title'
			? [...results].sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }))
			: results;
	});
	let pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	let requestedPage = $derived(Number.parseInt(page.url.searchParams.get('page') ?? '1', 10));
	let currentPage = $derived(
		Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1))
	);
	let shown = $derived(filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize));

	function collectionUrl(pageNumber: number, slug?: string) {
		const params = new URLSearchParams();
		if (query) params.set('q', query);
		if (orientation) params.set('orientation', orientation);
		if (sort === 'title') params.set('sort', sort);
		if (pageNumber > 1) params.set('page', String(pageNumber));
		if (slug) params.set('art', slug);
		const search = params.toString();
		return `${resolve('/images/sketches')}${search ? `?${search}` : ''}#${slug ? 'artwork-detail' : 'sketch-collection'}`;
	}

	function openDetails(event: MouseEvent, artwork: SketchArtwork) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
			return;
		event.preventDefault();
		onOpenDetails(artwork);
	}
</script>

<section id="sketch-collection" class="collection" aria-labelledby="collection-heading">
	<header class="collection-header">
		<div>
			<p>Explore the collection</p>
			<h2 id="collection-heading">Browse drawings</h2>
		</div>
		<span>{artworks.length} {artworks.length === 1 ? 'work' : 'works'}</span>
	</header>
	<p class="collection-intro">
		Choose a drawing to see it larger, or <a href="#museum-view-heading">visit the 3D gallery</a>.
	</p>
	<form class="filters" action={resolve('/images/sketches')} method="GET">
		<label
			>Search drawings <input
				name="q"
				type="search"
				value={query}
				placeholder="Search titles and descriptions"
			/></label
		>
		<label
			>Shape
			<select name="orientation" value={orientation}>
				<option value="">All shapes</option>
				<option value="portrait">Portrait</option>
				<option value="landscape">Landscape</option>
				<option value="square">Square</option>
			</select>
		</label>
		<label
			>Order
			<select name="sort" value={sort}>
				<option value="featured">Featured first</option>
				<option value="title">Title A–Z</option>
			</select>
		</label>
		<button type="submit">Apply</button>
		{#if query || orientation || sort === 'title'}<a
				href={resolve('/images/sketches') + '#sketch-collection'}>Clear</a
			>{/if}
	</form>
	<p class="result-count" aria-live="polite">
		{#if filtered.length}Showing {(currentPage - 1) * pageSize + 1}–{Math.min(
				currentPage * pageSize,
				filtered.length
			)} of {filtered.length} drawings{:else}No drawings match these filters.{/if}
	</p>
	{#if shown.length}
		<ul class="collection-grid" aria-label="Sketch collection">
			{#each shown as artwork, index (artwork.slug)}
				<li class:selected={selectedSlug === artwork.slug}>
					<a
						href={collectionUrl(currentPage, artwork.slug)}
						onclick={(event) => openDetails(event, artwork)}
						aria-label={`View details for ${artwork.title}`}
					>
						<figure>
							<div class="image-mat">
								<img
									src={artwork.variants.thumbnail.src}
									srcset={`${artwork.variants.thumbnail.src} ${artwork.variants.thumbnail.width}w, ${artwork.variants.preview.src} ${artwork.variants.preview.width}w`}
									sizes="(max-width: 38rem) 46vw, (max-width: 64rem) 24vw, 15vw"
									alt={artwork.alt}
									width={artwork.variants.thumbnail.width}
									height={artwork.variants.thumbnail.height}
									loading={index < 4 ? 'eager' : 'lazy'}
									decoding="async"
								/>
							</div>
							<figcaption>{artwork.title}</figcaption>
						</figure>
					</a>
				</li>
			{/each}
		</ul>
		{#if pageCount > 1}
			<nav class="pagination" aria-label="Collection pages">
				{#if currentPage > 1}<a href={collectionUrl(currentPage - 1)}>← Previous</a>{:else}<span
						>← Previous</span
					>{/if}
				<span>Page {currentPage} of {pageCount}</span>
				{#if currentPage < pageCount}<a href={collectionUrl(currentPage + 1)}>Next →</a>{:else}<span
						>Next →</span
					>{/if}
				<form action={resolve('/images/sketches')} method="GET" class="jump">
					{#if query}<input type="hidden" name="q" value={query} />{/if}
					{#if orientation}<input type="hidden" name="orientation" value={orientation} />{/if}
					{#if sort === 'title'}<input type="hidden" name="sort" value={sort} />{/if}
					<label
						>Go to page <input
							type="number"
							name="page"
							min="1"
							max={pageCount}
							value={currentPage}
						/></label
					>
					<button type="submit">Go</button>
				</form>
			</nav>
		{/if}
	{/if}
</section>

<style>
	.collection {
		scroll-margin-top: 1rem;
	}
	.collection-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		padding-block: 1rem;
		border-block: 1px solid var(--rule);
	}
	.collection-header p {
		margin: 0 0 0.3rem;
		color: var(--ink-faint);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.collection-header h2 {
		margin: 0;
		font-size: clamp(1.75rem, 4vw, 2.35rem);
	}
	.collection-header > span {
		flex: 0 0 auto;
		color: var(--ink-muted);
		font-size: 0.85rem;
	}
	.collection-intro {
		margin: 0.75rem 0;
		color: var(--ink-muted);
		text-align: left;
	}
	.filters {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin: 1rem 0;
	}
	.filters label,
	.jump label {
		display: grid;
		gap: 0.25rem;
		color: var(--ink-muted);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.filters label:first-child {
		flex: 1 1 15rem;
	}
	input,
	select,
	button {
		min-height: 2.75rem;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--control-border);
		border-radius: 0.3rem;
		color: var(--ink);
		background: var(--paper-raised);
		font: inherit;
	}
	button {
		cursor: pointer;
		font-weight: 700;
	}
	.filters a {
		align-self: center;
	}
	.result-count {
		margin: 0.7rem 0;
		color: var(--ink-muted);
		font-size: 0.82rem;
	}
	.collection-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.collection-grid li {
		min-width: 0;
		border: 1px solid var(--rule);
		border-radius: 0.3rem;
		background: var(--paper-raised);
	}
	.collection-grid li.selected {
		outline: 3px solid var(--ink);
		outline-offset: 2px;
	}
	.collection-grid a {
		display: block;
		height: 100%;
		color: inherit;
		text-decoration: none;
	}
	.collection-grid a:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 3px;
	}
	figure {
		margin: 0;
	}
	.image-mat {
		position: relative;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		background: #e9e5de;
	}
	.image-mat img {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	figcaption {
		padding: 0.4rem 0.5rem 0.55rem;
		font-size: 0.8rem;
		font-weight: 700;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.pagination {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		margin-block: 1.25rem;
	}
	.pagination > a,
	.pagination > span {
		padding: 0.55rem 0;
	}
	.jump {
		display: flex;
		align-items: end;
		gap: 0.4rem;
		margin-left: auto;
	}
	.jump input {
		width: 5rem;
	}
	@media (min-width: 40rem) {
		.collection-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (min-width: 70rem) {
		.collection-grid {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
	}
</style>
