<script lang="ts">
	import type { ComicPage as ComicPageData } from '$lib/comics/schema';
	import ComicPanel from './ComicPanel.svelte';

	let {
		page,
		activePanel = null,
		eager = false,
		compact = false
	}: {
		page: ComicPageData;
		activePanel?: number | null;
		eager?: boolean;
		compact?: boolean;
	} = $props();
</script>

<section
	class="comic-page"
	class:comic-page--compact={compact}
	aria-label={`Story page ${page.page}: ${page.title}`}
	data-page={page.page}
>
	<div class="comic-page__number" aria-hidden="true">{page.page}</div>
	<div class="comic-page__grid" style={`--panel-count:${page.panelCount}`}>
		{#each page.panels as panel (panel.id)}
			<ComicPanel
				{panel}
				pageNumber={page.page}
				loading={eager ? 'eager' : 'lazy'}
				active={activePanel === panel.panel}
			/>
		{/each}
	</div>
</section>

<style>
	.comic-page {
		--page-padding: clamp(0.45rem, 1.2vw, 0.85rem);
		position: relative;
		width: min(100%, 62rem);
		aspect-ratio: 0.72;
		overflow: hidden;
		border: 1px solid #9d8e72;
		background: var(--comic-paper, #fff9e9);
		padding: var(--page-padding);
		box-shadow:
			0 1.2rem 2.4rem rgb(31 27 22 / 0.2),
			0 0 0 1px rgb(255 255 255 / 0.6) inset;
	}

	.comic-page__grid {
		display: grid;
		width: 100%;
		height: 100%;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		grid-auto-rows: minmax(0, 1fr);
		gap: var(--comic-gutter, clamp(0.3rem, 0.8vw, 0.65rem));
	}

	:global(.comic-page__grid > .comic-panel) {
		grid-column: span 3;
	}

	:global(.comic-page__grid > .comic-panel--wide),
	:global(.comic-page__grid > .comic-panel--half-page),
	:global(.comic-page__grid > .comic-panel--splash) {
		grid-column: 1 / -1;
	}

	:global(.comic-page__grid > .comic-panel--small) {
		grid-column: span 2;
	}

	:global(.comic-page__grid > .comic-panel--tall) {
		grid-row: span 2;
	}

	:global(.comic-page__grid > .comic-panel--half-page) {
		grid-row: span 2;
	}

	:global(.comic-page__grid > .comic-panel--splash) {
		grid-row: 1 / -1;
	}

	.comic-page__number {
		position: absolute;
		z-index: 50;
		right: 0.35rem;
		bottom: 0.2rem;
		min-width: 1.4rem;
		border-radius: 999px;
		background: rgb(255 249 233 / 0.88);
		padding: 0.12rem 0.35rem;
		color: #463e32;
		font:
			650 0.68rem/1 Roboto,
			Arial,
			sans-serif;
		text-align: center;
	}

	.comic-page--compact {
		width: 100%;
		box-shadow: 0 0.55rem 1.2rem rgb(31 27 22 / 0.16);
	}

	@media print {
		.comic-page {
			width: 190mm;
			height: 264mm;
			aspect-ratio: auto;
			border: 0;
			break-after: page;
			box-shadow: none;
		}
	}
</style>
