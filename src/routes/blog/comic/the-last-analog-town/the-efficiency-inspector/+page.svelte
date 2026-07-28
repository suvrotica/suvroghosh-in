<script lang="ts">
	import { resolve } from '$app/paths';
	import ComicCredits from '$lib/components/comics/ComicCredits.svelte';
	import ComicReader from '$lib/components/comics/ComicReader.svelte';
	import ComicTranscript from '$lib/components/comics/ComicTranscript.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		absoluteUrl,
		breadcrumbSchema,
		personId,
		siteUrl,
		websiteId,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const episode = $derived(data.episode);
	const metadata = $derived(episode.metadata);
	const canonicalUrl = $derived(`${siteUrl}${metadata.canonicalPath}`);
	const title = $derived(`${metadata.title} | ${data.series.title}`);
	const coverUrl = $derived(
		metadata.cover ??
			'/images/comics/the-last-analog-town/the-efficiency-inspector/cover__lettered__r1.webp'
	);
	const endMatter = $derived(episode.frontMatter?.productionEndMatter);
	const robots = $derived(
		metadata.published
			? 'index,follow,max-snippet:-1,max-image-preview:large'
			: 'noindex,follow,noarchive'
	);
	const finalPanelCount = $derived(
		episode.pages.reduce((count, page) => count + page.panels.length, 0)
	);
</script>

<SEO
	{title}
	description={metadata.description}
	{canonicalUrl}
	ogImageUrl={absoluteUrl(coverUrl)}
	ogImageAlt={metadata.coverAlt}
	keywords={metadata.tags}
	type="article"
	publishedTime={metadata.date}
	modifiedTime={metadata.dateModified}
	category="Comic"
	tags={metadata.tags}
	{robots}
	schema={withSiteGraph([
		{
			'@type': 'CreativeWork',
			'@id': `${canonicalUrl}#album`,
			name: metadata.title,
			alternateName: metadata.subtitle,
			description: metadata.description,
			url: canonicalUrl,
			dateCreated: metadata.date,
			dateModified: metadata.dateModified,
			creator: { '@id': personId },
			isPartOf: [
				{ '@id': `${siteUrl}/blog/comic/the-last-analog-town#series` },
				{ '@id': websiteId }
			],
			genre: ['Adventure comic', 'Political satire', 'Technology satire'],
			keywords: metadata.tags,
			inLanguage: metadata.language,
			isAccessibleForFree: true,
			accessMode: ['visual', 'textual'],
			accessibilityFeature: ['alternativeText', 'readingOrder', 'transcript']
		},
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Comic', url: `${siteUrl}/blog/comic` },
			{ name: data.series.title, url: `${siteUrl}/blog/comic/the-last-analog-town` },
			{ name: metadata.title, url: canonicalUrl }
		])
	])}
/>

