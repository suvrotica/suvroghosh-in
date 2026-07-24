<script lang="ts">
	import { resolve } from '$app/paths';
	import type { SketchArtwork } from '$lib/sketches/types';

	type Props = {
		artworks: SketchArtwork[];
		selectedSlug?: string | null;
		onOpenDetails: (artwork: SketchArtwork) => void;
	};

	let { artworks, selectedSlug = null, onOpenDetails }: Props = $props();

	function openDetails(event: MouseEvent, artwork: SketchArtwork) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		onOpenDetails(artwork);
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${value}T00:00:00Z`));
	}
</script>

<section id="sketch-collection" class="collection" aria-labelledby="collection-heading">
	<header class="collection-header">
		<div>
			<p>Complete, non-WebGL catalogue</p>
			<h2 id="collection-heading">Accessible Collection View</h2>
		</div>
		<span>{artworks.length} {artworks.length === 1 ? 'work' : 'works'}</span>
	</header>

	<p class="collection-intro">
		Every sketch in Museum View is listed here in ordinary document HTML. Open any work for a larger
		inspection, its complete description, and a stable link.
	</p>

	{#if artworks.length > 0}
		<ul class="collection-grid" aria-label="Sketch collection">
			{#each artworks as artwork, index (artwork.slug)}
				<li class:selected={selectedSlug === artwork.slug}>
					<a
						href={resolve(
							`/images/sketches?art=${encodeURIComponent(artwork.slug)}#sketch-collection` as '/images/sketches'
						)}
						onclick={(event) => openDetails(event, artwork)}
						aria-label={`View details for ${artwork.title}`}
					>
						<figure>
							<div class="image-mat">
								<img
									src={artwork.variants.thumbnail.src}
									srcset={`${artwork.variants.thumbnail.src} ${artwork.variants.thumbnail.width}w, ${artwork.variants.preview.src} ${artwork.variants.preview.width}w`}
									sizes="(max-width: 38rem) 92vw, (max-width: 64rem) 44vw, 20rem"
									alt={artwork.alt}
									width={artwork.variants.thumbnail.width}
									height={artwork.variants.thumbnail.height}
									loading={index < 4 ? 'eager' : 'lazy'}
									decoding="async"
								/>
							</div>
							<figcaption>
								<h3>{artwork.title}</h3>
								{#if artwork.description}
									<p>{artwork.description}</p>
								{/if}
								<dl>
									{#if artwork.date}
										<div>
											<dt>Date</dt>
											<dd><time datetime={artwork.date}>{formatDate(artwork.date)}</time></dd>
										</div>
									{/if}
									{#if artwork.medium}
										<div>
											<dt>Medium</dt>
											<dd>{artwork.medium}</dd>
										</div>
									{/if}
									<div>
										<dt>Dimensions</dt>
										<dd>{artwork.source.width} × {artwork.source.height} px</dd>
									</div>
								</dl>
								<span class="view-link">Inspect artwork <span aria-hidden="true">↗</span></span>
							</figcaption>
						</figure>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="empty-collection">
			<h3>The gallery is being prepared.</h3>
			<p>No approved sketches are available in this collection yet.</p>
		</div>
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
		padding-block: 1.25rem;
		border-block: 1px solid var(--rule);
	}

	.collection-header p {
		margin: 0 0 0.3rem;
		color: var(--ink-faint);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.collection-header h2 {
		margin: 0;
		font-size: clamp(1.75rem, 4vw, 2.35rem);
	}

	.collection-header > span {
		flex: 0 0 auto;
		padding: 0.35rem 0.55rem;
		border: 1px solid var(--control-border);
		border-radius: 99rem;
		color: var(--ink-muted);
		font-size: 0.72rem;
		font-weight: 750;
	}

	.collection-intro {
		max-width: 48rem;
		margin: 1.1rem 0 1.4rem;
		color: var(--ink-muted);
		font-size: 0.93rem;
		line-height: 1.65;
		text-align: left;
	}

	.collection-grid {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		gap: 1rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.collection-grid li {
		min-width: 0;
		border: 1px solid var(--rule);
		border-radius: 0.45rem;
		background: var(--paper-raised);
		box-shadow: 0 0.35rem 1.2rem rgb(43 36 28 / 7%);
		transition:
			border-color var(--motion-fast) var(--ease-standard),
			box-shadow var(--motion-medium) var(--ease-standard),
			transform var(--motion-medium) var(--ease-standard);
	}

	.collection-grid li:hover,
	.collection-grid li:focus-within {
		border-color: var(--control-border);
		box-shadow: 0 0.7rem 1.8rem rgb(43 36 28 / 13%);
		transform: translateY(-2px);
	}

	.collection-grid li.selected {
		border-color: var(--ink);
		box-shadow:
			0 0 0 2px var(--paper),
			0 0 0 4px var(--ink);
	}

	.collection-grid a {
		display: block;
		height: 100%;
		color: inherit;
		text-decoration: none;
	}

	.collection-grid a:focus-visible {
		border-radius: 0.45rem;
		outline: 3px solid var(--focus);
		outline-offset: 3px;
	}

	figure {
		display: flex;
		height: 100%;
		flex-direction: column;
		margin: 0;
	}

	.image-mat {
		display: grid;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		place-items: center;
		border-bottom: 1px solid var(--rule);
		background: linear-gradient(135deg, rgb(255 255 255 / 18%), transparent 45%), #d9cfbc;
	}

	.image-mat img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	figcaption {
		display: flex;
		flex: 1;
		flex-direction: column;
		padding: 0.85rem;
	}

	h3 {
		margin: 0;
		font-size: clamp(1rem, 2.5vw, 1.2rem);
		line-height: 1.2;
	}

	figcaption > p {
		display: -webkit-box;
		margin: 0.5rem 0 0;
		overflow: hidden;
		color: var(--ink-muted);
		font-size: 0.8rem;
		line-height: 1.5;
		text-align: left;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}

	dl {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.85rem;
		margin: 0.7rem 0 0;
		color: var(--ink-faint);
		font-size: 0.7rem;
	}

	dl div {
		display: flex;
		gap: 0.25rem;
	}

	dt {
		font-weight: 800;
	}

	dd {
		margin: 0;
	}

	.view-link {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: end;
		gap: 0.2rem;
		margin-top: auto;
		padding-top: 0.75rem;
		color: var(--ink);
		font-size: 0.76rem;
		font-weight: 800;
	}

	.empty-collection {
		padding: 3rem 1.25rem;
		border: 1px solid var(--rule);
		border-radius: 0.45rem;
		text-align: center;
	}

	.empty-collection p {
		margin: 0;
		color: var(--ink-muted);
		text-align: center;
	}

	@media (min-width: 48rem) {
		.collection-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 32rem) {
		.collection-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.collection-grid li {
			transition: none;
		}

		.collection-grid li:hover,
		.collection-grid li:focus-within {
			transform: none;
		}
	}
</style>
