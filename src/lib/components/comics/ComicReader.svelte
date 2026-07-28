<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, tick } from 'svelte';
	import type { ComicEpisode, ComicPage as ComicPageData } from '$lib/comics/schema';
	import ComicPage from './ComicPage.svelte';
	import ComicPanel from './ComicPanel.svelte';
	import ComicToolbar from './ComicToolbar.svelte';

	let { episode }: { episode: ComicEpisode } = $props();

	let reader: HTMLElement;
	let pageIndex = $state(0);
	let panelIndex = $state(0);
	let mode = $state<'panel' | 'page' | 'spread'>('page');
	let transcript = $state(false);
	let zoom = $state(1);
	let printAll = $state(false);
	let touchStart = $state<{ x: number; y: number } | null>(null);

	const currentPage = $derived(episode.pages[pageIndex]);
	const currentPanel = $derived(currentPage?.panels[panelIndex]);
	const nextSpreadPage = $derived(
		mode === 'spread' && pageIndex + 1 < episode.pages.length ? episode.pages[pageIndex + 1] : null
	);
	const canPrevious = $derived(transcript || panelIndex > 0 || pageIndex > 0);
	const canNext = $derived(
		transcript ||
			(mode === 'panel'
				? panelIndex < currentPage.panels.length - 1 || pageIndex < episode.pages.length - 1
				: pageIndex + (mode === 'spread' ? 2 : 1) < episode.pages.length)
	);
	const storageKey = $derived(`comic-progress:${episode.metadata.seriesId}:${episode.metadata.id}`);

	function persist() {
		if (!browser) return;
		localStorage.setItem(storageKey, JSON.stringify({ pageIndex, panelIndex, mode, zoom }));
	}

	function clampState() {
		pageIndex = Math.min(Math.max(0, pageIndex), Math.max(0, episode.pages.length - 1));
		panelIndex = Math.min(
			Math.max(0, panelIndex),
			Math.max(0, episode.pages[pageIndex]?.panels.length - 1)
		);
	}

	function next() {
		if (transcript) {
			transcript = false;
			return;
		}
		if (mode === 'panel' && panelIndex < currentPage.panels.length - 1) {
			panelIndex += 1;
		} else {
			const advance = mode === 'spread' ? 2 : 1;
			if (pageIndex + advance >= episode.pages.length) return;
			pageIndex += advance;
			panelIndex = 0;
		}
		clampState();
		persist();
	}

	function previous() {
		if (transcript) {
			transcript = false;
			return;
		}
		if (mode === 'panel' && panelIndex > 0) {
			panelIndex -= 1;
		} else if (pageIndex > 0) {
			pageIndex = Math.max(0, pageIndex - (mode === 'spread' ? 2 : 1));
			panelIndex = mode === 'panel' ? episode.pages[pageIndex].panels.length - 1 : 0;
		}
		clampState();
		persist();
	}

	function changeMode(nextMode: 'panel' | 'page' | 'spread') {
		mode = nextMode;
		if (mode === 'spread') pageIndex -= pageIndex % 2;
		transcript = false;
		panelIndex = Math.min(panelIndex, currentPage.panels.length - 1);
		persist();
	}

	function toggleTranscript() {
		transcript = !transcript;
		if (transcript) {
			void tick().then(() => document.querySelector<HTMLElement>('#transcript')?.focus());
		}
	}

	function zoomBy(delta: number) {
		zoom = Math.min(1.75, Math.max(0.75, Number((zoom + delta).toFixed(2))));
		persist();
	}

	async function toggleFullscreen() {
		if (!document.fullscreenElement) await reader.requestFullscreen();
		else await document.exitFullscreen();
	}

	function preparePrint() {
		printAll = true;
		void tick().then(() => window.print());
	}

	function handleAfterPrint() {
		printAll = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (
			target?.isContentEditable ||
			['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
		) {
			return;
		}

		if (event.key === 'ArrowRight' || event.key === 'PageDown') {
			event.preventDefault();
			next();
		} else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
			event.preventDefault();
			previous();
		} else if (event.key === 'Home') {
			event.preventDefault();
			pageIndex = 0;
			panelIndex = 0;
			persist();
		} else if (event.key === 'End') {
			event.preventDefault();
			pageIndex = Math.max(0, episode.pages.length - (mode === 'spread' ? 2 : 1));
			panelIndex = Math.max(0, episode.pages[pageIndex].panels.length - 1);
			persist();
		} else if (event.key.toLocaleLowerCase('en') === 't') {
			event.preventDefault();
			toggleTranscript();
		} else if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			zoomBy(0.25);
		} else if (event.key === '-') {
			event.preventDefault();
			zoomBy(-0.25);
		}
	}

	function handleTouchStart(event: TouchEvent) {
		const touch = event.changedTouches[0];
		touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
	}

	function handleTouchEnd(event: TouchEvent) {
		if (!touchStart) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		const horizontal = touch.clientX - touchStart.x;
		const vertical = touch.clientY - touchStart.y;
		touchStart = null;
		if (Math.abs(horizontal) < 48 || Math.abs(horizontal) < Math.abs(vertical) * 1.4) return;
		if (horizontal < 0) next();
		else previous();
	}

	function goToPage(index: number) {
		pageIndex = mode === 'spread' ? index - (index % 2) : index;
		panelIndex = 0;
		transcript = false;
		persist();
	}

	function preload(page: ComicPageData | undefined) {
		if (!browser || !page) return;
		for (const panel of page.panels) {
			if (!panel.art.final || panel.art.status !== 'final') continue;
			const image = new Image();
			image.src = panel.art.final;
		}
	}

	$effect(() => {
		const advance = mode === 'spread' ? 2 : 1;
		preload(episode.pages[pageIndex + advance]);
	});

	onMount(() => {
		const narrow = window.matchMedia('(max-width: 767px)').matches;
		let restored = false;
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
			if (saved && Number.isInteger(saved.pageIndex) && Number.isInteger(saved.panelIndex)) {
				pageIndex = saved.pageIndex;
				panelIndex = saved.panelIndex;
				mode = saved.mode === 'spread' || saved.mode === 'page' ? saved.mode : 'panel';
				zoom = typeof saved.zoom === 'number' ? saved.zoom : 1;
				restored = true;
			}
		} catch {
			localStorage.removeItem(storageKey);
		}
		if (narrow && !restored) mode = 'panel';
		if (narrow && mode === 'spread') mode = 'panel';
		if (mode === 'spread') pageIndex -= pageIndex % 2;
		clampState();
	});
