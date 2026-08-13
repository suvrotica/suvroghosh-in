<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		matrixColour,
		matrixTextColour,
		robustColourDomain,
		transformMatrixValues
	} from './colour';
	import {
		formatNumber,
		type ColourScale,
		type MatrixDisplayMode,
		type MatrixRearrangement
	} from './types';

	let {
		matrix,
		rows,
		columns,
		colourScale = 'diverging',
		highContrast = false,
		rearrangement = 'original',
		comparisonMatrix,
		comparisonEigenError,
		onrearrangementchange = () => undefined
	}: {
		matrix: Float64Array;
		rows: number;
		columns: number;
		colourScale?: ColourScale;
		highContrast?: boolean;
		rearrangement?: MatrixRearrangement;
		comparisonMatrix?: Float64Array;
		comparisonEigenError?: number;
		onrearrangementchange?: (value: MatrixRearrangement) => void;
	} = $props();

	let primaryCanvas: HTMLCanvasElement;
	let comparisonCanvas = $state<HTMLCanvasElement>();
	let canvasRegion: HTMLDivElement;
	let displayMode = $state<MatrixDisplayMode>('raw');
	let threshold = $state(0.5);
	let zoom = $state(1);
	let centreRow = $state(0.5);
	let centreColumn = $state(0.5);
	let selectedRow = $state(0);
	let selectedColumn = $state(0);
	let sourceName = $state<'primary' | 'comparison'>('primary');
	let pointerId: number | null = null;
	let renderFrame: number | null = null;

	const rearrangements: readonly {
		value: MatrixRearrangement;
		label: string;
		invariant: string;
	}[] = [
		{ value: 'original', label: 'Original order', invariant: 'No rearrangement.' },
		{
			value: 'shuffle',
			label: 'Shuffle entries independently',
			invariant: 'Entry histogram preserved; spectrum generally changes.'
		},
		{
			value: 'joint-permutation',
			label: 'Joint row/column permutation PAPᵀ',
			invariant: 'Eigenvalues preserved.'
		},
		{
			value: 'orthogonal-basis',
			label: 'Orthogonal basis QᵀAQ',
			invariant: 'Eigenvalues and singular values preserved.'
		},
		{
			value: 'row-norm',
			label: 'Order by row norm',
			invariant: 'A display ordering; spectrum generally changes if treated as a new matrix.'
		},
		{
			value: 'spectral-order',
			label: 'Spectral ordering · joint PAPᵀ',
			invariant:
				'Symmetric matrices use the largest-|λ| eigenvector; nonsymmetric matrices use the leading left singular vector. Coordinates are then jointly permuted as PAPᵀ, preserving eigenvalues.'
		}
	];

	let transformed = $derived(transformMatrixValues(matrix, displayMode, threshold));
	let comparisonTransformed = $derived(
		comparisonMatrix ? transformMatrixValues(comparisonMatrix, displayMode, threshold) : null
	);
	let sequential = $derived(colourScale === 'sequential' || displayMode === 'absolute');
	let primaryColourValues = $derived(
		sequential ? magnitudeValues(transformed.values) : transformed.values
	);
	let comparisonColourValues = $derived(
		comparisonTransformed
			? sequential
				? magnitudeValues(comparisonTransformed.values)
				: comparisonTransformed.values
			: null
	);
	let domain = $derived(robustColourDomain(primaryColourValues, sequential));
	let primarySelectedValue = $derived(
		transformed.values[selectedRow * columns + selectedColumn] ?? 0
	);
	let comparisonSelectedValue = $derived(
		comparisonTransformed?.values[selectedRow * columns + selectedColumn] ?? 0
	);
	let selectedValue = $derived(
		sourceName === 'comparison' && comparisonTransformed
			? comparisonSelectedValue
			: primarySelectedValue
	);
	let selectedRearrangement = $derived(
		rearrangements.find((item) => item.value === rearrangement) ?? rearrangements[0]
	);
	let primaryMatrixLabel = $derived(
		rearrangement === 'original'
			? 'Original matrix A'
			: rearrangement === 'shuffle'
				? 'Matrix after independent entry shuffle'
				: rearrangement === 'joint-permutation'
					? 'Jointly permuted matrix PAPᵀ'
					: rearrangement === 'orthogonal-basis'
						? 'Orthogonal basis view QᵀAQ'
						: rearrangement === 'row-norm'
							? 'Matrix with rows ordered by norm'
							: 'Spectrally ordered matrix PAPᵀ'
	);
	let comparisonIsActive = $derived(sourceName === 'comparison' && Boolean(comparisonTransformed));
	let rowMeans = $derived(calculateRowMeans(transformed.values));
	let columnMeans = $derived(calculateColumnMeans(transformed.values));
	let histogram = $derived(calculateHistogram(primaryColourValues, 24));

	function magnitudeValues(values: Float64Array): Float64Array {
		const magnitudes = new Float64Array(values.length);
		for (let index = 0; index < values.length; index += 1) {
			magnitudes[index] = Math.abs(values[index] ?? 0);
		}
		return magnitudes;
	}

	function calculateRowMeans(values: Float64Array): Float64Array {
		const means = new Float64Array(rows);
		for (let row = 0; row < rows; row += 1) {
			let sum = 0;
			for (let column = 0; column < columns; column += 1)
				sum += values[row * columns + column] ?? 0;
			means[row] = sum / Math.max(1, columns);
		}
		return means;
	}

	function calculateColumnMeans(values: Float64Array): Float64Array {
		const means = new Float64Array(columns);
		for (let column = 0; column < columns; column += 1) {
			let sum = 0;
			for (let row = 0; row < rows; row += 1) sum += values[row * columns + column] ?? 0;
			means[column] = sum / Math.max(1, rows);
		}
		return means;
	}

	function calculateHistogram(values: Float64Array, binCount: number): readonly number[] {
		const counts = Array.from({ length: binCount }, () => 0);
		const [minimum, maximum] = domain;
		for (const value of values) {
			const fraction = (value - minimum) / Math.max(Number.EPSILON, maximum - minimum);
			const index = Math.max(0, Math.min(binCount - 1, Math.floor(fraction * binCount)));
			counts[index] += 1;
		}
		return counts;
	}

	function viewport() {
		const visibleRows = Math.max(1, rows / zoom);
		const visibleColumns = Math.max(1, columns / zoom);
		const startRow = Math.max(0, Math.min(rows - visibleRows, centreRow * rows - visibleRows / 2));
		const startColumn = Math.max(
			0,
			Math.min(columns - visibleColumns, centreColumn * columns - visibleColumns / 2)
		);
		return { visibleRows, visibleColumns, startRow, startColumn };
	}

	function renderCanvas(
		canvas: HTMLCanvasElement | undefined,
		values: Float64Array,
		colourValues: Float64Array,
		label: string
	): void {
		if (!canvas || typeof window === 'undefined') return;
		const bounds = canvas.getBoundingClientRect();
		if (!(bounds.width > 0 && bounds.height > 0)) return;
		const ratio = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.max(1, Math.round(bounds.width * ratio));
		canvas.height = Math.max(1, Math.round(bounds.height * ratio));
		const context = canvas.getContext('2d');
		if (!context) return;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.imageSmoothingEnabled = false;
		context.clearRect(0, 0, bounds.width, bounds.height);
		context.fillStyle =
			getComputedStyle(canvas).getPropertyValue('--rm-plot-paper').trim() || '#f6f2e8';
		context.fillRect(0, 0, bounds.width, bounds.height);

		const marginLeft = 34;
		const marginTop = 24;
		const marginRight = 8;
		const marginBottom = 10;
		const plotWidth = Math.max(1, bounds.width - marginLeft - marginRight);
		const plotHeight = Math.max(1, bounds.height - marginTop - marginBottom);
		const view = viewport();
		const cellWidth = plotWidth / view.visibleColumns;
		const cellHeight = plotHeight / view.visibleRows;
		const firstRow = Math.max(0, Math.floor(view.startRow));
		const lastRow = Math.min(rows - 1, Math.ceil(view.startRow + view.visibleRows));
		const firstColumn = Math.max(0, Math.floor(view.startColumn));
		const lastColumn = Math.min(columns - 1, Math.ceil(view.startColumn + view.visibleColumns));

		context.save();
		context.beginPath();
		context.rect(marginLeft, marginTop, plotWidth, plotHeight);
		context.clip();
		for (let row = firstRow; row <= lastRow; row += 1) {
			for (let column = firstColumn; column <= lastColumn; column += 1) {
				const index = row * columns + column;
				const value = values[index] ?? 0;
				const colourValue = colourValues[index] ?? 0;
				const x = marginLeft + (column - view.startColumn) * cellWidth;
				const y = marginTop + (row - view.startRow) * cellHeight;
				const colour = matrixColour(
					colourValue,
					domain,
					sequential ? 'sequential' : 'diverging',
					highContrast
				);
				context.fillStyle = colour;
				context.fillRect(
					Math.floor(x),
					Math.floor(y),
					Math.ceil(cellWidth) + 1,
					Math.ceil(cellHeight) + 1
				);
				if (cellWidth >= 36 && cellHeight >= 24) {
					context.fillStyle = matrixTextColour(colour);
					context.font = `${Math.max(11, Math.min(12, cellHeight * 0.32))}px ui-monospace, monospace`;
					context.textAlign = 'center';
					context.textBaseline = 'middle';
					context.fillText(formatNumber(value, 3), x + cellWidth / 2, y + cellHeight / 2);
				}
			}
		}
		if (
			sourceName === label &&
			selectedRow >= firstRow &&
			selectedRow <= lastRow &&
			selectedColumn >= firstColumn &&
			selectedColumn <= lastColumn
		) {
			const x = marginLeft + (selectedColumn - view.startColumn) * cellWidth;
			const y = marginTop + (selectedRow - view.startRow) * cellHeight;
			context.strokeStyle = highContrast ? '#000' : '#f6b44c';
			context.lineWidth = Math.max(2, Math.min(4, cellWidth * 0.08));
			context.strokeRect(x + 1, y + 1, Math.max(1, cellWidth - 2), Math.max(1, cellHeight - 2));
		}
		context.restore();

		context.fillStyle = getComputedStyle(canvas).getPropertyValue('--rm-muted').trim() || '#66716c';
		context.font = '11px ui-monospace, monospace';
		context.textAlign = 'center';
		context.textBaseline = 'bottom';
		const columnStride = Math.max(1, Math.ceil(view.visibleColumns / 8));
		for (let column = firstColumn; column <= lastColumn; column += columnStride) {
			const x = marginLeft + (column + 0.5 - view.startColumn) * cellWidth;
			context.fillText(String(column), x, marginTop - 4);
		}
		context.textAlign = 'right';
		context.textBaseline = 'middle';
		const rowStride = Math.max(1, Math.ceil(view.visibleRows / 8));
		for (let row = firstRow; row <= lastRow; row += rowStride) {
			const y = marginTop + (row + 0.5 - view.startRow) * cellHeight;
			context.fillText(String(row), marginLeft - 5, y);
		}
	}

	function renderAll(): void {
		renderCanvas(primaryCanvas, transformed.values, primaryColourValues, 'primary');
		if (comparisonTransformed && comparisonColourValues) {
			renderCanvas(
				comparisonCanvas,
				comparisonTransformed.values,
				comparisonColourValues,
				'comparison'
			);
		}
	}

	function scheduleRender(): void {
		if (typeof window === 'undefined' || renderFrame !== null) return;
		renderFrame = window.requestAnimationFrame(() => {
			renderFrame = null;
			renderAll();
		});
	}

	$effect(() => {
		const revision = [
			transformed,
			comparisonTransformed,
			primaryColourValues,
			comparisonColourValues,
			domain,
			sequential,
			displayMode,
			threshold,
			zoom,
			centreRow,
			centreColumn,
			selectedRow,
			selectedColumn,
			sourceName,
			highContrast,
			colourScale
		];
		void revision;
		scheduleRender();
	});

	$effect(() => {
		if (!comparisonMatrix && sourceName === 'comparison') sourceName = 'primary';
	});

	onMount(() => {
		const observer = new ResizeObserver(scheduleRender);
		if (canvasRegion) observer.observe(canvasRegion);
		if (primaryCanvas) observer.observe(primaryCanvas);
		if (comparisonCanvas) observer.observe(comparisonCanvas);

		const themeObserver = new MutationObserver(scheduleRender);
		const themeElements = new SvelteSet<Element>([document.documentElement, document.body]);
		for (let element = canvasRegion?.parentElement; element; element = element.parentElement) {
			themeElements.add(element);
		}
		for (const element of themeElements) {
			themeObserver.observe(element, {
				attributes: true,
				attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'data-mode']
			});
		}

		const mediaQueries = [
			window.matchMedia('(prefers-color-scheme: dark)'),
			window.matchMedia('(prefers-contrast: more)'),
			window.matchMedia('(forced-colors: active)')
		];
		for (const query of mediaQueries) query.addEventListener('change', scheduleRender);
		window.addEventListener('resize', scheduleRender, { passive: true });
		window.addEventListener('orientationchange', scheduleRender);
		document.addEventListener('fullscreenchange', scheduleRender);
		scheduleRender();

		return () => {
			observer.disconnect();
			themeObserver.disconnect();
			for (const query of mediaQueries) query.removeEventListener('change', scheduleRender);
			window.removeEventListener('resize', scheduleRender);
			window.removeEventListener('orientationchange', scheduleRender);
			document.removeEventListener('fullscreenchange', scheduleRender);
			if (renderFrame !== null) window.cancelAnimationFrame(renderFrame);
			renderFrame = null;
		};
	});

	function inspect(event: PointerEvent, source: 'primary' | 'comparison'): void {
		const canvas = event.currentTarget as HTMLCanvasElement;
		const bounds = canvas.getBoundingClientRect();
		const marginLeft = 34;
		const marginTop = 24;
		const plotWidth = Math.max(1, bounds.width - marginLeft - 8);
		const plotHeight = Math.max(1, bounds.height - marginTop - 10);
		const x = Math.max(0, Math.min(1, (event.clientX - bounds.left - marginLeft) / plotWidth));
		const y = Math.max(0, Math.min(1, (event.clientY - bounds.top - marginTop) / plotHeight));
		const view = viewport();
		selectedColumn = Math.max(
			0,
			Math.min(columns - 1, Math.floor(view.startColumn + x * view.visibleColumns))
		);
		selectedRow = Math.max(0, Math.min(rows - 1, Math.floor(view.startRow + y * view.visibleRows)));
		sourceName = source;
	}

	function pointerDown(event: PointerEvent, source: 'primary' | 'comparison'): void {
		pointerId = event.pointerId;
		(event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
		inspect(event, source);
	}

	function pointerMove(event: PointerEvent, source: 'primary' | 'comparison'): void {
		if (event.pointerType === 'mouse' || pointerId === event.pointerId) inspect(event, source);
	}

	function pointerUp(event: PointerEvent): void {
		if (pointerId !== event.pointerId) return;
		pointerId = null;
		(event.currentTarget as HTMLCanvasElement).releasePointerCapture(event.pointerId);
	}

	function handleWheel(event: WheelEvent): void {
		event.preventDefault();
		zoom = Math.max(1, Math.min(24, zoom * Math.exp(-event.deltaY * 0.002)));
	}

	function ensureSelectionVisible(): void {
		centreRow = (selectedRow + 0.5) / Math.max(1, rows);
		centreColumn = (selectedColumn + 0.5) / Math.max(1, columns);
	}

	function handleKey(event: KeyboardEvent): void {
		if (event.key === 'ArrowLeft') selectedColumn = Math.max(0, selectedColumn - 1);
		else if (event.key === 'ArrowRight') selectedColumn = Math.min(columns - 1, selectedColumn + 1);
		else if (event.key === 'ArrowUp') selectedRow = Math.max(0, selectedRow - 1);
		else if (event.key === 'ArrowDown') selectedRow = Math.min(rows - 1, selectedRow + 1);
		else if (event.key === '+' || event.key === '=') zoom = Math.min(24, zoom * 1.4);
		else if (event.key === '-') zoom = Math.max(1, zoom / 1.4);
		else if (event.key === 'Home') [selectedRow, selectedColumn] = [0, 0];
		else if (event.key === 'End') [selectedRow, selectedColumn] = [rows - 1, columns - 1];
		else return;
		event.preventDefault();
		ensureSelectionVisible();
	}

	function resetView(): void {
		zoom = 1;
		centreRow = 0.5;
		centreColumn = 0.5;
	}

	function histogramPath(): string {
		const maximum = Math.max(1, ...histogram);
		return histogram
			.map(
				(count, index) =>
					`${index === 0 ? 'M' : 'L'}${(index / Math.max(1, histogram.length - 1)) * 280},${76 - (count / maximum) * 64}`
			)
			.join(' ');
	}

	function meansPath(values: Float64Array, width: number, height: number): string {
		let extent = 0;
		for (const value of values) extent = Math.max(extent, Math.abs(value));
		extent = Math.max(extent, Number.EPSILON);
		return Array.from(values)
			.map(
				(value, index) =>
					`${index === 0 ? 'M' : 'L'}${(index / Math.max(1, values.length - 1)) * width},${height / 2 - (value / extent) * (height * 0.42)}`
			)
			.join(' ');
	}
</script>

<section class="microscope lens-panel" aria-labelledby="matrix-microscope-heading">
	<header class="lens-header">
		<div>
			<p class="eyebrow">LENS 01 · ENTRIES</p>
			<h3 id="matrix-microscope-heading">Matrix microscope</h3>
			<p>Nearest-neighbour pixels: no interpolation is allowed to invent smooth structure.</p>
		</div>
		<div class="cell-readout" aria-live="polite">
			<span
				>{comparisonIsActive ? 'QᵀAQ' : 'displayed matrix'}[{selectedRow}, {selectedColumn}]</span
			>
			<strong>{formatNumber(selectedValue, 6)}</strong>
		</div>
	</header>

	<div class="microscope-toolbar" aria-label="Matrix microscope display controls">
		<label>
			<span>Values</span>
			<select bind:value={displayMode}>
				<option value="raw">Raw</option>
				<option value="standardised">Standardised</option>
				<option value="absolute">Absolute value</option>
				<option value="threshold">Threshold</option>
			</select>
		</label>
		{#if displayMode === 'threshold'}
			<label class="threshold-control">
				<span>|aᵢⱼ| ≥ <output>{threshold.toFixed(2)}</output></span>
				<input
					type="range"
					min="0"
					max={Math.max(1, Math.abs(domain[1]))}
					step="0.01"
					bind:value={threshold}
				/>
			</label>
		{/if}
		<label class="rearrange-control">
			<span>Rearrangement</span>
			<select
				value={rearrangement}
				onchange={(event) =>
					onrearrangementchange(
						(event.currentTarget as HTMLSelectElement).value as MatrixRearrangement
					)}
			>
				{#each rearrangements as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
		<label class="zoom-control">
			<span>Zoom <output>{zoom.toFixed(1)}×</output></span>
			<input type="range" min="1" max="24" step="0.25" bind:value={zoom} />
		</label>
		<button type="button" onclick={resetView}>Fit matrix</button>
	</div>

	<p class="invariant-note"><strong>What survives?</strong> {selectedRearrangement.invariant}</p>

	<div class:split={Boolean(comparisonMatrix)} class="canvas-region" bind:this={canvasRegion}>
		<figure>
			<figcaption>{primaryMatrixLabel}</figcaption>
			<canvas
				bind:this={primaryCanvas}
				data-export-surface
				data-testid="random-matrix-canvas"
				tabindex="0"
				aria-label={`Heatmap of ${primaryMatrixLabel}, ${rows} by ${columns}. Selected row ${selectedRow}, column ${selectedColumn}, value ${formatNumber(primarySelectedValue, 6)}. Use arrow keys to inspect cells and plus or minus to zoom.`}
				onpointerdown={(event) => pointerDown(event, 'primary')}
				onpointermove={(event) => pointerMove(event, 'primary')}
				onpointerup={pointerUp}
				onpointercancel={pointerUp}
				onwheel={handleWheel}
				onkeydown={handleKey}
			></canvas>
		</figure>
		{#if comparisonMatrix}
			<figure>
				<figcaption>Orthogonal change of basis QᵀAQ</figcaption>
				<canvas
					bind:this={comparisonCanvas}
					data-export-surface
					tabindex="0"
					aria-label={`Heatmap of the orthogonally similar matrix. Selected row ${selectedRow}, column ${selectedColumn}, value ${formatNumber(comparisonSelectedValue, 6)}. Use arrow keys to inspect cells and plus or minus to zoom.`}
					onpointerdown={(event) => pointerDown(event, 'comparison')}
					onpointermove={(event) => pointerMove(event, 'comparison')}
					onpointerup={pointerUp}
					onpointercancel={pointerUp}
					onwheel={handleWheel}
					onkeydown={handleKey}
				></canvas>
			</figure>
		{/if}
	</div>

	{#if comparisonMatrix}
		<p class="same-spectrum-note">
			<strong>Same spectrum, different face.</strong> Maximum paired eigenvalue discrepancy:
			<code>{formatNumber(comparisonEigenError, 3)}</code>. The tolerance is numerical, not visual.
		</p>
	{/if}

	<div class="micro-diagnostics">
		<figure>
			<figcaption>
				{sequential ? 'Magnitude histogram' : 'Value histogram'} · clipped to robust colour domain
			</figcaption>
			<svg
				viewBox="0 0 280 84"
				role="img"
				aria-label={`Histogram of ${matrix.length} displayed matrix ${sequential ? 'magnitudes' : 'values'}`}
			>
				<line x1="0" x2="280" y1="76" y2="76" />
				<path d={histogramPath()} />
				<text x="0" y="83">{formatNumber(domain[0], 2)}</text>
				<text x="280" y="83" text-anchor="end">{formatNumber(domain[1], 2)}</text>
			</svg>
		</figure>
		<figure>
			<figcaption>Row means</figcaption>
			<svg viewBox="0 0 280 84" role="img" aria-label="Row means in current display order">
				<line x1="0" x2="280" y1="42" y2="42" />
				<path d={meansPath(rowMeans, 280, 84)} />
			</svg>
		</figure>
		<figure>
			<figcaption>Column means</figcaption>
			<svg viewBox="0 0 280 84" role="img" aria-label="Column means in current display order">
				<line x1="0" x2="280" y1="42" y2="42" />
				<path d={meansPath(columnMeans, 280, 84)} />
			</svg>
		</figure>
	</div>
</section>

<style>
	.microscope {
		min-width: 0;
	}
	.lens-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.lens-header :global(p),
	.lens-header h3,
	figure,
	figcaption,
	.invariant-note,
	.same-spectrum-note {
		margin: 0;
	}
	.lens-header h3 {
		margin-top: 0.12rem;
		font-size: clamp(1.1rem, 2vw, 1.45rem);
	}
	.lens-header p:last-child {
		max-width: 48rem;
		margin-top: 0.22rem;
		color: var(--rm-muted);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.eyebrow {
		color: var(--rm-accent) !important;
		font: 750 0.6875rem var(--rm-mono);
		letter-spacing: 0.11em;
	}
	.cell-readout {
		min-width: 8.5rem;
		border-left: 1px solid var(--rm-rule);
		padding-left: 0.85rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.cell-readout span,
	.cell-readout strong {
		display: block;
	}
	.cell-readout span {
		color: var(--rm-muted);
		font: 650 0.6875rem var(--rm-mono);
	}
	.cell-readout strong {
		margin-top: 0.2rem;
		font: 800 1rem var(--rm-mono);
	}
	.microscope-toolbar {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.8rem;
		border-block: 1px solid var(--rm-rule);
		padding: 0.55rem 0;
	}
	.microscope-toolbar label {
		display: grid;
		min-width: 8.2rem;
		gap: 0.2rem;
		color: var(--rm-muted);
		font-size: 0.6875rem;
		font-weight: 700;
	}
	.microscope-toolbar select,
	.microscope-toolbar button {
		min-height: 2.75rem;
		border: 1px solid var(--rm-control);
		border-radius: 0.35rem;
		background: var(--rm-paper);
		padding: 0.42rem 0.55rem;
		color: var(--rm-ink);
		font: 650 0.74rem var(--rm-sans);
	}
	.microscope-toolbar button {
		font-weight: 750;
		cursor: pointer;
	}
	.rearrange-control {
		flex: 1 1 15rem;
	}
	.zoom-control,
	.threshold-control {
		flex: 1 1 9rem;
	}
	.zoom-control > span,
	.threshold-control > span {
		display: flex;
		justify-content: space-between;
	}
	.microscope-toolbar input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--rm-accent);
	}
	.invariant-note,
	.same-spectrum-note {
		padding: 0.55rem 0;
		color: var(--rm-muted);
		font-size: 0.72rem;
		line-height: 1.45;
	}
	.invariant-note strong,
	.same-spectrum-note strong {
		color: var(--rm-ink);
	}
	.same-spectrum-note {
		border-top: 1px solid var(--rm-rule);
	}
	.same-spectrum-note code {
		color: var(--rm-ink);
	}
	.canvas-region {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.6rem;
		min-width: 0;
	}
	.canvas-region.split {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.canvas-region figure {
		display: grid;
		min-width: 0;
		gap: 0.3rem;
	}
	.canvas-region figcaption,
	.micro-diagnostics figcaption {
		color: var(--rm-muted);
		font: 700 0.6875rem var(--rm-mono);
		letter-spacing: 0.035em;
	}
	canvas {
		display: block;
		width: 100%;
		height: clamp(20rem, 52vw, 42rem);
		min-width: 0;
		border: 1px solid var(--rm-rule);
		border-radius: 0.35rem;
		background: var(--rm-plot-paper);
		touch-action: none;
		cursor: crosshair;
	}
	.split canvas {
		height: clamp(18rem, 34vw, 32rem);
	}
	canvas:focus-visible,
	:where(select, input, button):focus-visible {
		outline: 3px solid var(--rm-focus);
		outline-offset: 2px;
	}
	.micro-diagnostics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
		margin-top: 0.7rem;
	}
	.micro-diagnostics figure {
		min-width: 0;
		border: 1px solid var(--rm-rule);
		border-radius: 0.35rem;
		padding: 0.55rem;
	}
	.micro-diagnostics svg {
		display: block;
		width: 100%;
		height: auto;
		margin-top: 0.35rem;
		overflow: visible;
	}
	.micro-diagnostics line {
		stroke: var(--rm-rule);
		stroke-width: 1;
	}
	.micro-diagnostics path {
		fill: none;
		stroke: var(--rm-accent);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.micro-diagnostics text {
		fill: var(--rm-muted);
		font: 11px var(--rm-mono);
	}
	@media (max-width: 52rem) {
		.canvas-region.split,
		.micro-diagnostics {
			grid-template-columns: minmax(0, 1fr);
		}
		.split canvas {
			height: clamp(18rem, 74vw, 32rem);
		}
	}
	@media (max-width: 34rem) {
		.lens-header {
			flex-direction: column;
		}
		.cell-readout {
			width: 100%;
			border-top: 1px solid var(--rm-rule);
			border-left: 0;
			padding-top: 0.45rem;
			padding-left: 0;
			text-align: left;
		}
		canvas {
			height: min(76vw, 25rem);
		}
	}
	@media (forced-colors: active) {
		canvas,
		.micro-diagnostics figure,
		.microscope-toolbar,
		.same-spectrum-note,
		.microscope-toolbar select,
		.microscope-toolbar button {
			border-color: CanvasText;
		}
	}
</style>
