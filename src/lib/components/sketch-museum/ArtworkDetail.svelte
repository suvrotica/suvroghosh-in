<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import type { SketchArtwork } from '$lib/sketches/types';

	type Props = {
		artworks: SketchArtwork[];
		artwork: SketchArtwork;
		onClose: () => void;
		onSelect: (artwork: SketchArtwork) => void;
		onMuseumFocus?: (artwork: SketchArtwork) => void;
	};

	let { artworks, artwork, onClose, onSelect, onMuseumFocus = () => {} }: Props = $props();
	let dialog: HTMLDialogElement;
	let zoomed = $state(false);
	let closeHandled = false;
	let tearingDown = false;
	let selectionFrame: number | null = null;

	let artworkIndex = $derived(artworks.findIndex((candidate) => candidate.slug === artwork.slug));

	$effect(() => {
		if (artwork.slug) zoomed = false;
	});

	onMount(() => {
		dialog.showModal();
		return () => {
			tearingDown = true;
			// Removing the element closes it; calling close() here would report teardown as user intent.
			if (selectionFrame !== null) cancelAnimationFrame(selectionFrame);
		};
	});

	function close() {
		if (dialog.open) dialog.close();
	}

	function handleClose() {
		if (tearingDown || closeHandled) return;
		closeHandled = true;
		onClose();
	}

	function handleBackdrop(event: MouseEvent) {
		if (event.target === dialog) close();
	}

	function selectOffset(event: MouseEvent, offset: number) {
		event.stopPropagation();
		if (selectionFrame !== null || artworks.length === 0) return;

		const currentIndex = artworks.findIndex((candidate) => candidate.slug === artwork.slug);
		if (currentIndex < 0) return;

		const nextIndex = (currentIndex + offset + artworks.length) % artworks.length;
		selectionFrame = requestAnimationFrame(() => {
			selectionFrame = null;
		});
		onSelect(artworks[nextIndex]);
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${value}T00:00:00Z`));
	}
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="artwork-detail-title"
	aria-describedby="artwork-detail-description"
	onclose={handleClose}
	onclick={handleBackdrop}
>
	<article>
		<header>
			<div>
				<p>Sketch Museum collection</p>
				<h2 id="artwork-detail-title">{artwork.title}</h2>
			</div>
			<button type="button" class="close-button" onclick={close} aria-label="Close artwork details"
				>×</button
			>
		</header>

		<div class="detail-layout">
			<div class:zoomed class="image-stage">
				<button
					type="button"
					class="image-button"
					onclick={() => (zoomed = !zoomed)}
					aria-pressed={zoomed}
					aria-label={zoomed ? 'Fit artwork to window' : 'Zoom in on artwork'}
				>
					<img
						src={artwork.variants.detail.src}
						alt={artwork.alt}
						width={artwork.variants.detail.width}
						height={artwork.variants.detail.height}
						decoding="async"
					/>
				</button>
				<span>{zoomed ? 'Select image to fit' : 'Select image to examine linework'}</span>
			</div>

			<div class="artwork-copy">
				<p id="artwork-detail-description" class="description">
					{artwork.description || 'No description has been added for this sketch.'}
				</p>

				<dl>
					{#if artwork.date}
						<div>
							<dt>Date</dt>
							<dd><time datetime={artwork.date}>{formatDate(artwork.date)}</time></dd>
						</div>
					{/if}
					{#if artwork.medium}
						<div>
							<dt>Medium</dt>
							<dd>{artwork.medium}</dd>
						</div>
					{/if}
					<div>
						<dt>Orientation</dt>
						<dd>{artwork.orientation}</dd>
					</div>
					<div>
						<dt>Source dimensions</dt>
						<dd>{artwork.source.width} × {artwork.source.height} px</dd>
					</div>
					<div>
						<dt>Alternative text</dt>
						<dd>{artwork.alt}</dd>
					</div>
				</dl>

				<div class="detail-links">
					<button type="button" onclick={() => onMuseumFocus(artwork)}>Find in Museum View</button>
					<a
						href={resolve(artwork.source.src as '/images')}
						target="_blank"
						rel="noopener noreferrer"
					>
						Load original drawing
						<span class="sr-only"> in a new tab</span>
					</a>
				</div>
			</div>
		</div>

		<footer>
			<button type="button" onclick={(event) => selectOffset(event, -1)}>
				<span aria-hidden="true">←</span> Previous
			</button>
			<span>{artworkIndex + 1} of {artworks.length}</span>
			<button type="button" onclick={(event) => selectOffset(event, 1)}>
				Next <span aria-hidden="true">→</span>
			</button>
		</footer>
	</article>
</dialog>

<style>
	dialog {
		position: fixed;
		inset: 0;
		width: min(76rem, calc(100% - 1.25rem));
		max-width: none;
		max-height: calc(100dvh - 1.25rem);
		margin: auto;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--control-border);
		border-radius: 0.6rem;
		background: var(--paper-raised);
		color: var(--ink);
		box-shadow: 0 1.5rem 5rem rgb(0 0 0 / 50%);
	}

	dialog::backdrop {
		background: rgb(13 10 8 / 76%);
		backdrop-filter: blur(5px);
	}

	article {
		display: grid;
		max-height: calc(100dvh - 1.25rem);
		grid-template-rows: auto minmax(0, 1fr) auto;
	}

	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem 1rem;
		border-color: var(--rule);
	}

	header {
		border-bottom: 1px solid var(--rule);
	}

	header p {
		margin: 0 0 0.2rem;
		color: var(--ink-faint);
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		font-size: clamp(1.25rem, 3vw, 1.9rem);
	}

	button,
	a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.35rem;
		background: var(--paper-raised);
		color: var(--ink);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 750;
		text-decoration: none;
		cursor: pointer;
	}

	button:hover,
	a:hover {
		background: var(--paper-soft);
	}

	button:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.close-button {
		width: 2.75rem;
		flex: 0 0 2.75rem;
		padding: 0;
		border: 0;
		font-family: var(--font-sans);
		font-size: 1.75rem;
		font-weight: 400;
	}

	.detail-layout {
		display: grid;
		min-height: 0;
		overflow: hidden;
		grid-template-columns: minmax(0, 1.5fr) minmax(17rem, 0.7fr);
	}

	.image-stage {
		position: relative;
		min-height: 0;
		overflow: auto;
		background: #211812;
		overscroll-behavior: contain;
	}

	.image-button {
		display: grid;
		width: 100%;
		min-height: 100%;
		padding: 1rem;
		place-items: center;
		border: 0;
		border-radius: 0;
		background: transparent;
	}

	.image-button:hover {
		background: rgb(255 255 255 / 3%);
	}

	.image-stage img {
		display: block;
		max-width: 100%;
		max-height: calc(100dvh - 10rem);
		object-fit: contain;
		box-shadow: 0 0.8rem 2.5rem rgb(0 0 0 / 28%);
	}

	.image-stage.zoomed .image-button {
		width: max-content;
		min-width: 100%;
		height: max-content;
		min-height: 100%;
		place-items: start center;
	}

	.image-stage.zoomed img {
		width: auto;
		max-width: none;
		height: auto;
		max-height: none;
	}

	.image-stage > span {
		position: sticky;
		z-index: 2;
		bottom: 0.65rem;
		left: 50%;
		display: block;
		width: max-content;
		max-width: calc(100% - 1rem);
		margin: -2.5rem auto 0.65rem;
		padding: 0.35rem 0.55rem;
		border-radius: 99rem;
		background: rgb(15 11 8 / 76%);
		color: #f5ecdb;
		font-size: 0.66rem;
		translate: -50% 0;
		pointer-events: none;
	}

	.artwork-copy {
		min-height: 0;
		overflow-y: auto;
		padding: clamp(1rem, 3vw, 1.5rem);
		border-left: 1px solid var(--rule);
	}

	.description {
		margin: 0 0 1.25rem;
		color: var(--ink-muted);
		font-family: var(--font-serif);
		font-size: 1.02rem;
		line-height: 1.65;
		text-align: left;
	}

	dl {
		display: grid;
		margin: 0;
		border-top: 1px solid var(--rule);
	}

	dl div {
		display: grid;
		gap: 0.15rem;
		padding-block: 0.7rem;
		border-bottom: 1px solid var(--rule);
	}

	dt {
		color: var(--ink-faint);
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	dd {
		margin: 0;
		color: var(--ink);
		font-size: 0.82rem;
		line-height: 1.5;
	}

	.detail-links {
		display: grid;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	footer {
		border-top: 1px solid var(--rule);
	}

	footer > span {
		color: var(--ink-faint);
		font-size: 0.75rem;
		font-weight: 750;
	}

	@media (max-width: 46rem) {
		dialog {
			width: calc(100% - 0.5rem);
			max-height: calc(100dvh - 0.5rem);
		}

		article {
			max-height: calc(100dvh - 0.5rem);
		}

		.detail-layout {
			display: block;
			overflow-y: auto;
		}

		.image-stage {
			min-height: 16rem;
			max-height: 52dvh;
		}

		.image-stage img {
			max-height: 48dvh;
		}

		.artwork-copy {
			overflow: visible;
			border-top: 1px solid var(--rule);
			border-left: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
		}
	}
</style>
