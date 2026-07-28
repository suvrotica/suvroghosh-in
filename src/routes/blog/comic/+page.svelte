<script lang="ts">
	import { resolve } from '$app/paths';
	import ComicEpisodeCard from '$lib/components/comics/ComicEpisodeCard.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		collectionPageSchema,
		itemListSchema,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let query = $state('');
	let kind = $state<'all' | 'series' | 'episode' | 'character'>('all');

	const canonicalUrl = `${siteUrl}/blog/comic`;
	const title = 'Comic | Suvro Ghosh';
	const description =
		'Original long-form comics from Suvro Ghosh, beginning with The Last Analog Town: a satirical adventure series set in fictional Golmohar Junction.';
	const normalizedQuery = $derived(query.trim().toLocaleLowerCase('en'));
	const seriesVisible = $derived(
		(kind === 'all' || kind === 'series') &&
			(!normalizedQuery ||
				`${data.series.title} ${data.series.description} ${data.series.themes.join(' ')}`
					.toLocaleLowerCase('en')
					.includes(normalizedQuery))
	);
	const visibleEpisodes = $derived(
		kind === 'all' || kind === 'episode'
			? data.episodes.filter((episode) =>
					`${episode.title} ${episode.description} ${episode.tags.join(' ')}`
						.toLocaleLowerCase('en')
						.includes(normalizedQuery)
				)
			: []
	);
	const visibleCharacters = $derived(
		kind === 'all' || kind === 'character'
			? data.characters.filter((character) =>
					`${character.name} ${character.role ?? ''} ${character.summary ?? character.description ?? character.narrativeFunction ?? ''}`
						.toLocaleLowerCase('en')
						.includes(normalizedQuery)
				)
			: []
	);
	const resultCount = $derived(
		(seriesVisible ? 1 : 0) + visibleEpisodes.length + visibleCharacters.length
	);
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	keywords={[
		'Comic',
		'The Last Analog Town',
		'Golmohar Junction',
		'Satire',
		'Artificial Intelligence',
		'Bureaucracy',
		'Calcutta'
	]}
	schema={withSiteGraph([
		collectionPageSchema({
			name: 'Comic',
			description,
			url: canonicalUrl,
			about: 'Original comic series and albums'
		}),
		itemListSchema({
			name: 'Comic reading order',
			url: canonicalUrl,
			items: data.episodes.map((episode) => ({
				name: episode.title,
				url: `${siteUrl}${episode.canonicalPath}`
			}))
		})
	])}
/>