</script>

<svelte:window onkeydown={handleKeydown} onafterprint={handleAfterPrint} />

<section
	bind:this={reader}
	class="comic-reader"
	style={`--reader-zoom:${zoom}`}
	aria-label={`${episode.metadata.title} comic reader`}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
>
	<a class="comic-reader__skip" href="#comic-reader-content">Skip reader controls</a>

	<ComicToolbar
		page={currentPage.page}
		pageTotal={episode.pages.length}
		panel={currentPanel?.panel ?? 1}
		panelTotal={currentPage.panels.length}
		{mode}
		{transcript}
		{zoom}
		{canPrevious}
		{canNext}
		onPrevious={previous}
		onNext={next}
		onMode={changeMode}
		onTranscript={toggleTranscript}
		onZoomOut={() => zoomBy(-0.25)}
		onZoomIn={() => zoomBy(0.25)}
		onFullscreen={toggleFullscreen}
		onPrint={preparePrint}
	/>

	<div id="comic-reader-content" class="comic-reader__content" tabindex="-1">
		{#if transcript}
			<div class="comic-reader__transcript-jump" role="status">
				<h2>Accessible transcript</h2>
				<p>
					The complete transcript follows the reader, with every visual description, caption, line
					of dialogue, sound, and meaningful visual joke in story order.
				</p>
				<a href="#transcript">Continue to the transcript</a>
			</div>
		{:else if mode === 'panel' && currentPanel}
			<div
				class="comic-reader__guided"
				style={`transform:scale(${zoom})`}
				role="group"
				aria-label={`Page ${currentPage.page}, panel ${currentPanel.panel} of ${currentPage.panels.length}`}
			>
				<ComicPanel panel={currentPanel} pageNumber={currentPage.page} loading="eager" active />
				<div class="comic-reader__guided-context">
					<span>Page {currentPage.page} · panel {currentPanel.panel}</span>
					<strong>{currentPage.title}</strong>
				</div>
			</div>
		{:else}
			<div class="comic-reader__pages" class:comic-reader__pages--spread={mode === 'spread'}>
				<div style={`transform:scale(${zoom})`}>
					<ComicPage page={currentPage} eager />
				</div>
				{#if nextSpreadPage}
					<div style={`transform:scale(${zoom})`}>
						<ComicPage page={nextSpreadPage} eager />
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if !transcript}
		<nav class="comic-reader__thumbnails" aria-label="Story pages">
			{#each episode.pages as page, index (page.page)}
				<button
					type="button"
					class:active={index === pageIndex || (mode === 'spread' && index === pageIndex + 1)}
					aria-current={index === pageIndex ? 'page' : undefined}
					aria-label={`Go to story page ${page.page}: ${page.title}`}
					onclick={() => goToPage(index)}
				>
					{page.page}
				</button>
			{/each}
		</nav>
	{/if}

	{#if printAll}
		<div class="comic-reader__print" aria-hidden="true">
			{#each episode.pages as page (page.page)}
				<ComicPage {page} eager />
			{/each}
		</div>
	{/if}
</section>

<style>
	.comic-reader {
		--comic-paper: #fff9e9;
		--comic-ink: #1e1a16;
		--comic-municipal-red: #8e342d;
		--comic-ledger-green: #49624a;
		--comic-grid-blue: #315f72;
		--comic-caption: #f1d996;
		--comic-gutter: clamp(0.3rem, 0.8vw, 0.65rem);
		--comic-shadow: rgb(20 18 15 / 0.24);
		position: relative;
		overflow: clip;
		border-block: 1px solid #101414;
		background:
			radial-gradient(circle at 20% 10%, rgb(255 255 255 / 0.05), transparent 32rem), #202728;
		color: #f8efdd;
	}

	.comic-reader:fullscreen {
		overflow-y: auto;
	}

	.comic-reader__skip {
		position: absolute;
		z-index: 100;
		top: 0.5rem;
		left: 0.5rem;
		transform: translateY(-200%);
		border-radius: 0.3rem;
		background: #fff;
		padding: 0.6rem 0.8rem;
		color: #111;
	}

	.comic-reader__skip:focus {
		transform: translateY(0);
	}

	.comic-reader__content {
		min-height: min(78svh, 58rem);
		overflow: auto;
		padding: clamp(0.8rem, 3vw, 2.2rem);
		outline: none;
	}

	.comic-reader__pages {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		gap: clamp(0.6rem, 1.5vw, 1.2rem);
	}

	.comic-reader__pages > div {
		width: min(100%, 56rem);
		transform-origin: top center;
		transition: transform 160ms ease-out;
	}

	.comic-reader__pages--spread > div {
		width: min(49%, 42rem);
	}

	.comic-reader__guided {
		width: min(100%, 60rem);
		margin: 0 auto;
		transform-origin: top center;
		transition: transform 160ms ease-out;
	}

	.comic-reader__guided :global(.comic-panel) {
		min-height: min(67svh, 52rem);
	}

	.comic-reader__guided-context {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.8rem 0.2rem 0;
		color: #d9cfbb;
		font:
			600 0.76rem/1.3 Roboto,
			Arial,
			sans-serif;
	}

	.comic-reader__transcript-jump {
		width: min(100%, 42rem);
		margin: 12svh auto 0;
		border: 1px solid rgb(255 255 255 / 0.25);
		background: #303839;
		padding: clamp(1rem, 4vw, 2rem);
		color: #f8efdd;
	}

	.comic-reader__transcript-jump h2 {
		margin: 0;
		color: #fff;
	}

	.comic-reader__transcript-jump p {
		color: #f8efdd;
		text-align: left;
	}

	.comic-reader__transcript-jump a {
		color: #f1d996;
		font-weight: 700;
	}

	.comic-reader__thumbnails {
		display: flex;
		gap: 0.3rem;
		overflow-x: auto;
		border-top: 1px solid rgb(255 255 255 / 0.12);
		padding: 0.75rem;
		scrollbar-width: thin;
	}

	.comic-reader__thumbnails button {
		flex: 0 0 2.75rem;
		min-height: 2.75rem;
		border: 1px solid rgb(255 255 255 / 0.18);
		border-radius: 0.25rem;
		background: #303839;
		color: #d9cfbb;
		font:
			700 0.72rem/1 Roboto,
			Arial,
			sans-serif;
	}

	.comic-reader__thumbnails button.active {
		border-color: var(--comic-caption);
		background: var(--comic-municipal-red);
		color: #fff;
	}

	.comic-reader__thumbnails button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.comic-reader__print {
		display: none;
	}

	@media (max-width: 47.99rem) {
		.comic-reader__content {
			min-height: 64svh;
			padding: 0.7rem;
		}

		.comic-reader__guided :global(.comic-panel) {
			min-height: 58svh;
		}

		.comic-reader__guided-context {
			flex-direction: column;
			gap: 0.2rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.comic-reader__pages > div,
		.comic-reader__guided {
			transition: none;
		}
	}

	@media print {
		.comic-reader {
			overflow: visible;
			border: 0;
			background: #fff;
		}

		.comic-reader__content,
		.comic-reader__thumbnails {
			display: none;
		}

		.comic-reader__print {
			display: block;
		}
	}
</style>
