<script lang="ts">
	import { comicPanelNarrationItems, type ComicPanel as ComicPanelData } from '$lib/comics/schema';
	import ComicCaption from './ComicCaption.svelte';
	import ComicTextOverlay from './ComicTextOverlay.svelte';
	import SpeechBalloon from './SpeechBalloon.svelte';

	let {
		panel,
		pageNumber,
		loading = 'lazy',
		active = false
	}: {
		panel: ComicPanelData;
		pageNumber: number;
		loading?: 'eager' | 'lazy';
		active?: boolean;
	} = $props();

	const percent = (value: number) => Number((value * 100).toFixed(4));
	const visibleCharacters = $derived(panel.characters.map((character) => character.id).join(', '));
	const sortedDialogue = $derived(
		[...panel.dialogue].sort((a, b) => a.readingOrder - b.readingOrder)
	);
	const accessibleNarration = $derived(comicPanelNarrationItems(panel));
	const hasFinalArt = $derived(Boolean(panel.art.final && panel.art.status === 'final'));
</script>

<article
	class="comic-panel comic-panel--{panel.size}"
	class:comic-panel--active={active}
	aria-label={`Page ${pageNumber}, panel ${panel.panel}`}
	data-panel-id={panel.id}
>
	<div class="comic-panel__visual">
		{#if hasFinalArt && panel.art.final}
			<img
				src={panel.art.final}
				alt={panel.accessibility.alt}
				width={panel.art.width ?? undefined}
				height={panel.art.height ?? undefined}
				{loading}
				decoding="async"
			/>
		{:else}
			<div
				class="comic-panel__placeholder"
				role="img"
				aria-label={panel.accessibility.alt}
				style={`--placeholder-ratio:${panel.aspectRatio.replace(':', '/')}`}
			>
				<div class="comic-panel__placeholder-heading">
					<span>{panel.id}</span>
					<strong>{panel.art.status.replace('-', ' ')}</strong>
				</div>
				<p>{panel.camera}</p>
				<p>{visibleCharacters || 'Environment panel'}</p>
				<p class="comic-panel__action">{panel.action}</p>
			</div>
		{/if}

		{#if panel.caption}
			<ComicCaption text={panel.caption} />
		{/if}

		{#each panel.overlays ?? [] as overlay (overlay.id)}
			<ComicTextOverlay {overlay} />
		{/each}

		{#each sortedDialogue as dialogue (dialogue.id)}
			<SpeechBalloon {dialogue} />
		{/each}

		{#each panel.soundEffects ?? [] as effect (`${panel.id}-${effect.text}-${effect.position.z}`)}
			<span
				class="comic-panel__sfx"
				style={`left:${percent(effect.position.x)}%;top:${percent(effect.position.y)}%;z-index:${effect.position.z}`}
				aria-hidden="true">{effect.text}</span
			>
		{/each}
	</div>

	<div class="sr-only">
		<p>{panel.accessibility.description}</p>
		{#each panel.overlays ?? [] as overlay (overlay.id)}
			<p>Visible text ({overlay.kind}): {overlay.text}</p>
		{/each}
		{#if panel.caption}<p>Caption: {panel.caption}</p>{/if}
		{#each accessibleNarration as item (item.key)}
			{#if item.kind === 'dialogue'}
				<p><strong>{item.dialogue.speaker}:</strong> {item.dialogue.text}</p>
			{:else}
				<p>Sound: {item.soundEffect.text}. {item.soundEffect.description}</p>
			{/if}
		{/each}
		{#if panel.visualJoke}<p>Visual detail: {panel.visualJoke}</p>{/if}
	</div>
</article>

<style>
	.comic-panel {
		position: relative;
		min-width: 0;
		overflow: clip;
		border: clamp(2px, 0.3vw, 4px) solid var(--comic-ink, #1e1a16);
		background: #d8c9a6;
		box-shadow: 0 3px 0 rgb(30 26 22 / 0.2);
		outline: none;
	}

	.comic-panel--active {
		box-shadow:
			0 3px 0 rgb(30 26 22 / 0.2),
			0 0 0 2px var(--comic-grid-blue, #315f72);
	}

	.comic-panel__visual,
	.comic-panel__visual > img,
	.comic-panel__placeholder {
		width: 100%;
		height: 100%;
		min-height: 100%;
	}

	.comic-panel__visual {
		position: relative;
	}

	.comic-panel__visual > img {
		display: block;
		object-fit: cover;
	}

	.comic-panel__placeholder {
		display: flex;
		aspect-ratio: var(--placeholder-ratio, 4/3);
		flex-direction: column;
		justify-content: flex-end;
		background:
			linear-gradient(135deg, rgb(255 255 255 / 0.07) 25%, transparent 25%) 0 0 / 1.5rem 1.5rem,
			linear-gradient(315deg, rgb(255 255 255 / 0.05) 25%, transparent 25%) 0 0 / 1.5rem 1.5rem,
			#456067;
		padding: clamp(0.7rem, 2.4vw, 1.3rem);
		color: #fffbed;
		font-family: Roboto, Arial, sans-serif;
		text-shadow: 0 1px 1px rgb(0 0 0 / 0.6);
	}

	.comic-panel__placeholder-heading {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		left: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.comic-panel__placeholder-heading strong {
		border: 1px solid rgb(255 255 255 / 0.7);
		border-radius: 999px;
		padding: 0.15rem 0.45rem;
		background: rgb(0 0 0 / 0.2);
	}

	.comic-panel__placeholder p {
		margin: 0.12rem 0 0;
		max-width: 72%;
		text-align: left;
		font-size: clamp(0.68rem, 1.8vw, 0.9rem);
		line-height: 1.25;
	}

	.comic-panel__placeholder .comic-panel__action {
		margin-top: 0.4rem;
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: clamp(0.78rem, 2vw, 1rem);
		font-weight: 650;
	}

	.comic-panel__sfx {
		position: absolute;
		transform: translate(-50%, -50%) rotate(-5deg);
		color: #fff7d6;
		font-family: Roboto, Arial, sans-serif;
		font-size: clamp(1rem, 4vw, 2.4rem);
		font-weight: 900;
		letter-spacing: -0.06em;
		text-shadow:
			-2px -2px 0 #1e1a16,
			2px -2px 0 #1e1a16,
			-2px 2px 0 #1e1a16,
			2px 2px 0 #1e1a16;
	}
</style>
