<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import ComicCovers from '$lib/components/comics/ComicCovers.svelte';
	import '$lib/components/comics/comics.css';
	import { formatComicFileSize } from '$lib/content/comics';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let comic = $derived(data.comic);
	let publicationDate = $derived(
		new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${comic.published}T00:00:00Z`))
	);
</script>

<SEO {...data.seo} />

<section class="comics-page" data-comic-detail>
	<nav class="comic-breadcrumb" aria-label="Breadcrumb">
		<a href={resolve('/')}>Home</a><span aria-hidden="true">/</span><a href={resolve('/comics')}
			>Comics</a
		>
	</nav>
	<div class="comic-detail">
		<div class="comic-detail__art"><ComicCovers {comic} eager /></div>
		<div class="comic-detail__info">
			<p class="comics-kicker">A comic adaptation / {comic.genres.join(' · ')}</p>
			<h1>{comic.title}</h1>
			<p class="comic-byline">Original story by Suvro Ghosh</p>
			<p class="comic-description">{comic.description}</p>
			<div class="comic-actions">
				<a
					class="comic-button"
					href={asset(comic.pdf.href)}
					download={comic.pdf.filename}
					data-sveltekit-preload-data="off"
					data-comic-download>Download PDF <span aria-hidden="true">↓</span></a
				>
				<a class="comic-text-link" href={resolve(comic.source.href)}
					>Read the original story <span aria-hidden="true">↗</span></a
				>
			</div>
			<p class="comic-reading-note">
				{formatComicFileSize(comic.pdf.bytes)} · Complete edition with both covers. Read on a tablet or
				desktop; zoom in for the lettering on a phone.
			</p>
			<dl class="comic-facts">
				<div>
					<dt>Edition</dt>
					<dd>{comic.pageCount} pages</dd>
				</div>
				<div>
					<dt>Inside</dt>
					<dd>{comic.storyPageCount} story pages + 2 covers</dd>
				</div>
				<div>
					<dt>Format</dt>
					<dd>Colour PDF · English</dd>
				</div>
				<div>
					<dt>Published</dt>
					<dd><time datetime={comic.published}>{publicationDate}</time></dd>
				</div>
			</dl>
			<p class="comic-credits">
				Comic adaptation and AI-generated artwork produced with Codex. Based on <a
					class="comic-source"
					href={resolve(comic.source.href)}>{comic.source.title}</a
				> by Suvro Ghosh.
			</p>
		</div>
	</div>
</section>
