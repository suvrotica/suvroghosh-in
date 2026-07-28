<script lang="ts">
	import { comicPanelNarrationItems, type ComicEpisode } from '$lib/comics/schema';

	let { episode }: { episode: ComicEpisode } = $props();
</script>

<article
	id="transcript"
	class="comic-transcript"
	data-pagefind-body
	tabindex="-1"
	aria-labelledby="comic-transcript-heading"
>
	<header>
		<p>Accessible text edition</p>
		<h2 id="comic-transcript-heading">{episode.metadata.title}: transcript</h2>
		<p>
			This transcript follows the exact story-page and panel order. Visual jokes that affect meaning
			are described alongside dialogue and sound.
		</p>
	</header>

	{#each episode.pages as page (page.page)}
		<section aria-labelledby={`transcript-page-${page.page}`}>
			<h3 id={`transcript-page-${page.page}`}>Page {page.page}: {page.title}</h3>
			{#each page.panels as panel (panel.id)}
				<section aria-labelledby={`transcript-${panel.id}`}>
					<h4 id={`transcript-${panel.id}`}>Panel {panel.panel}</h4>
					<p>{panel.accessibility.description}</p>
					{#each panel.overlays ?? [] as overlay (overlay.id)}
						<p><strong>Visible text ({overlay.kind}):</strong> {overlay.text}</p>
					{/each}
					{#if panel.caption}<p><strong>Caption:</strong> {panel.caption}</p>{/if}
					{#each comicPanelNarrationItems(panel) as item (item.key)}
						{#if item.kind === 'dialogue'}
							<p><strong>{item.dialogue.speaker}:</strong> {item.dialogue.text}</p>
						{:else}
							<p>
								<strong>Sound:</strong>
								{item.soundEffect.text}. {item.soundEffect.description}
							</p>
						{/if}
					{/each}
					{#if panel.visualJoke}<p><strong>Visual detail:</strong> {panel.visualJoke}</p>{/if}
				</section>
			{/each}
		</section>
	{/each}
</article>

<style>
	.comic-transcript {
		max-width: 52rem;
		margin: 0 auto;
		border: 1px solid #c5b99f;
		background: #fffdf5;
		padding: clamp(1rem, 3vw, 2.5rem);
		color: #29241d;
		box-shadow: 0 1rem 2rem rgb(31 27 22 / 0.13);
	}

	.comic-transcript header {
		margin-bottom: 2rem;
		border-bottom: 3px double #928368;
		padding-bottom: 1.4rem;
	}

	.comic-transcript header > p:first-child {
		margin: 0 0 0.4rem;
		color: #76532e;
		font:
			750 0.75rem/1.2 Roboto,
			Arial,
			sans-serif;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.comic-transcript h2,
	.comic-transcript h3,
	.comic-transcript h4 {
		color: #29241d;
	}

	.comic-transcript h2 {
		margin: 0;
		font-size: clamp(1.8rem, 5vw, 3rem);
	}

	.comic-transcript h3 {
		margin-top: 2.6rem;
		border-bottom: 1px solid #d6cbb5;
		padding-bottom: 0.45rem;
		font-size: 1.45rem;
	}

	.comic-transcript h4 {
		margin: 1.5rem 0 0.45rem;
		font-family: Roboto, Arial, sans-serif;
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.comic-transcript p {
		margin: 0.4rem 0;
		text-align: left;
		line-height: 1.62;
	}
</style>
