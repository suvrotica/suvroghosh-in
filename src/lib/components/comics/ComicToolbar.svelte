<script lang="ts">
	import ComicProgress from './ComicProgress.svelte';

	let {
		page,
		pageTotal,
		panel,
		panelTotal,
		mode,
		transcript,
		zoom,
		canPrevious,
		canNext,
		onPrevious,
		onNext,
		onMode,
		onTranscript,
		onZoomOut,
		onZoomIn,
		onFullscreen,
		onPrint
	}: {
		page: number;
		pageTotal: number;
		panel: number;
		panelTotal: number;
		mode: 'panel' | 'page' | 'spread';
		transcript: boolean;
		zoom: number;
		canPrevious: boolean;
		canNext: boolean;
		onPrevious: () => void;
		onNext: () => void;
		onMode: (mode: 'panel' | 'page' | 'spread') => void;
		onTranscript: () => void;
		onZoomOut: () => void;
		onZoomIn: () => void;
		onFullscreen: () => void;
		onPrint: () => void;
	} = $props();
</script>

<div class="comic-toolbar" role="toolbar" aria-label="Comic reader controls">
	<div class="comic-toolbar__navigation">
		<button
			type="button"
			onclick={onPrevious}
			aria-label="Previous panel or page"
			disabled={!canPrevious}>←</button
		>
		<button type="button" onclick={onNext} aria-label="Next panel or page" disabled={!canNext}
			>→</button
		>
	</div>

	<ComicProgress
		current={mode === 'panel' ? panel : page}
		total={mode === 'panel' ? panelTotal : pageTotal}
		label={mode === 'panel'
			? `Page ${page} · panel ${panel} of ${panelTotal}`
			: `Page ${page} of ${pageTotal}`}
	/>

	<div class="comic-toolbar__modes" aria-label="Reading mode">
		<button
			type="button"
			class:active={!transcript && mode === 'panel'}
			aria-pressed={!transcript && mode === 'panel'}
			onclick={() => onMode('panel')}>Panel</button
		>
		<button
			type="button"
			class:active={!transcript && mode === 'page'}
			aria-pressed={!transcript && mode === 'page'}
			onclick={() => onMode('page')}>Page</button
		>
		<button
			type="button"
			class="comic-toolbar__spread"
			class:active={!transcript && mode === 'spread'}
			aria-pressed={!transcript && mode === 'spread'}
			onclick={() => onMode('spread')}>Spread</button
		>
		<button
			type="button"
			class:active={transcript}
			aria-pressed={transcript}
			aria-controls="transcript"
			onclick={onTranscript}>Transcript</button
		>
	</div>

	<div class="comic-toolbar__utilities">
		<button type="button" onclick={onZoomOut} aria-label="Zoom out" disabled={zoom <= 0.75}
			>−</button
		>
		<span aria-live="polite">{Math.round(zoom * 100)}%</span>
		<button type="button" onclick={onZoomIn} aria-label="Zoom in" disabled={zoom >= 1.75}>+</button>
		<button type="button" onclick={onFullscreen}>Full screen</button>
		<button type="button" onclick={onPrint}>Print</button>
	</div>
</div>

<style>
	.comic-toolbar {
		position: sticky;
		z-index: 70;
		top: calc(4.5rem + env(safe-area-inset-top));
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem 1rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.14);
		background: rgb(27 30 31 / 0.96);
		padding: 0.65rem clamp(0.7rem, 2vw, 1.2rem);
		box-shadow: 0 0.4rem 1.2rem rgb(0 0 0 / 0.24);
		backdrop-filter: blur(10px);
	}

	.comic-toolbar__navigation,
	.comic-toolbar__modes,
	.comic-toolbar__utilities {
		display: flex;
		align-items: center;
		gap: 0.28rem;
	}

	.comic-toolbar button {
		min-height: 2.75rem;
		border: 1px solid rgb(255 255 255 / 0.24);
		border-radius: 0.35rem;
		background: transparent;
		padding: 0.4rem 0.7rem;
		color: #f8efdd;
		font:
			650 0.78rem/1 Roboto,
			Arial,
			sans-serif;
	}

	.comic-toolbar button:hover:not(:disabled),
	.comic-toolbar button.active {
		border-color: var(--comic-caption, #f1d996);
		background: rgb(241 217 150 / 0.14);
		color: #fff;
	}

	.comic-toolbar button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.comic-toolbar button:disabled {
		opacity: 0.38;
	}

	.comic-toolbar__utilities span {
		min-width: 3.3rem;
		color: #ddd2bd;
		font:
			600 0.72rem/1 Roboto,
			Arial,
			sans-serif;
		text-align: center;
	}

	@media (max-width: 47.99rem) {
		.comic-toolbar {
			position: static;
		}

		.comic-toolbar__spread {
			display: none;
		}

		.comic-toolbar__utilities {
			width: 100%;
			justify-content: center;
		}
	}

	@media print {
		.comic-toolbar {
			display: none;
		}
	}
</style>
