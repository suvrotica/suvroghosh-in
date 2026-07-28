<script lang="ts">
	import type { ComicTextOverlay } from '$lib/comics/schema';

	let { overlay }: { overlay: ComicTextOverlay } = $props();

	const percent = (value: number) => Number((value * 100).toFixed(4));
	const language = $derived(overlay.language === 'mixed' ? undefined : overlay.language);
	const boxStyle = $derived(
		[
			`--overlay-x:${percent(overlay.x)}%`,
			`--overlay-y:${percent(overlay.y)}%`,
			`--overlay-width:${percent(overlay.width)}%`,
			`--overlay-height:${percent(overlay.height)}%`,
			`--overlay-z:${overlay.z}`
		].join(';')
	);
</script>

<div
	class="comic-text-overlay comic-text-overlay--{overlay.kind}"
	class:comic-text-overlay--review={overlay.reviewRequired && !overlay.publicationAllowed}
	class:comic-text-overlay--bengali={overlay.language === 'bn' || overlay.language === 'mixed'}
	style={boxStyle}
	lang={language}
	aria-hidden="true"
	data-sign-id={overlay.signId}
	data-text-variant={overlay.textVariant}
>
	<span>{overlay.text}</span>
</div>

<style>
	.comic-text-overlay {
		position: absolute;
		z-index: var(--overlay-z);
		top: var(--overlay-y);
		left: var(--overlay-x);
		display: grid;
		box-sizing: border-box;
		width: var(--overlay-width);
		height: var(--overlay-height);
		overflow: hidden;
		place-items: center;
		border: clamp(1px, 0.12vw, 2px) solid var(--comic-ink, #1e1a16);
		border-radius: 0.12rem;
		background: rgb(255 249 233 / 0.94);
		padding: clamp(0.1rem, 0.35vw, 0.28rem);
		color: var(--comic-ink, #1e1a16);
		font:
			750 clamp(0.4rem, 0.85vw, 0.78rem) / 1.08 Roboto,
			Arial,
			sans-serif;
		text-align: center;
		white-space: pre-line;
		text-wrap: balance;
		pointer-events: none;
	}

	.comic-text-overlay--bengali {
		font-family: 'Noto Serif Bengali Variable', 'Noto Serif Bengali', serif;
	}

	.comic-text-overlay--interface,
	.comic-text-overlay--system {
		border-color: var(--comic-grid-blue, #315f72);
		background: rgb(231 240 241 / 0.96);
		font-family: 'Courier Prime', ui-monospace, monospace;
	}

	.comic-text-overlay--report,
	.comic-text-overlay--document,
	.comic-text-overlay--document-conclusion,
	.comic-text-overlay--framed-document {
		background: rgb(255 253 247 / 0.97);
		font-family: 'Source Serif 4', Georgia, serif;
		font-weight: 650;
	}

	.comic-text-overlay--rule,
	.comic-text-overlay--rule-strip {
		background: rgb(247 237 204 / 0.97);
	}

	.comic-text-overlay--review {
		outline: 1px dashed #8e342d;
		outline-offset: -2px;
	}

	@media (forced-colors: active) {
		.comic-text-overlay {
			background: Canvas;
			color: CanvasText;
			forced-color-adjust: auto;
		}
	}
</style>
