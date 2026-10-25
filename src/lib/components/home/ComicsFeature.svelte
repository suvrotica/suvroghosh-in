<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { comicCatalog } from '$lib/content/comics';

	const comic = comicCatalog[0];
</script>

{#if comic}
	<section class="fb-comics" aria-labelledby="home-comics-heading" data-home-comics>
		<header class="fb-comics__heading">
			<div>
				<p class="fb-comics__eyebrow">The illustrated shelf</p>
				<h2 id="home-comics-heading">Comics<span aria-hidden="true">.</span></h2>
			</div>
			<a class="fb-comics__browse" href={resolve('/comics')}>
				Browse all comics <span aria-hidden="true">↗</span>
			</a>
		</header>

		<article class="fb-comics__feature" aria-labelledby="featured-comic-heading">
			<div class="fb-comics__copy">
				<p class="fb-comics__genre">Featured comic / {comic.genres.join(' · ')}</p>
				<h3 id="featured-comic-heading">
					<a href={resolve('/comics/[slug]', { slug: comic.slug })}>{comic.title}</a>
				</h3>
				<p class="fb-comics__description">{comic.description}</p>
				<p class="fb-comics__edition">
					Full colour <span aria-hidden="true">/</span>
					{comic.pageCount} pages <span aria-hidden="true">/</span> PDF
				</p>
				<a class="fb-comics__open" href={resolve('/comics/[slug]', { slug: comic.slug })}>
					View comic &amp; download <span aria-hidden="true">↗</span>
				</a>
			</div>

			<div class="fb-comics__covers" aria-label="Front and back covers of the featured comic">
				{#each [{ kind: 'front', label: 'Front cover', image: comic.frontCover }, { kind: 'back', label: 'Back cover', image: comic.backCover }] as cover (cover.kind)}
					<figure class="fb-comics__cover">
						<a
							href={resolve('/comics/[slug]', { slug: comic.slug })}
							aria-label={`View ${comic.title} — ${cover.label.toLowerCase()}`}
							data-comic-cover={cover.kind}
						>
							<img
								src={asset(cover.image.src)}
								alt={cover.image.alt}
								width={cover.image.width}
								height={cover.image.height}
								loading="lazy"
								decoding="async"
							/>
						</a>
						<figcaption><span>{cover.label}</span><span aria-hidden="true">↗</span></figcaption>
					</figure>
				{/each}
			</div>
		</article>
	</section>
{/if}

<style>
	.fb-comics {
		min-width: 0;
		margin-top: clamp(2rem, 4vw, 4rem);
		padding-block: clamp(3rem, 6vw, 6rem);
		border-top: 1px solid var(--fb-rule);
		color: var(--fb-ink);
	}
	.fb-comics__heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: clamp(2rem, 4vw, 3.5rem);
	}
	.fb-comics__eyebrow,
	.fb-comics__genre,
	.fb-comics__edition,
	.fb-comics__cover figcaption {
		font-family: var(--fb-mono);
		font-size: 0.65rem;
		font-weight: 400;
		line-height: 1.7;
	}
	.fb-comics__eyebrow {
		margin: 0 0 0.75rem;
		color: var(--fb-muted);
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.fb-comics h2 {
		margin: 0;
		font-family: var(--fb-serif);
		font-size: clamp(2.4rem, 4vw, 4rem);
		font-weight: 400;
		line-height: 1;
		letter-spacing: -0.045em;
	}
	.fb-comics h2 > span,
	.fb-comics__open > span {
		color: var(--fb-accent);
	}
	.fb-comics__browse,
	.fb-comics__open {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.9rem;
		color: var(--fb-ink);
		font-family: var(--fb-sans);
		font-size: 0.8rem;
		font-weight: 600;
		text-decoration-color: var(--fb-rule);
		text-underline-offset: 0.35rem;
	}
	.fb-comics__browse {
		flex-shrink: 0;
		font-weight: 400;
	}
	.fb-comics__feature {
		display: grid;
		grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
		align-items: center;
		gap: clamp(2rem, 5vw, 5rem);
	}
	.fb-comics__copy {
		min-width: 0;
	}
	.fb-comics__genre {
		margin: 0 0 1rem;
		color: var(--fb-teal);
	}
	.fb-comics h3 {
		max-width: 19ch;
		margin: 0;
		font-family: var(--fb-serif);
		font-size: clamp(2rem, 3.6vw, 3.6rem);
		font-weight: 450;
		line-height: 1.04;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}
	.fb-comics h3 a {
		color: inherit;
		text-decoration: none;
	}
	.fb-comics__description {
		max-width: 45ch;
		margin: 1.4rem 0 0;
		color: var(--fb-muted);
		font-family: var(--fb-sans);
		font-size: 0.93rem;
		line-height: 1.75;
	}
	.fb-comics__edition {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.7rem;
		margin: 1.3rem 0 0.6rem;
		color: var(--fb-muted);
	}
	.fb-comics__edition > span {
		color: var(--fb-rule);
	}
	.fb-comics__covers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: clamp(0.9rem, 2vw, 1.75rem);
		min-width: 0;
	}
	.fb-comics__cover {
		min-width: 0;
		margin: 0;
	}
	.fb-comics__cover > a {
		display: block;
		min-height: 2.75rem;
		border: 1px solid var(--fb-rule);
		background: var(--fb-surface);
		box-shadow:
			3px 3px 0 var(--fb-surface),
			4px 4px 0 var(--fb-rule),
			0 12px 22px rgb(0 0 0 / 0.08);
		transition:
			transform 180ms ease,
			box-shadow 180ms ease;
	}
	.fb-comics__cover img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 2 / 3;
		object-fit: contain;
	}
	.fb-comics__cover figcaption {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.9rem;
		color: var(--fb-muted);
	}
	.fb-comics a:hover {
		color: var(--fb-teal);
	}
	.fb-comics__cover > a:hover {
		transform: translateY(-3px);
		box-shadow:
			3px 5px 0 var(--fb-surface),
			4px 6px 0 var(--fb-rule),
			0 15px 26px rgb(0 0 0 / 0.1);
	}
	.fb-comics a:focus-visible {
		outline: 2px solid var(--fb-teal);
		outline-offset: 6px;
	}
	@media (max-width: 56rem) {
		.fb-comics__feature {
			grid-template-columns: minmax(0, 1fr);
			gap: 2rem;
		}
		.fb-comics__copy {
			max-width: 40rem;
		}
		.fb-comics h3 {
			max-width: 23ch;
			font-size: clamp(2rem, 5.5vw, 3rem);
		}
		.fb-comics__covers {
			max-width: 42rem;
		}
	}
	@media (max-width: 38rem) {
		.fb-comics__heading {
			gap: 1rem;
		}
		.fb-comics__browse {
			gap: 0.5rem;
			font-size: 0.7rem;
		}
		.fb-comics__description {
			margin-top: 1rem;
			font-size: 0.88rem;
		}
		.fb-comics__genre,
		.fb-comics__edition,
		.fb-comics__cover figcaption {
			font-size: 0.6rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fb-comics__cover > a {
			transition: none;
		}
		.fb-comics__cover > a:hover {
			transform: none;
		}
	}
</style>
