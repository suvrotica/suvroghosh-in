<script lang="ts">
	import type { ComicEpisodeMetadata } from '$lib/comics/schema';

	let { metadata }: { metadata: ComicEpisodeMetadata } = $props();
</script>

<section class="comic-credits" aria-labelledby="comic-credits-heading">
	<h2 id="comic-credits-heading">Credits and production status</h2>
	<dl>
		{#each metadata.credits as credit (`${credit.role}-${credit.name}`)}
			<div>
				<dt>{credit.role}</dt>
				<dd>{credit.name}</dd>
			</div>
		{/each}
		<div>
			<dt>Category</dt>
			<dd>{metadata.category}</dd>
		</div>
		<div>
			<dt>Story pages</dt>
			<dd>{metadata.storyPageCount}</dd>
		</div>
		<div>
			<dt>Publication</dt>
			<dd>
				{metadata.published
					? 'Published'
					: 'Unpublished production edition — formal approvals pending'}
			</dd>
		</div>
	</dl>
</section>

<style>
	.comic-credits {
		border: 1px solid #b7a98d;
		background: #f7efd9;
		padding: clamp(1rem, 3vw, 1.75rem);
		color: #29241d;
	}

	.comic-credits h2 {
		margin: 0 0 1rem;
		font-size: 1.35rem;
	}

	.comic-credits dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 1rem;
		margin: 0;
	}

	.comic-credits dl div {
		border-left: 3px solid #8e342d;
		padding-left: 0.7rem;
	}

	.comic-credits dt {
		color: #6f6250;
		font:
			700 0.7rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.comic-credits dd {
		margin: 0.3rem 0 0;
		font-weight: 650;
	}
</style>
