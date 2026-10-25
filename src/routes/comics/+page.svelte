<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import ComicCovers from '$lib/components/comics/ComicCovers.svelte';
	import '$lib/components/comics/comics.css';
	import { formatComicFileSize } from '$lib/content/comics';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<SEO {...data.seo} />

<section class="comics-page" data-comics-gallery aria-labelledby="comics-heading">
	<header class="comics-intro">
		<div>
			<p class="comics-kicker">The illustrated shelf</p>
			<h1 id="comics-heading">Comics.</h1>
		</div>
		<p>
			Stories told in panels. Browse the covers, find the original prose, and download a complete
			PDF to read at your own pace.
		</p>
	</header>
	<ul class="comics-shelf">
		{#each data.comics as comic, index (comic.slug)}
			<li class="comic-edition" data-comic-edition={comic.slug}>
				<div class="comic-edition__art">
					<ComicCovers {comic} linked />
				</div>
				<div>
					<p class="comics-kicker">
						Edition {String(index + 1).padStart(2, '0')} / {comic.genres.join(' · ')}
					</p>
					<h2>
						<a class="comic-title-link" href={resolve('/comics/[slug]', { slug: comic.slug })}
							>{comic.title}</a
						>
					</h2>
					<p class="comic-description">{comic.description}</p>
					<p class="comic-meta">
						<span>{comic.pageCount} pages, covers included</span><span
							>PDF · {formatComicFileSize(comic.pdf.bytes)}</span
						>
					</p>
					<div class="comic-actions">
						<a class="comic-button" href={resolve('/comics/[slug]', { slug: comic.slug })}
							>View comic <span aria-hidden="true">↗</span></a
						>
						<a
							class="comic-text-link"
							href={asset(comic.pdf.href)}
							download={comic.pdf.filename}
							data-sveltekit-preload-data="off"
							>Download PDF <span class="sr-only">— {comic.title}</span></a
						>
					</div>
					<p class="comic-source">
						Adapted from <a href={resolve(comic.source.href)}>the original short story</a> by Suvro Ghosh.
					</p>
				</div>
			</li>
		{/each}
	</ul>
</section>
