<script lang="ts">
	import { resolve } from '$app/paths';
	import ComicEpisodeCard from '$lib/components/comics/ComicEpisodeCard.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		breadcrumbSchema,
		collectionPageSchema,
		itemListSchema,
		personId,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const canonicalUrl = `${siteUrl}/blog/comic/the-last-analog-town`;
	const title = 'The Last Analog Town | Comic series';
	const description = $derived(data.series.description);
	const faq = [
		{
			question: 'Is Golmohar Junction a real town?',
			answer:
				'No. It is a wholly fictional eastern Indian town in the disputed wider orbit of Calcutta, assembled from invented institutions, history, and geography.'
		},
		{
			question: 'Where should I start?',
			answer:
				'Begin with Album One, The Efficiency Inspector. Each album is a complete adventure and also develops the recurring cast and town.'
		},
		{
			question: 'Is the series anti-technology?',
			answer:
				'No. The stories examine both the real gains of better systems and the damage caused when uncertain human situations are forced into rigid categories without appeal.'
		}
	];
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	keywords={['Comic', ...data.series.themes, 'Golmohar Junction', 'Calcutta']}
	schema={withSiteGraph([
		{
			'@type': 'CreativeWorkSeries',
			'@id': `${canonicalUrl}#series`,
			name: data.series.title,
			description,
			url: canonicalUrl,
			genre: ['Adventure comic', 'Political satire', 'Technology satire'],
			creator: { '@id': personId },
			isPartOf: { '@id': `${siteUrl}/#website` },
			inLanguage: 'en'
		},
		collectionPageSchema({
			name: data.series.title,
			description,
			url: canonicalUrl,
			about: 'A fictional town negotiating algorithmic government'
		}),
		itemListSchema({
			name: `${data.series.title} reading order`,
			url: canonicalUrl,
			items: data.episodes.map((episode) => ({
				name: episode.title,
				url: `${siteUrl}${episode.canonicalPath}`
			}))
		}),
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Comic', url: `${siteUrl}/blog/comic` },
			{ name: data.series.title, url: canonicalUrl }
		]),
		{
			'@type': 'FAQPage',
			'@id': `${canonicalUrl}#faq`,
			mainEntity: faq.map((item) => ({
				'@type': 'Question',
				name: item.question,
				acceptedAnswer: { '@type': 'Answer', text: item.answer }
			}))
		}
	])}
/>

