<script lang="ts" module>
	const dimensions = [
		{ key: 'mechanisms', label: 'Mechanisms', weight: 35 },
		{ key: 'tasks', label: 'Tasks / processing stage', weight: 20 },
		{ key: 'triggers', label: 'Triggers', weight: 15 },
		{ key: 'manifestations', label: 'Manifestations', weight: 15 },
		{ key: 'targets', label: 'Targets', weight: 10 },
		{ key: 'temporalStage', label: 'Temporal orientation', weight: 5 }
	] as const;

	function humanize(value: string) {
		return value.replaceAll('-', ' ');
	}
</script>

<script lang="ts">
	import { biasSimilarity } from '$lib/visualizations/bias-archipelago/bias-similarity';
	import type {
		Bias,
		BiasLayout,
		BiasRelation
	} from '$lib/visualizations/bias-archipelago/bias-types';

	let {
		first,
		second,
		layout,
		tide,
		relation,
		onselect,
		onclose
	}: {
		first: Bias;
		second: Bias;
		layout: BiasLayout;
		tide: number;
		relation?: BiasRelation;
		onselect: (id: string) => void;
		onclose: () => void;
	} = $props();

	let similarity = $derived(biasSimilarity(first, second));
	let sharedRows = $derived(
		dimensions
			.map((dimension) => ({
				...dimension,
				values: first[dimension.key].filter((item) => second[dimension.key].includes(item))
			}))
			.filter((row) => row.values.length)
	);
	let firstOnlyRows = $derived(
		dimensions
			.map((dimension) => ({
				...dimension,
				values: first[dimension.key].filter((item) => !second[dimension.key].includes(item))
			}))
			.filter((row) => row.values.length)
	);
	let secondOnlyRows = $derived(
		dimensions
			.map((dimension) => ({
				...dimension,
				values: second[dimension.key].filter((item) => !first[dimension.key].includes(item))
			}))
			.filter((row) => row.values.length)
	);
	let sharedManifestations = $derived(
		first.manifestations.filter((item) => second.manifestations.includes(item))
	);
	let sectionPath = $derived.by(buildSectionPath);
	let waterLine = $derived(104 - (0.67 - tide * 0.49) * 78);
	let sheetHeight = $state(44);
	let dragStartY = 0;
	let dragStartHeight = 44;
	let dragMoved = false;
	let dragging = $state(false);

	function terrainHeight(x: number, y: number) {
		const grid = layout.terrain;
		const gridX = Math.max(0, Math.min(1, x)) * (grid.width - 1);
		const gridY = Math.max(0, Math.min(1, y)) * (grid.height - 1);
		const x0 = Math.floor(gridX);
		const y0 = Math.floor(gridY);
		const x1 = Math.min(grid.width - 1, x0 + 1);
		const y1 = Math.min(grid.height - 1, y0 + 1);
		const tx = gridX - x0;
		const ty = gridY - y0;
		const top =
			(grid.values[y0 * grid.width + x0] ?? grid.min) * (1 - tx) +
			(grid.values[y0 * grid.width + x1] ?? grid.min) * tx;
		const bottom =
			(grid.values[y1 * grid.width + x0] ?? grid.min) * (1 - tx) +
			(grid.values[y1 * grid.width + x1] ?? grid.min) * tx;
		const value = top * (1 - ty) + bottom * ty;
		return (value - grid.min) / Math.max(0.000001, grid.max - grid.min);
	}

	function buildSectionPath() {
		const firstPoint = layout.points.find((point) => point.id === first.id);
		const secondPoint = layout.points.find((point) => point.id === second.id);
		if (!firstPoint || !secondPoint) return 'M0 104L400 104Z';
		const samples = Array.from({ length: 65 }, (_, index) => {
			const progress = index / 64;
			const x = firstPoint.x + (secondPoint.x - firstPoint.x) * progress;
			const y = firstPoint.y + (secondPoint.y - firstPoint.y) * progress;
			return `${(progress * 400).toFixed(2)} ${(104 - terrainHeight(x, y) * 78).toFixed(2)}`;
		});
		return `M0 104L${samples.join('L')}L400 104Z`;
	}

	function differenceSummary(rows: typeof firstOnlyRows) {
		return rows
			.slice(0, 3)
			.flatMap((row) => row.values.slice(0, 2).map((value) => humanize(value)))
			.join(', ');
	}

	function pointerDown(event: PointerEvent) {
		if (window.matchMedia('(min-width: 62rem)').matches) return;
		dragging = true;
		dragMoved = false;
		dragStartY = event.clientY;
		dragStartHeight = sheetHeight;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function pointerMove(event: PointerEvent) {
		if (!dragging) return;
		const delta = ((dragStartY - event.clientY) / window.innerHeight) * 100;
		if (Math.abs(delta) > 1) dragMoved = true;
		sheetHeight = Math.max(25, Math.min(78, dragStartHeight + delta));
	}

	function pointerUp() {
		dragging = false;
		if (!dragMoved) {
			cycleSheetHeight();
			return;
		}
		sheetHeight = sheetHeight > 58 ? 72 : sheetHeight < 34 ? 28 : 44;
	}

	function cycleSheetHeight() {
		sheetHeight = sheetHeight < 36 ? 44 : sheetHeight < 60 ? 72 : 28;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		if (event.key === 'Enter' || event.key === ' ') cycleSheetHeight();
		if (event.key === 'ArrowUp') sheetHeight = sheetHeight < 44 ? 44 : 72;
		if (event.key === 'ArrowDown') sheetHeight = sheetHeight > 44 ? 44 : 28;
		if (event.key === 'Home') sheetHeight = 28;
		if (event.key === 'End') sheetHeight = 72;
	}
</script>

<aside
	class="compare"
	style={`--sheet-height:${sheetHeight}dvh`}
	data-dragging={dragging}
	aria-labelledby="bias-compare-heading"
>
	<button
		class="drag-handle"
		type="button"
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
		onkeydown={handleKeydown}
		aria-label={`Resize comparison sheet. Current height ${Math.round(sheetHeight)} percent. Tap to cycle or use arrow keys.`}
	>
		<span></span>
	</button>
	<header>
		<div>
			<p>Sectional survey · functional similarity {(similarity * 100).toFixed(0)}%</p>
			<h3 id="bias-compare-heading" tabindex="-1">{first.name} ↔ {second.name}</h3>
		</div>
		<button class="close" type="button" onclick={onclose} aria-label="Close comparison">×</button>
	</header>
	<figure>
		<svg viewBox="0 0 400 120" role="img" aria-labelledby="cut-title cut-description">
			<title id="cut-title">Section through {first.name} and {second.name}</title>
			<desc id="cut-description">
				A sampled cross-section of the committed Gaussian terrain between the two selected map
				coordinates.
			</desc>
			<defs>
				<pattern id="compare-strata" width="8" height="8" patternUnits="userSpaceOnUse">
					<path d="M0 7L8 1" stroke="currentColor" stroke-opacity=".18" />
				</pattern>
			</defs>
			<rect width="400" height="120" fill="var(--arch-water-deep)" />
			<path d={sectionPath} fill="var(--arch-land)" stroke="var(--arch-coast)" stroke-width="2" />
			<path d={sectionPath} fill="url(#compare-strata)" />
			<rect
				y={waterLine}
				width="400"
				height={120 - waterLine}
				fill="var(--arch-water-line)"
				opacity=".16"
			/>
			<line
				x1="0"
				y1={waterLine}
				x2="400"
				y2={waterLine}
				stroke="var(--arch-water-line)"
				stroke-dasharray="6 5"
			/>
			<text x="8" y="14" text-anchor="start">{first.name}</text>
			<text x="392" y="14" text-anchor="end">{second.name}</text>
			<text x="200" y="116" text-anchor="middle">committed density field</text>
		</svg>
		<figcaption>
			This profile samples the committed map terrain; it is explanatory, not a measured
			psychological distance. The score uses all six declared feature dimensions and excludes
			research lineage.
		</figcaption>
	</figure>

	<div class="comparison-grid">
		<section>
			<h4>Shared bedrock</h4>
			{#if sharedRows.length}
				<dl class="feature-rows">
					{#each sharedRows as row (row.key)}
						<div>
							<dt>{row.label} · {row.weight}%</dt>
							<dd>{row.values.map(humanize).join(' · ')}</dd>
						</div>
					{/each}
				</dl>
			{:else}
				<p>No controlled-vocabulary feature is shared; the requested comparison is still shown.</p>
			{/if}
		</section>
		<section>
			<h4>Different geology</h4>
			<h5><button type="button" onclick={() => onselect(first.id)}>{first.name}</button></h5>
			<dl class="feature-rows compact">
				{#each firstOnlyRows as row (row.key)}
					<div>
						<dt>{row.label}</dt>
						<dd>{row.values.map(humanize).join(' · ')}</dd>
					</div>
				{/each}
			</dl>
			<h5><button type="button" onclick={() => onselect(second.id)}>{second.name}</button></h5>
			<dl class="feature-rows compact">
				{#each secondOnlyRows as row (row.key)}
					<div>
						<dt>{row.label}</dt>
						<dd>{row.values.map(humanize).join(' · ')}</dd>
					</div>
				{/each}
			</dl>
		</section>
		<section>
			<h4>Why they are confused</h4>
			<p>
				{relation?.explanation ??
					(sharedManifestations.length
						? `Both can produce ${sharedManifestations.map(humanize).join(', ')}, while their recipes and boundary conditions differ.`
						: 'No curated relation or shared manifestation says these labels should be confused; this is a user-directed contrast, not a claim of equivalence.')}
			</p>
		</section>
		<section>
			<h4>A case where only the first applies</h4>
			<p>{first.example}</p>
			<p class="discriminator">
				Treat it as first-only only when {differenceSummary(firstOnlyRows) ||
					'the first record’s boundary conditions'}
				is present and {second.name}'s distinguishing features are absent.
			</p>
		</section>
		<section>
			<h4>A case where only the second applies</h4>
			<p>{second.example}</p>
			<p class="discriminator">
				Treat it as second-only only when {differenceSummary(secondOnlyRows) ||
					'the second record’s boundary conditions'}
				is present and {first.name}'s distinguishing features are absent.
			</p>
		</section>
	</div>
</aside>

<style>
	.compare {
		overflow: auto;
		max-height: 48rem;
		border: 1px solid var(--arch-rule);
		border-radius: 0.65rem;
		background: var(--arch-panel);
		color: var(--arch-text);
	}

	.drag-handle {
		display: none;
	}

	header {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem;
		border-bottom: 1px solid var(--arch-rule);
		background: color-mix(in srgb, var(--arch-panel) 96%, transparent);
		backdrop-filter: blur(0.6rem);
	}

	header p {
		margin: 0 0 0.25rem;
		color: var(--arch-muted);
		font-size: 0.62rem;
		font-weight: 750;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0;
		font-family: var(--arch-serif);
		font-size: 1.2rem;
		line-height: 1.1;
	}

	.close {
		width: 2.5rem;
		height: 2.5rem;
		border: 1px solid var(--arch-rule);
		border-radius: 999px;
		background: transparent;
		color: var(--arch-text);
		font-size: 1.3rem;
		cursor: pointer;
	}

	figure {
		margin: 0;
		padding: 0.8rem 1rem;
		border-bottom: 1px solid var(--arch-rule);
	}

	svg {
		display: block;
		width: 100%;
		max-height: 12rem;
		border: 1px solid var(--arch-rule);
		border-radius: 0.35rem;
		color: var(--arch-text);
	}

	svg text {
		fill: var(--arch-text);
		font-size: 9px;
		font-weight: 700;
	}

	figcaption {
		margin-top: 0.55rem;
		color: var(--arch-muted);
		font-size: 0.68rem;
		line-height: 1.45;
	}

	.comparison-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	section {
		padding: 0.85rem 1rem;
		border-right: 1px solid var(--arch-rule);
		border-bottom: 1px solid var(--arch-rule);
	}

	section:nth-child(2n) {
		border-right: 0;
	}

	section:last-child {
		border-bottom: 0;
	}

	h4,
	h5 {
		margin: 0 0 0.35rem;
		color: var(--arch-accent-bright);
		font-size: 0.65rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	h5 {
		margin-top: 0.7rem;
	}

	h5 button {
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	section p {
		margin: 0;
		font-size: 0.76rem;
		line-height: 1.5;
	}

	section p + p {
		margin-top: 0.45rem;
	}

	.feature-rows {
		display: grid;
		gap: 0.48rem;
		margin: 0;
	}

	.feature-rows div {
		display: grid;
		grid-template-columns: minmax(6.5rem, 0.45fr) 1fr;
		gap: 0.55rem;
	}

	.feature-rows dt {
		color: var(--arch-muted);
		font-size: 0.62rem;
		font-weight: 750;
		text-transform: uppercase;
	}

	.feature-rows dd {
		margin: 0;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	.feature-rows.compact div {
		grid-template-columns: 1fr;
		gap: 0.1rem;
	}

	.discriminator {
		color: var(--arch-muted);
		font-size: 0.68rem;
	}

	@media (max-width: 61.99rem) {
		.compare {
			position: fixed;
			z-index: 40;
			right: 0.5rem;
			bottom: 0;
			left: 0.5rem;
			height: var(--sheet-height);
			max-height: 78dvh;
			border-bottom-right-radius: 0;
			border-bottom-left-radius: 0;
			box-shadow: 0 -1rem 3rem rgb(0 10 14 / 42%);
			transition: height 180ms ease;
		}

		.compare[data-dragging='true'] {
			transition: none;
		}

		.drag-handle {
			display: grid;
			width: 100%;
			height: 2.75rem;
			place-items: center;
			border: 0;
			background: var(--arch-panel);
			touch-action: none;
			cursor: ns-resize;
		}

		.drag-handle span {
			width: 3rem;
			height: 0.25rem;
			border-radius: 999px;
			background: var(--arch-rule);
		}

		header {
			top: 2.75rem;
		}

		.close {
			width: 2.75rem;
			height: 2.75rem;
		}
	}

	@media (max-width: 42rem) {
		.comparison-grid {
			grid-template-columns: 1fr;
		}

		section,
		section:nth-child(2n) {
			border-right: 0;
		}

		.feature-rows div {
			grid-template-columns: 1fr;
			gap: 0.1rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.compare {
			transition: none;
		}
	}
</style>
