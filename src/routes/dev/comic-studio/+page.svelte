<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let filter = $state('');
	const visiblePages = $derived(
		data.pages.filter((page) =>
			`${page.page} ${page.title} ${page.purpose}`
				.toLocaleLowerCase('en')
				.includes(filter.trim().toLocaleLowerCase('en'))
		)
	);
</script>

<SEO
	title="Comic Studio | Development"
	description="Development-only status view for The Last Analog Town."
	robots="noindex,nofollow,noarchive"
/>

<article class="comic-studio">
	<header>
		<p>Development only · read-only</p>
		<h1>Comic Studio</h1>
		<p>
			{data.metadata.title}: {data.metadata.storyPageCount} story pages. Source YAML remains canonical;
			use the deterministic commands below for changes and derivatives.
		</p>
	</header>

	<section aria-labelledby="studio-status-heading">
		<h2 id="studio-status-heading">Panel status</h2>
		<dl>
			{#each Object.entries(data.statuses) as [status, count] (status)}
				<div>
					<dt>{status}</dt>
					<dd>{count}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section aria-labelledby="studio-commands-heading">
		<h2 id="studio-commands-heading">Production commands</h2>
		<pre><code
				>npm run comic:compile -- --episode 001
npm run comic:lettering -- --episode 001 --strict
npm run comic:prompts -- --episode 001
npm run comic:assemble -- --episode 001
npm run comic:render-pages -- --episode 001
npm run comic:render-cover -- --episode 001
npm run comic:provenance -- --episode 001
npm run comic:direct -- --episode 001
npm run comic:cultural-review -- --episode 001
npm run comic:contact-sheet -- --episode 001
npm run comic:validate -- --episode 001
npm run comic:export:web -- --episode 001 --output output/comics/001-web-production
npm run comic:promote:web -- --episode 001 --input output/comics/001-web-production
npm run comic:promote:web -- --episode 001 --input output/comics/001-web-production --confirm
npm run comic:export:pdf -- --episode 001 --lettered-pages
npm run comic:export:epub -- --episode 001 --lettered-pages</code
			></pre>
	</section>

	<section aria-labelledby="studio-pages-heading">
		<div class="comic-studio__filter">
			<div>
				<h2 id="studio-pages-heading">Story pages</h2>
				<p>{visiblePages.length} of {data.pages.length} pages</p>
			</div>
			<label>
				<span>Filter by number, title, or purpose</span>
				<input bind:value={filter} type="search" placeholder="Try clinic or 42" />
			</label>
		</div>
		<div class="comic-studio__table">
			<table>
				<thead>
					<tr>
						<th scope="col">Page</th>
						<th scope="col">Title and purpose</th>
						<th scope="col">Panels</th>
						<th scope="col">Art status</th>
					</tr>
				</thead>
				<tbody>
					{#each visiblePages as page (page.page)}
						<tr>
							<th scope="row">{page.page}</th>
							<td><strong>{page.title}</strong><span>{page.purpose}</span></td>
							<td>{page.panelCount}</td>
							<td>
								{Object.entries(page.statuses)
									.map(([status, count]) => `${status}: ${count}`)
									.join(' · ')}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</article>

<style>
	.comic-studio {
		color: #29241d;
		font-family: Roboto, Arial, sans-serif;
	}

	.comic-studio > header {
		border-block: 3px solid #29241d;
		background: #fff9e9;
		padding: clamp(1.5rem, 5vw, 3rem);
	}

	.comic-studio > header > p:first-child {
		margin: 0;
		color: #8e342d;
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.comic-studio h1 {
		margin: 0.25rem 0;
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: clamp(3rem, 8vw, 6rem);
		line-height: 0.9;
	}

	.comic-studio > header p:last-child {
		max-width: 50rem;
		text-align: left;
	}

	.comic-studio section {
		margin-top: 2.5rem;
	}

	.comic-studio h2 {
		margin: 0 0 0.75rem;
	}

	.comic-studio dl {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		margin: 0;
	}

	.comic-studio dl div {
		min-width: 8rem;
		border: 1px solid #b8aa90;
		background: #fff9e9;
		padding: 0.75rem;
	}

	.comic-studio dt {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.comic-studio dd {
		margin: 0.2rem 0 0;
		font-size: 1.6rem;
		font-weight: 800;
	}

	.comic-studio pre {
		overflow: auto;
		border: 1px solid #273334;
		background: #202728;
		padding: 1rem;
		color: #f8efdd;
		font-size: 0.8rem;
	}

	.comic-studio__filter {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.comic-studio__filter h2,
	.comic-studio__filter p {
		margin: 0;
		text-align: left;
	}

	.comic-studio__filter label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.comic-studio__filter input {
		min-height: 2.75rem;
		min-width: min(22rem, 60vw);
		border: 1px solid #928368;
		padding: 0.5rem 0.7rem;
	}

	.comic-studio__table {
		overflow-x: auto;
		margin-top: 1rem;
	}

	.comic-studio table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
	}

	.comic-studio th,
	.comic-studio td {
		border-bottom: 1px solid #cabfa9;
		padding: 0.65rem;
		text-align: left;
		vertical-align: top;
	}

	.comic-studio td span {
		display: block;
		margin-top: 0.2rem;
		color: #6f6557;
	}

	@media (max-width: 40rem) {
		.comic-studio__filter {
			align-items: stretch;
			flex-direction: column;
		}

		.comic-studio__filter input {
			min-width: 100%;
		}
	}
</style>
