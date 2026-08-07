<script lang="ts">
	import type {
		ArtworkRecipe,
		ExhibitionRecipe,
		PaletteFamily
	} from '$lib/visualizations/invisible-weather';

	type Props = {
		recipe: ExhibitionRecipe;
		selectedIndex: number;
		palettes: readonly PaletteFamily[];
		onSelect: (index: number) => void;
		onFocus: () => void;
	};

	let { recipe, selectedIndex, palettes, onSelect, onFocus }: Props = $props();
	let selected = $derived(recipe.artworks[selectedIndex] ?? recipe.artworks[0]);
	let paletteName = $derived(
		palettes.find((palette) => palette.id === selected?.paletteId)?.name ??
			selected?.paletteId ??
			'—'
	);
	let groundName = $derived(
		selected?.groundId
			?.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ') ?? '—'
	);

	function workNumber(index: number) {
		return String(index + 1).padStart(2, '0');
	}

	function grammarLabel(artwork: ArtworkRecipe) {
		return artwork.angleMode === 'orthogonal'
			? 'Orthogonal · 90°'
			: artwork.angleMode === 'diagonal'
				? 'Diagonal · 45°'
				: artwork.angleMode === 'hexagonal'
					? 'Hexagonal · 60°'
					: artwork.angleMode === 'soft'
						? 'Soft geometry'
						: artwork.angleMode === 'alternating'
							? 'Alternating regions'
							: 'Free current';
	}

	function transformLabel(artwork: ArtworkRecipe) {
		const transform = artwork.localTransform;
		const rotation = Math.round((transform.rotation * 180) / Math.PI);
		const mirror = transform.mirrorX ? ' · mirrored' : '';
		return `${rotation}° · ${transform.scaleX.toFixed(2)}×${transform.scaleY.toFixed(2)}${mirror}`;
	}
</script>

<section
	class="inspector"
	aria-labelledby="iw-inspector-heading"
	data-testid="invisible-weather-inspector"
