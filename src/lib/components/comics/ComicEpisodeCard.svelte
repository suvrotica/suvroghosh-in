<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ComicEpisodeMetadata } from '$lib/comics/schema';

	let {
		episode,
		href
	}: {
		episode: ComicEpisodeMetadata;
		href: string;
	} = $props();
</script>

<article class="comic-episode-card">
	<a href={resolve(href as '/')}>
		<div class="comic-episode-card__cover">
			{#if episode.cover}
				<img src={episode.cover} alt={episode.coverAlt} loading="lazy" />
			{:else}
				<div role="img" aria-label={episode.coverAlt}>
					<span>Album {Number.parseInt(episode.id, 10)}</span>
					<strong>{episode.title}</strong>
					<small>Golmohar Junction</small>
				</div>
			{/if}
		</div>
		<div class="comic-episode-card__body">
			<p>{episode.published ? 'Complete album' : 'Production edition'}</p>
			<h3>{episode.title}</h3>
			<p>{episode.description}</p>
			<span>Start reading <span aria-hidden="true">→</span></span>
		</div>
	</a>
</article>

<style>
	.comic-episode-card {
		overflow: hidden;
		border: 1px solid #b7a98d;
		background: #fff9e9;
		box-shadow: 0 0.7rem 1.5rem rgb(31 27 22 / 0.13);
	}

	.comic-episode-card > a {
		display: grid;
		grid-template-columns: minmax(9rem, 0.75fr) minmax(0, 1.25fr);
		color: #29241d;
		text-decoration: none;
	}

	.comic-episode-card__cover {
		min-height: 16rem;
		background: #466673;
	}

	.comic-episode-card__cover img,
	.comic-episode-card__cover div {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.comic-episode-card__cover div {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		background:
			linear-gradient(25deg, rgb(142 52 45 / 0.92) 0 42%, transparent 42%),
			linear-gradient(155deg, rgb(232 195 95 / 0.68) 0 35%, transparent 35%), #315f72;
		padding: 1rem;
		color: #fff9e9;
	}

	.comic-episode-card__cover span,
	.comic-episode-card__cover small,
	.comic-episode-card__body > p:first-child {
		font:
			750 0.7rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.comic-episode-card__cover strong {
		margin: 0.35rem 0;
		font-size: clamp(1.3rem, 4vw, 2rem);
		line-height: 0.95;
	}

	.comic-episode-card__body {
		display: flex;
		flex-direction: column;
		padding: clamp(1rem, 3vw, 1.75rem);
	}

	.comic-episode-card__body > p:first-child {
		margin: 0 0 0.45rem;
		color: #8e342d;
	}

	.comic-episode-card__body h3 {
		margin: 0;
		font-size: clamp(1.45rem, 4vw, 2.2rem);
	}

	.comic-episode-card__body p {
		text-align: left;
	}

	.comic-episode-card__body > span {
		margin-top: auto;
		font:
			750 0.85rem/1.2 Roboto,
			Arial,
			sans-serif;
	}

	.comic-episode-card a:hover h3 {
		color: #8e342d;
	}

	@media (max-width: 35rem) {
		.comic-episode-card > a {
			grid-template-columns: 1fr;
		}

		.comic-episode-card__cover {
			min-height: 13rem;
		}
	}
</style>