<article class="episode-page page-enter">
	<nav aria-label="Breadcrumb" class="episode-page__breadcrumbs">
		<a href={resolve('/blog/comic')}>Comic</a>
		<span aria-hidden="true">/</span>
		<a href={resolve('/blog/comic/the-last-analog-town')}>{data.series.title}</a>
		<span aria-hidden="true">/</span>
		<span aria-current="page">{metadata.title}</span>
	</nav>

	{#if !metadata.published}
		<aside class="episode-page__production-status" aria-labelledby="production-status-heading">
			<div>
				<p>Unpublished production edition</p>
				<h2 id="production-status-heading">
					The illustrated album is complete; publication approvals remain
				</h2>
			</div>
			<p>
				All 62 story pages use final panel art and deterministic comic lettering. This page remains
				excluded from search-engine indexing until recorded rights, Bengali-language, cultural,
				accessibility, edition, and final editorial gates pass.
			</p>
		</aside>
	{/if}

	<header class="episode-page__hero">
		<div class="episode-page__cover">
			<img src={coverUrl} alt={metadata.coverAlt} />
		</div>
		<div class="episode-page__introduction">
			<p>Album 001 · complete 62-page story</p>
			<h1>{metadata.title}</h1>
			<p>{metadata.subtitle}</p>
			<p>{metadata.description}</p>
			<dl>
				<div>
					<dt>Category</dt>
					<dd>Comic</dd>
				</div>
				<div>
					<dt>Story pages</dt>
					<dd>{metadata.storyPageCount}</dd>
				</div>
				<div>
					<dt>Scripted panels</dt>
					<dd>{finalPanelCount}</dd>
				</div>
				<div>
					<dt>Reading time</dt>
					<dd>About 55–75 minutes</dd>
				</div>
				<div>
					<dt>{metadata.published ? 'Published' : 'Production dated'}</dt>
					<dd>{metadata.date}</dd>
				</div>
				<div>
					<dt>Updated</dt>
					<dd>{metadata.dateModified}</dd>
				</div>
			</dl>
		</div>
	</header>

	<section class="episode-page__guidance" aria-labelledby="content-guidance-heading">
		<div>
			<h2 id="content-guidance-heading">Content guidance</h2>
			<ul>
				{#each metadata.contentGuidance as guidance (guidance)}
					<li>{guidance}</li>
				{/each}
			</ul>
		</div>
		<p>
			Read with the interactive panel/page reader, jump to the complete text transcript, or download
			the printable production edition.
		</p>
		<div>
			<a href="#reader">Start reading</a>
			<a href="#transcript">Text transcript</a>
			<a href={resolve(metadata.printPath as '/')}>Printable edition</a>
		</div>
	</section>

	<section id="reader" aria-labelledby="reader-heading" class="episode-page__reader">
		<header>
			<p>Responsive web edition</p>
			<h2 id="reader-heading">Read the album</h2>
			<p>
				Use Left/Right or Page Up/Page Down to move, Home/End to jump, T for the transcript, and +/−
				to zoom.
			</p>
		</header>
		<ComicReader {episode} />
	</section>

	<section class="episode-page__credits" aria-labelledby="credits-heading">
		<h2 id="credits-heading">Credits and production state</h2>
		<ComicCredits {metadata} />
		<p class="episode-page__rights">
			Original story and production sources. Imported or generated artwork requires panel-level
			provenance and explicit publication approval.
		</p>
	</section>

	<nav class="episode-page__album-navigation" aria-label="Previous and next comic albums">
		<div>
			<span>Previous album</span>
			<strong>This is the first Golmohar Junction album.</strong>
		</div>
		<div>
			<span>Next album</span>
			<strong>Not yet published.</strong>
		</div>
	</nav>

	{#if endMatter}
		<section class="episode-page__end-matter" aria-labelledby="end-matter-heading">
			<header>
				<p>After the story</p>
				<h2 id="end-matter-heading">{endMatter.heading}</h2>
			</header>
			<p>{endMatter.publicEditionText}</p>
			<h3>{endMatter.hybridRulesHeading}</h3>
			<ol>
				{#each endMatter.hybridRules as rule (rule)}
					<li>{rule}</li>
				{/each}
			</ol>
			<p>{endMatter.secondAlbumPromise}</p>
		</section>
	{/if}

	<section class="episode-page__transcript" aria-labelledby="transcript-heading">
		<header>
			<p>Accessible edition</p>
			<h2 id="transcript-heading">Complete text transcript</h2>
			<p>
				Every panel appears once, in reading order, with visual description, captions, dialogue,
				sound, and relevant visual jokes.
			</p>
		</header>
		<ComicTranscript {episode} />
	</section>

	{#if data.related.length}
		<section class="episode-page__related" aria-labelledby="related-heading">
			<header>
				<p>Continue through the library</p>
				<h2 id="related-heading">Related essays and stories</h2>
			</header>
			<div>
				{#each data.related as item (item.slug)}
					<a
						href={resolve('/blog/[category]/[slug]', {
							category: item.categorySlug,
							slug: item.slug
						})}
					>
						<span>{item.label}</span>
						<h3>{item.title}</h3>
						<p>{item.description}</p>
						<small>Shared themes: {item.sharedTags.join(' · ')}</small>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<footer class="episode-page__footer">
		<p>
			<strong>End of Album One.</strong> The adventure concludes here; the town’s new hybrid rules and
			its unresolved contradictions continue into future standalone albums.
		</p>
		<a href={resolve('/blog/comic/the-last-analog-town')}>Return to the series</a>
	</footer>
</article>

<style>
	.episode-page {
		--episode-ink: #201c17;
		--episode-paper: #fff9e9;
		--episode-red: #8e342d;
		--episode-blue: #315f72;
		color: var(--episode-ink);
	}

	.episode-page__breadcrumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
		color: #675d50;
		font:
			650 0.78rem/1.3 Roboto,
			Arial,
			sans-serif;
	}

	.episode-page__production-status {
		display: grid;
		grid-template-columns: minmax(15rem, 0.75fr) minmax(0, 1.25fr);
		gap: 1.25rem;
		border: 1px solid #c19b3b;
		background: #fff2bd;
		padding: 1rem;
	}

	.episode-page__production-status h2,
	.episode-page__production-status p {
		margin: 0;
		text-align: left;
	}

	.episode-page__production-status > div > p,
	.episode-page__reader > header > p:first-child,
	.episode-page__transcript > header > p:first-child {
		color: var(--episode-red);
		font:
			750 0.7rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.episode-page__hero {
		display: grid;
		grid-template-columns: minmax(17rem, 0.75fr) minmax(0, 1.25fr);
		margin-top: 1.5rem;
		border-block: 3px solid var(--episode-ink);
		background: var(--episode-paper);
	}

	.episode-page__cover {
		min-height: 36rem;
	}

	.episode-page__cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.episode-page__introduction > p:first-child {
		font:
			750 0.76rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.episode-page__introduction {
		padding: clamp(1.5rem, 5vw, 4rem);
	}

	.episode-page__introduction > p:first-child {
		margin: 0 0 0.5rem;
		color: var(--episode-red);
	}

	.episode-page__introduction h1 {
		margin: 0;
		font-size: clamp(3rem, 7vw, 6.5rem);
		line-height: 0.87;
	}

	.episode-page__introduction > p:nth-of-type(2) {
		margin-top: 0.8rem;
		font-size: 1.25rem;
		font-weight: 700;
	}

	.episode-page__introduction > p {
		text-align: left;
	}

	.episode-page__introduction dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem 1.2rem;
		margin-top: 1.5rem;
		border-top: 1px solid #b7aa91;
		padding-top: 1rem;
	}

	.episode-page__introduction dl > div {
		display: grid;
		gap: 0.1rem;
	}

	.episode-page__introduction dt {
		color: #756a5b;
		font:
			650 0.68rem/1.2 Roboto,
			Arial,
			sans-serif;
		text-transform: uppercase;
	}

	.episode-page__introduction dd {
		margin: 0;
		font-weight: 700;
	}

	.episode-page__guidance {
		display: grid;
		grid-template-columns: minmax(15rem, 0.8fr) minmax(15rem, 1fr) auto;
		align-items: center;
		gap: 1rem;
		border-bottom: 1px solid #b7aa91;
		background: #edf2ef;
		padding: 1rem;
	}

	.episode-page__guidance h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.episode-page__guidance ul {
		margin: 0.35rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
	}

	.episode-page__guidance p {
		margin: 0;
		text-align: left;
		font-size: 0.9rem;
	}

	.episode-page__guidance > div:last-child {
		display: grid;
		gap: 0.3rem;
		font:
			700 0.75rem/1.2 Roboto,
			Arial,
			sans-serif;
	}

	.episode-page__reader,
	.episode-page__credits,
	.episode-page__album-navigation,
	.episode-page__transcript,
	.episode-page__related,
	.episode-page__end-matter {
		margin-top: clamp(3rem, 7vw, 5rem);
	}

	.episode-page__reader > header,
	.episode-page__transcript > header {
		margin-bottom: 1rem;
		border-bottom: 2px solid var(--episode-ink);
		padding-bottom: 0.75rem;
	}

	.episode-page__reader > header h2,
	.episode-page__transcript > header h2,
	.episode-page__credits > h2 {
		margin: 0;
		font-size: clamp(2rem, 5vw, 3.7rem);
	}

	.episode-page__reader > header p,
	.episode-page__transcript > header p {
		max-width: 52rem;
		margin-bottom: 0;
		text-align: left;
	}

	.episode-page__credits {
		border-block: 2px solid var(--episode-ink);
		background: var(--episode-paper);
		padding: clamp(1.25rem, 4vw, 2rem);
	}

	.episode-page__rights {
		margin: 1rem 0 0;
		border-top: 1px solid #b7aa91;
		padding-top: 0.8rem;
		text-align: left;
		font-size: 0.85rem;
	}

	.episode-page__album-navigation {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border-block: 1px solid #b7aa91;
	}

	.episode-page__album-navigation > div {
		display: grid;
		gap: 0.25rem;
		padding: 1rem;
	}

	.episode-page__album-navigation > div + div {
		border-left: 1px solid #b7aa91;
		text-align: right;
	}

	.episode-page__album-navigation span {
		color: var(--episode-red);
		font:
			700 0.7rem/1.2 Roboto,
			Arial,
			sans-serif;
		text-transform: uppercase;
	}

	.episode-page__footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		margin-top: 3rem;
		border-top: 1px solid #b7aa91;
		padding-top: 1.25rem;
	}

	.episode-page__end-matter {
		border: 1px solid #b7aa91;
		background: var(--episode-paper);
		padding: clamp(1.2rem, 4vw, 2.4rem);
	}

	.episode-page__end-matter header {
		border-bottom: 2px solid var(--episode-ink);
		padding-bottom: 0.8rem;
	}

	.episode-page__end-matter header p {
		margin: 0;
		color: var(--episode-red);
		font:
			750 0.7rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.12em;
		text-align: left;
		text-transform: uppercase;
	}

	.episode-page__end-matter h2 {
		margin: 0.35rem 0 0;
		font-size: clamp(2rem, 5vw, 3.4rem);
	}

	.episode-page__end-matter h3 {
		margin-top: 2rem;
	}

	.episode-page__end-matter > p {
		max-width: 60rem;
		text-align: left;
	}

	.episode-page__end-matter ol {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem 2rem;
		padding-left: 1.6rem;
	}

	.episode-page__end-matter li {
		padding-left: 0.25rem;
		line-height: 1.45;
	}

	.episode-page__related > header {
		margin-bottom: 1rem;
		border-bottom: 2px solid var(--episode-ink);
		padding-bottom: 0.7rem;
	}

	.episode-page__related > header p {
		margin: 0;
		color: var(--episode-red);
		font:
			750 0.7rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.12em;
		text-align: left;
		text-transform: uppercase;
	}

	.episode-page__related > header h2 {
		margin: 0.3rem 0 0;
		font-size: clamp(2rem, 5vw, 3.4rem);
	}

	.episode-page__related > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.episode-page__related a {
		display: flex;
		flex-direction: column;
		border: 1px solid #b7aa91;
		background: var(--episode-paper);
		padding: 1rem;
		color: var(--episode-ink);
		text-decoration: none;
	}

	.episode-page__related a > span,
	.episode-page__related a > small {
		color: var(--episode-red);
		font:
			700 0.7rem/1.3 Roboto,
			Arial,
			sans-serif;
		text-transform: uppercase;
	}

	.episode-page__related h3 {
		margin: 0.45rem 0 0;
	}

	.episode-page__related a p {
		text-align: left;
		font-size: 0.9rem;
	}

	.episode-page__related a > small {
		margin-top: auto;
	}

	.episode-page__footer p {
		max-width: 50rem;
		margin: 0;
		text-align: left;
	}

	.episode-page__footer a {
		flex: none;
		font-weight: 700;
	}

	@media (max-width: 58rem) {
		.episode-page__hero,
		.episode-page__production-status,
		.episode-page__guidance {
			grid-template-columns: 1fr;
		}

		.episode-page__cover {
			min-height: 24rem;
		}

		.episode-page__guidance > div:last-child {
			display: flex;
			flex-wrap: wrap;
			gap: 1rem;
		}
	}

	@media (max-width: 40rem) {
		.episode-page__introduction dl {
			grid-template-columns: 1fr;
		}

		.episode-page__footer {
			align-items: flex-start;
			flex-direction: column;
		}

		.episode-page__related > div {
			grid-template-columns: 1fr;
		}

		.episode-page__end-matter ol {
			grid-template-columns: 1fr;
		}

		.episode-page__album-navigation {
			grid-template-columns: 1fr;
		}

		.episode-page__album-navigation > div + div {
			border-top: 1px solid #b7aa91;
			border-left: 0;
			text-align: left;
		}
	}

	@media print {
		.episode-page__breadcrumbs,
		.episode-page__production-status,
		.episode-page__hero,
		.episode-page__guidance,
		.episode-page__credits,
		.episode-page__album-navigation,
		.episode-page__transcript,
		.episode-page__related,
		.episode-page__end-matter,
		.episode-page__footer,
		.episode-page__reader > header {
			display: none;
		}

		.episode-page__reader {
			margin: 0;
		}
	}
</style>