>
	<div class="heading-row">
		<div>
			<p class="eyebrow">Selected instrument</p>
			<h3 id="iw-inspector-heading">Work {workNumber(selectedIndex)}</h3>
		</div>
		<button type="button" class="focus-button" onclick={onFocus}>Focus work</button>
	</div>

	{#if selected}
		<dl>
			<div>
				<dt>Local seed</dt>
				<dd title={selected.seed}>{selected.seed.split(':').at(-1)}</dd>
			</div>
			<div>
				<dt>Nested field</dt>
				<dd>Depth {selected.field.depth} · {selected.field.noiseMode}</dd>
			</div>
			<div>
				<dt>Direction</dt>
				<dd>{grammarLabel(selected)}</dd>
			</div>
			<div>
				<dt>Threshold</dt>
				<dd>{selected.threshold.mode} · {selected.threshold.width.toFixed(3)}</dd>
			</div>
			<div>
				<dt>Mask</dt>
				<dd>{selected.mask.replaceAll('-', ' ')}</dd>
			</div>
			<div>
				<dt>Palette</dt>
				<dd>{paletteName}</dd>
			</div>
			<div class="ink-row">
				<dt>Ground and inks</dt>
				<dd>
					<span
						class="swatch"
						style={`--swatch:${selected.ground}`}
						aria-label={`Ground ${selected.ground}`}
					></span>
					<span
						class="swatch"
						style={`--swatch:${selected.primaryInk}`}
						aria-label={`Primary ink ${selected.primaryInk}`}
					></span>
					{#if selected.secondaryInk}
						<span
							class="swatch"
							style={`--swatch:${selected.secondaryInk}`}
							aria-label={`Secondary ink ${selected.secondaryInk}`}
						></span>
					{/if}
					<span class="hexes"
						>{groundName}
						{selected.ground} · primary {selected.primaryInk}{selected.secondaryInk
							? ` · secondary ${selected.secondaryInk}`
							: ''}</span
					>
				</dd>
			</div>
			<div>
				<dt>Local transform</dt>
				<dd>{transformLabel(selected)}</dd>
			</div>
			<div>
				<dt>Path budget</dt>
				<dd>{selected.pathCount.toLocaleString('en')} seeded traces</dd>
			</div>
		</dl>
	{/if}

	<div class="work-list" role="list" aria-label="Generated artworks in keyboard order">
		{#each recipe.artworks as artwork, index (artwork.id)}
			<div role="listitem">
				<button
					type="button"
					aria-current={index === selectedIndex ? 'true' : undefined}
					aria-label={`Select work ${workNumber(index)}: ${grammarLabel(artwork)}, ${artwork.mask.replaceAll('-', ' ')} mask`}
					onclick={() => onSelect(index)}
				>
					<span>{workNumber(index)}</span>
					<small>{artwork.angleMode.slice(0, 4).toUpperCase()}</small>
				</button>
			</div>
		{/each}
	</div>
</section>

<style>
	.inspector {
		border-top: 1px solid var(--iw-rule, #aaa08d);
		padding-top: 0.85rem;
		color: var(--iw-ink, #25231f);
	}

	.heading-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.eyebrow {
		margin: 0 0 0.2rem;
		color: var(--iw-muted, #5c574e);
		font: 750 0.61rem/1.2 var(--font-sans);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0;
		color: inherit;
		font: 650 1.08rem/1.1 var(--font-serif);
	}

	.focus-button {
		min-height: 2.75rem;
		border: 1px solid var(--iw-rule, #aaa08d);
		border-radius: 999px;
		background: transparent;
		padding: 0.55rem 0.85rem;
		color: inherit;
		font: 700 0.72rem/1 var(--font-sans);
		cursor: pointer;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0;
		margin: 0.8rem 0 0;
		border: 1px solid color-mix(in srgb, var(--iw-rule, #aaa08d) 68%, transparent);
		border-radius: 0.55rem;
		overflow: hidden;
	}

	dl > div {
		min-width: 0;
		border-right: 1px solid color-mix(in srgb, var(--iw-rule, #aaa08d) 55%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--iw-rule, #aaa08d) 55%, transparent);
		padding: 0.55rem;
	}

	dl > div:nth-child(2n) {
		border-right: 0;
	}

	dt {
		margin: 0 0 0.18rem;
		color: var(--iw-muted, #5c574e);
		font: 700 0.58rem/1.2 var(--font-sans);
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	dd {
		min-width: 0;
		margin: 0;
		overflow-wrap: anywhere;
		font: 600 0.68rem/1.35 var(--font-sans);
	}

	.ink-row {
		grid-column: 1 / -1;
		border-right: 0;
	}

	.ink-row dd {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.swatch {
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
		border: 1px solid currentColor;
		border-radius: 50%;
		background: var(--swatch);
	}

	.hexes {
		min-width: 0;
		margin-left: 0.2rem;
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-size: 0.6rem;
	}

	.work-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(2.75rem, 1fr));
		gap: 0.35rem;
		margin-top: 0.7rem;
	}

	.work-list > div,
	.work-list button {
		min-width: 0;
	}

	.work-list button {
		display: grid;
		width: 100%;
		min-height: 2.75rem;
		place-content: center;
		border: 1px solid var(--iw-rule, #aaa08d);
		border-radius: 0.4rem;
		background: transparent;
		padding: 0.25rem;
		color: inherit;
		font: 750 0.7rem/1 var(--font-mono);
		cursor: pointer;
	}

	.work-list button[aria-current='true'] {
		border-color: var(--iw-accent, #725a3d);
		background: var(--iw-accent, #725a3d);
		color: #fff;
	}

	.work-list small {
		margin-top: 0.15rem;
		font: 650 0.48rem/1 var(--font-sans);
		letter-spacing: 0.05em;
	}

	button:focus-visible {
		outline: 3px solid var(--iw-focus, #245c73);
		outline-offset: 2px;
	}

	@media (max-width: 27rem) {
		dl {
			grid-template-columns: 1fr;
		}

		dl > div,
		dl > div:nth-child(2n) {
			grid-column: auto;
			border-right: 0;
		}
	}

	:global(html[data-theme='high-contrast']) dl,
	:global(html[data-theme='high-contrast']) .work-list button,
	:global(html[data-theme='high-contrast']) .focus-button {
		border-width: 2px;
	}

	@media (forced-colors: active) {
		.swatch {
			forced-color-adjust: none;
		}

		.work-list button[aria-current='true'] {
			border-color: Highlight;
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