<article class="comic-catalog page-enter">
	<header class="comic-catalog__hero">
		<p>First-class site category</p>
		<h1>Comic</h1>
		<p>
			Original, full-length visual stories with readable web editions, accessible transcripts, and
			print-ready production files. The first series is set in Golmohar Junction, a wholly fictional
			town in the wider orbit of Calcutta.
		</p>
	</header>

	<section class="comic-catalog__notice" aria-labelledby="comic-status-heading">
		<div>
			<p>Editorial status</p>
			<h2 id="comic-status-heading">Album One is a production edition</h2>
		</div>
		<p>
			The complete illustrated 62-page story and production reader are available for review. Final
			publication remains gated on formal panel-rights records, Bengali-sign review, cultural and
			accessibility review, edition approvals, and named human editorial approval.
		</p>
	</section>

	<section aria-labelledby="comic-search-heading" class="comic-catalog__search">
		<div>
			<h2 id="comic-search-heading">Find comic material</h2>
			<p aria-live="polite">{resultCount} matching {resultCount === 1 ? 'item' : 'items'}</p>
		</div>
		<label>
			<span>Search series, episodes, characters, and themes</span>
			<input bind:value={query} type="search" placeholder="Try Cecil, uncertainty, clinic…" />
		</label>
		<label>
			<span>Content type</span>
			<select bind:value={kind}>
				<option value="all">All comic material</option>
				<option value="series">Comic series</option>
				<option value="episode">Comic episodes</option>
				<option value="character">Comic characters</option>
			</select>
		</label>
	</section>

	{#if seriesVisible}
		<section aria-labelledby="featured-series-heading">
			<div class="comic-catalog__section-heading">
				<p>Featured series</p>
				<h2 id="featured-series-heading">{data.series.title}</h2>
			</div>
			<a class="comic-catalog__series" href={resolve('/blog/comic/the-last-analog-town')}>
				<div aria-hidden="true">
					<span>GJ-MTDA-7</span>
					<strong>?</strong>
				</div>
				<div>
					<p>Comic series · {data.series.publication.status}</p>
					<h3>{data.series.title}</h3>
					<p>{data.series.description}</p>
					<span>Meet Golmohar Junction <span aria-hidden="true">→</span></span>
				</div>
			</a>
		</section>
	{/if}

	{#if visibleEpisodes.length}
		<section aria-labelledby="latest-episodes-heading">
			<div class="comic-catalog__section-heading">
				<p>Latest and recently updated · reading order</p>
				<h2 id="latest-episodes-heading">Albums</h2>
			</div>
			<div class="comic-catalog__cards">
				{#each visibleEpisodes as episode (episode.id)}
					<ComicEpisodeCard {episode} href={episode.canonicalPath} />
				{/each}
			</div>
			<p class="comic-catalog__links">
				<a href={resolve(data.episodes[0].transcriptPath as '/')}>Accessible transcript</a>
				{#if data.episodes[0].printPath}
					<span aria-hidden="true">·</span>
					<a href={resolve(data.episodes[0].printPath as '/')}>Printable production edition</a>
				{/if}
			</p>
		</section>
	{/if}

	{#if visibleCharacters.length}
		<section aria-labelledby="characters-heading">
			<div class="comic-catalog__section-heading">
				<p>Recurring cast</p>
				<h2 id="characters-heading">Characters</h2>
			</div>
			<ul class="comic-catalog__characters">
				{#each visibleCharacters as character (character.id)}
					<li>
						<h3>{character.name}</h3>
						{#if character.role}<p>{character.role}</p>{/if}
						<p>
							{character.summary ??
								character.description ??
								character.narrativeFunction ??
								'Series character.'}
						</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="comic-catalog__grid">
		<div>
			<p>Complete series list</p>
			<h2>One town, many systems</h2>
			<ul>
				<li><a href={resolve('/blog/comic/the-last-analog-town')}>{data.series.title}</a></li>
			</ul>
			<p>Standalone comics will appear here when added.</p>
		</div>
		<div>
			<p>Themes</p>
			<h2>What the series examines</h2>
			<ul>
				{#each data.series.themes as theme (theme)}
					<li>{theme}</li>
				{/each}
			</ul>
		</div>
		<div>
			<p>Age and content guidance</p>
			<h2>Teen and adult readers</h2>
			<ul>
				{#each data.episodes[0].contentGuidance as guidance (guidance)}
					<li>{guidance}</li>
				{/each}
			</ul>
		</div>
	</section>

	<footer class="comic-catalog__fiction-note">
		<strong>Fictional-setting note.</strong>
		{data.series.setting.notRealPlaceStatement}
	</footer>
</article>

<style>
	.comic-catalog {
		--comic-ink: #241f19;
		--comic-paper: #fff9e9;
		--comic-red: #8e342d;
		--comic-blue: #315f72;
		color: var(--comic-ink);
	}

	.comic-catalog__hero {
		border-block: 3px solid var(--comic-ink);
		background:
			linear-gradient(110deg, transparent 0 70%, rgb(142 52 45 / 0.12) 70%), var(--comic-paper);
		padding: clamp(2rem, 7vw, 5.5rem) clamp(1rem, 5vw, 4rem);
	}

	.comic-catalog__hero > p:first-child,
	.comic-catalog__section-heading > p,
	.comic-catalog__notice > div > p,
	.comic-catalog__grid > div > p:first-child {
		margin: 0 0 0.35rem;
		color: var(--comic-red);
		font:
			750 0.75rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.comic-catalog__hero h1 {
		margin: 0;
		font-size: clamp(3.4rem, 11vw, 8rem);
		line-height: 0.86;
	}

	.comic-catalog__hero > p:last-child {
		max-width: 52rem;
		margin: 1.5rem 0 0;
		text-align: left;
		font-size: clamp(1rem, 2.2vw, 1.25rem);
	}

	.comic-catalog section {
		margin-top: clamp(2.5rem, 7vw, 5rem);
	}

	.comic-catalog__notice {
		display: grid;
		grid-template-columns: minmax(12rem, 0.7fr) minmax(0, 1.3fr);
		gap: 1.5rem;
		border: 1px solid #c0a866;
		background: #fff4c8;
		padding: 1.25rem;
	}

	.comic-catalog__notice h2,
	.comic-catalog__notice p {
		margin: 0;
		text-align: left;
	}

	.comic-catalog__search {
		display: grid;
		grid-template-columns: minmax(14rem, 1fr) minmax(14rem, 1.5fr) minmax(11rem, 0.7fr);
		align-items: end;
		gap: 1rem;
		border-block: 1px solid #c8bda8;
		padding-block: 1rem;
	}

	.comic-catalog__search h2,
	.comic-catalog__search p {
		margin: 0;
		text-align: left;
	}

	.comic-catalog__search label {
		display: grid;
		gap: 0.35rem;
		font:
			650 0.78rem/1.3 Roboto,
			Arial,
			sans-serif;
	}

	.comic-catalog__search input,
	.comic-catalog__search select {
		min-height: 2.75rem;
		border: 1px solid #897e6b;
		border-radius: 0.25rem;
		background: #fff;
		padding: 0.55rem 0.7rem;
		color: #241f19;
		font:
			400 1rem/1.2 Roboto,
			Arial,
			sans-serif;
	}

	.comic-catalog__section-heading {
		margin-bottom: 1.25rem;
		border-bottom: 2px solid var(--comic-ink);
		padding-bottom: 0.65rem;
	}

	.comic-catalog__section-heading h2 {
		margin: 0;
		font-size: clamp(2rem, 5vw, 3.6rem);
	}

	.comic-catalog__series {
		display: grid;
		grid-template-columns: minmax(10rem, 0.65fr) minmax(0, 1.35fr);
		overflow: hidden;
		border: 1px solid #aa9a7d;
		background: var(--comic-paper);
		color: var(--comic-ink);
		text-decoration: none;
		box-shadow: 0 1rem 2rem rgb(31 27 22 / 0.13);
	}

	.comic-catalog__series > div:first-child {
		display: grid;
		min-height: 18rem;
		place-content: center;
		background:
			linear-gradient(135deg, transparent 0 42%, rgb(255 255 255 / 0.12) 42% 44%, transparent 44%),
			var(--comic-blue);
		color: #fff9e9;
		text-align: center;
	}

	.comic-catalog__series > div:first-child span {
		font:
			700 0.7rem/1 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.1em;
	}

	.comic-catalog__series > div:first-child strong {
		font-size: 8rem;
		line-height: 0.9;
	}

	.comic-catalog__series > div:last-child {
		padding: clamp(1.25rem, 4vw, 2.5rem);
	}

	.comic-catalog__series h3 {
		margin: 0;
		font-size: clamp(2rem, 5vw, 4rem);
	}

	.comic-catalog__series p {
		text-align: left;
	}

	.comic-catalog__series > div:last-child > p:first-child,
	.comic-catalog__series > div:last-child > span {
		color: var(--comic-red);
		font:
			750 0.75rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.comic-catalog__cards {
		display: grid;
		gap: 1.25rem;
	}

	.comic-catalog__links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 1rem;
		text-align: left;
	}

	.comic-catalog__characters,
	.comic-catalog__grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}

	.comic-catalog__characters {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.comic-catalog__characters li,
	.comic-catalog__grid > div {
		border: 1px solid #b8aa90;
		background: var(--comic-paper);
		padding: 1rem;
	}

	.comic-catalog__characters h3,
	.comic-catalog__grid h2 {
		margin: 0;
	}

	.comic-catalog__characters p,
	.comic-catalog__grid p {
		text-align: left;
	}

	.comic-catalog__characters li > p:first-of-type {
		color: var(--comic-red);
		font:
			700 0.75rem/1.3 Roboto,
			Arial,
			sans-serif;
		text-transform: uppercase;
	}

	.comic-catalog__grid {
		margin-top: clamp(2.5rem, 7vw, 5rem);
	}

	.comic-catalog__grid ul {
		padding-left: 1.15rem;
	}

	.comic-catalog__fiction-note {
		margin-top: 3rem;
		border-top: 1px solid #b8aa90;
		padding-top: 1rem;
		font-size: 0.9rem;
	}

	@media (max-width: 50rem) {
		.comic-catalog__notice,
		.comic-catalog__search,
		.comic-catalog__characters,
		.comic-catalog__grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 35rem) {
		.comic-catalog__series {
			grid-template-columns: 1fr;
		}

		.comic-catalog__series > div:first-child {
			min-height: 10rem;
		}
	}
</style>
