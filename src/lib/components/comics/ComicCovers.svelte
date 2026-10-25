<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import type { Comic } from '$lib/content/comics';

	let {
		comic,
		linked = false,
		eager = false
	}: { comic: Comic; linked?: boolean; eager?: boolean } = $props();
</script>

<div class="comic-covers" data-comic-covers>
	{#each [{ image: comic.frontCover, label: 'Front cover' }, { image: comic.backCover, label: 'Back cover' }] as cover (cover.label)}
		<figure>
			{#if linked}
				<a
					href={resolve('/comics/[slug]', { slug: comic.slug })}
					aria-label={`${comic.title} — ${cover.label.toLowerCase()}`}
				>
					<img
						src={asset(cover.image.src)}
						alt={cover.image.alt}
						width={cover.image.width}
						height={cover.image.height}
						loading={eager ? 'eager' : 'lazy'}
						decoding="async"
					/>
				</a>
			{:else}
				<img
					src={asset(cover.image.src)}
					alt={cover.image.alt}
					width={cover.image.width}
					height={cover.image.height}
					loading={eager ? 'eager' : 'lazy'}
					decoding="async"
				/>
			{/if}
			<figcaption>{cover.label}</figcaption>
		</figure>
	{/each}
</div>

<style>
	.comic-covers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: clamp(0.7rem, 2vw, 1.4rem);
		align-items: start;
	}
	figure {
		margin: 0;
		min-width: 0;
	}
	a {
		display: block;
		border-radius: 2px;
		outline-offset: 6px;
	}
	a:focus-visible {
		outline: 3px solid var(--focus);
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 2 / 3;
		border: 1px solid var(--rule);
		border-radius: 2px;
		box-shadow: 0 8px 20px rgb(0 0 0 / 0.14);
	}
	figcaption {
		margin-top: 0.8rem;
		color: var(--ink-muted);
		font: 500 0.65rem/1.4 var(--font-sans, sans-serif);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
</style>