<article class="series-page page-enter">
	<nav aria-label="Breadcrumb" class="series-page__breadcrumbs">
		<a href={resolve('/blog/comic')}>Comic</a>
		<span aria-hidden="true">/</span>
		<span aria-current="page">The Last Analog Town</span>
	</nav>

	<header class="series-page__hero">
		<div
			class="series-page__banner"
			role="img"
			aria-label="A diagrammatic map of fictional Golmohar Junction in which six incompatible maps overlap"
		>
			<span>Railway</span>
			<span>Municipal</span>
			<span>Postal</span>
			<span>Electoral</span>
			<span>Police</span>
			<span>Drainage</span>
			<strong>?</strong>
		</div>
		<div>
			<p>Original adventure-comic series</p>
			<h1>{data.series.title}</h1>
			<p>{data.series.description}</p>
			<div class="series-page__status">
				<span>Comic</span>
				<span>{data.series.publication.status}</span>
				<span>Teen and adult readers</span>
			</div>
		</div>
	</header>

	<aside class="series-page__fiction-note">
		<strong>Fictional-setting note.</strong>
		{data.series.setting.notRealPlaceStatement}
	</aside>

	<section aria-labelledby="start-here-heading">
		<div class="series-page__section-heading">
			<p>Start here · latest episode · reading order 1</p>
			<h2 id="start-here-heading">The first Golmohar adventure</h2>
		</div>
		<ComicEpisodeCard episode={data.episodes[0]} href={data.episodes[0].canonicalPath} />
		<p class="series-page__episode-links">
			<a href={resolve(data.episodes[0].transcriptPath as '/')}>Accessible transcript</a>
			<span aria-hidden="true">·</span>
			<a href={resolve(data.episodes[0].printPath as '/')}>Printable production edition</a>
		</p>
	</section>

	{#if data.characters.length}
		<section aria-labelledby="cast-heading">
			<div class="series-page__section-heading">
				<p>Core cast</p>
				<h2 id="cast-heading">People, officials, and one categorical machine</h2>
			</div>
			<ul class="series-page__cast">
				{#each data.characters as character, index (character.id)}
					<li>
						<div aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
						<h3>{character.name}</h3>
						{#if character.role}<p>{character.role}</p>{/if}
						<p>
							{character.summary ??
								character.description ??
								character.narrativeFunction ??
								'Recurring series character.'}
						</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section aria-labelledby="locations-heading">
		<div class="series-page__section-heading">
			<p>The town</p>
			<h2 id="locations-heading">Recurring locations</h2>
		</div>
		<ul class="series-page__locations">
			{#each data.locations as location (location.id)}
				<li>
					<h3>{location.name}</h3>
					<p>
						{location.summary ??
							location.description ??
							location.narrativeFunction ??
							location.neighbourhoodVisualIdentity ??
							'A recurring Golmohar location.'}
					</p>
				</li>
			{/each}
		</ul>
	</section>

	<section class="series-page__themes" aria-labelledby="themes-heading">
		<div>
			<p>Recurring questions</p>
			<h2 id="themes-heading">What counts as a fact?</h2>
			<p>
				Golmohar’s paper records, memories, personal networks, sensors, ledgers, and databases are
				all useful and all incomplete. The series follows the consequences of deciding which version
				can govern a life.
			</p>
		</div>
		<ul>
			{#each data.series.themes as theme (theme)}
				<li>{theme}</li>
			{/each}
		</ul>
	</section>

	<section aria-labelledby="production-heading">
		<div class="series-page__section-heading">
			<p>Behind the scenes</p>
			<h2 id="production-heading">A filesystem-first comic system</h2>
		</div>
		<div class="series-page__production">
			<p>
				Each album begins with a locked premise and page-turn outline, then moves through structured
				panel scripts, continuity checks, accessibility text, prompt manifests, provenance records,
				deterministic lettering, web export, and print export.
			</p>
			<p>
				Generated images never supply final signage or dialogue. English and Bengali words are
				composed separately with real text, and publication-bound Bengali translations require named
				human review.
			</p>
		</div>
	</section>

	<section aria-labelledby="faq-heading">
		<div class="series-page__section-heading">
			<p>Series FAQ</p>
			<h2 id="faq-heading">Before boarding at Golmohar Halt</h2>
		</div>
		<div class="series-page__faq">
			{#each faq as item (item.question)}
				<details>
					<summary>{item.question}</summary>
					<p>{item.answer}</p>
				</details>
			{/each}
		</div>
	</section>
</article>

<style>
	.series-page {
		--series-ink: #241f19;
		--series-paper: #fff9e9;
		--series-red: #8e342d;
		--series-blue: #315f72;
		color: var(--series-ink);
	}

	.series-page__breadcrumbs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
		color: #6d6254;
		font:
			650 0.8rem/1.3 Roboto,
			Arial,
			sans-serif;
	}

	.series-page__hero {
		display: grid;
		grid-template-columns: minmax(18rem, 0.9fr) minmax(0, 1.1fr);
		align-items: stretch;
		border-block: 3px solid var(--series-ink);
		background: var(--series-paper);
	}

	.series-page__hero > div:last-child {
		padding: clamp(1.5rem, 5vw, 4rem);
	}

	.series-page__hero > div:last-child > p:first-child,
	.series-page__section-heading > p,
	.series-page__themes > div > p:first-child {
		margin: 0 0 0.4rem;
		color: var(--series-red);
		font:
			750 0.72rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.series-page__hero h1 {
		margin: 0;
		font-size: clamp(3rem, 7vw, 6rem);
		line-height: 0.9;
	}

	.series-page__hero > div:last-child > p:nth-of-type(2) {
		max-width: 45rem;
		text-align: left;
		font-size: 1.1rem;
	}

	.series-page__banner {
		position: relative;
		display: grid;
		min-height: 31rem;
		place-content: center;
		overflow: hidden;
		background:
			linear-gradient(24deg, transparent 0 47%, #d39c51 47% 49%, transparent 49%),
			linear-gradient(118deg, transparent 0 47%, #dfe8de 47% 49%, transparent 49%),
			radial-gradient(circle at 58% 54%, #8e342d 0 2%, transparent 2.2%), var(--series-blue);
		color: #fff9e9;
	}

	.series-page__banner span {
		position: absolute;
		border: 1px solid rgb(255 255 255 / 0.55);
		background: rgb(31 27 22 / 0.3);
		padding: 0.3rem 0.5rem;
		font:
			700 0.65rem/1 Roboto,
			Arial,
			sans-serif;
		text-transform: uppercase;
	}

	.series-page__banner span:nth-child(1) {
		top: 8%;
		left: 8%;
	}
	.series-page__banner span:nth-child(2) {
		top: 14%;
		right: 8%;
	}
	.series-page__banner span:nth-child(3) {
		top: 44%;
		left: 13%;
	}
	.series-page__banner span:nth-child(4) {
		top: 49%;
		right: 6%;
	}
	.series-page__banner span:nth-child(5) {
		bottom: 8%;
		left: 17%;
	}
	.series-page__banner span:nth-child(6) {
		right: 15%;
		bottom: 13%;
	}

	.series-page__banner strong {
		font-size: 10rem;
		line-height: 1;
	}

	.series-page__status {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 1.25rem;
	}

	.series-page__status span {
		border: 1px solid #a89a80;
		border-radius: 999px;
		padding: 0.3rem 0.65rem;
		font:
			650 0.72rem/1 Roboto,
			Arial,
			sans-serif;
		text-transform: capitalize;
	}

	.series-page__fiction-note {
		border: 1px solid #c1ad6d;
		border-top: 0;
		background: #fff3c4;
		padding: 0.9rem 1rem;
		font-size: 0.9rem;
	}

	.series-page section {
		margin-top: clamp(3rem, 7vw, 5.5rem);
	}

	.series-page__section-heading {
		margin-bottom: 1.25rem;
		border-bottom: 2px solid var(--series-ink);
		padding-bottom: 0.65rem;
	}

	.series-page__section-heading h2,
	.series-page__themes h2 {
		margin: 0;
		font-size: clamp(2rem, 4.8vw, 3.6rem);
	}

	.series-page__episode-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		text-align: left;
	}

	.series-page__cast,
	.series-page__locations {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		gap: 1rem;
	}

	.series-page__cast {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.series-page__cast li,
	.series-page__locations li {
		border: 1px solid #b8aa90;
		background: var(--series-paper);
		padding: 1rem;
	}

	.series-page__cast li > div {
		color: var(--series-red);
		font:
			800 1.7rem/1 Roboto,
			Arial,
			sans-serif;
	}

	.series-page__cast h3,
	.series-page__locations h3 {
		margin: 0.5rem 0 0;
	}

	.series-page__cast p,
	.series-page__locations p,
	.series-page__themes p,
	.series-page__production p {
		text-align: left;
	}

	.series-page__cast li > p:first-of-type {
		color: var(--series-red);
		font:
			700 0.72rem/1.3 Roboto,
			Arial,
			sans-serif;
		text-transform: uppercase;
	}

	.series-page__locations {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.series-page__themes {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(16rem, 0.9fr);
		gap: 2rem;
		border-block: 3px solid var(--series-ink);
		background: var(--series-paper);
		padding: clamp(1.5rem, 5vw, 3rem);
	}

	.series-page__themes ul {
		margin: 0;
		columns: 2;
		padding-left: 1.1rem;
	}

	.series-page__production {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.series-page__production p {
		margin: 0;
		border-left: 4px solid var(--series-blue);
		background: #edf2ef;
		padding: 1rem;
	}

	.series-page__faq {
		display: grid;
		gap: 0.65rem;
	}

	.series-page__faq details {
		border: 1px solid #b8aa90;
		background: var(--series-paper);
		padding: 0.8rem 1rem;
	}

	.series-page__faq summary {
		cursor: pointer;
		font-weight: 750;
	}

	.series-page__faq p {
		margin-bottom: 0;
		text-align: left;
	}

	@media (max-width: 58rem) {
		.series-page__hero,
		.series-page__themes {
			grid-template-columns: 1fr;
		}

		.series-page__banner {
			min-height: 18rem;
		}

		.series-page__cast,
		.series-page__locations {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 38rem) {
		.series-page__cast,
		.series-page__locations,
		.series-page__production {
			grid-template-columns: 1fr;
		}

		.series-page__themes ul {
			columns: 1;
		}
	}
</style>
