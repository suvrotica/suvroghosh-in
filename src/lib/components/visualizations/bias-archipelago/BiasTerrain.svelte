<script lang="ts">
	import {
		contours as makeContours,
		interpolateRgb,
		scaleLinear,
		select,
		zoom as createZoom,
		zoomIdentity,
		type Selection,
		type ZoomBehavior
	} from 'd3';
	import { onMount } from 'svelte';
	import BiasLabels from './BiasLabels.svelte';
	import type {
		Bias,
		BiasLayout,
		BiasRelation,
		PeakMarker,
		TerrainGrid
	} from '$lib/visualizations/bias-archipelago/bias-types';

	const viewWidth = 1000;
	const viewHeight = 650;
	const minimumZoom = 0.85;
	const maximumZoom = 4;

	let {
		id = 'bias-map',
		biases,
		layout,
		relations,
		tide,
		selectedId,
		compareId,
		highlightedIds = [],
		markers,
		compact = false,
		onselect,
		onviewchange
	}: {
		id?: string;
		biases: Bias[];
		layout: BiasLayout;
		relations: BiasRelation[];
		tide: number;
		selectedId?: string;
		compareId?: string;
		highlightedIds?: string[];
		markers: Record<string, PeakMarker>;
		compact?: boolean;
		onselect: (id: string) => void;
		onviewchange?: (message: string) => void;
	} = $props();

	let canvas: HTMLCanvasElement;
	let overlay: SVGSVGElement;
	let viewport: HTMLDivElement;
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let dragging = $state(false);
	let hydrated = $state(false);
	let darkMode = $state(false);
	let resizeObserver: ResizeObserver | null = null;
	let zoomBehaviour: ZoomBehavior<HTMLDivElement, unknown> | null = null;
	let zoomSelection: Selection<HTMLDivElement, unknown, null, undefined> | null = null;
	let drawFrame = 0;

	let worldTransform = $derived(`translate(${panX} ${panY}) scale(${zoom})`);

	onMount(() => {
		hydrated = true;
		const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const updateTheme = () => {
			darkMode = darkQuery.matches || document.documentElement.classList.contains('dark');
			scheduleDraw();
		};
		updateTheme();
		darkQuery.addEventListener('change', updateTheme);
		resizeObserver = new ResizeObserver(scheduleDraw);
		resizeObserver.observe(viewport);
		zoomBehaviour = createZoom<HTMLDivElement, unknown>()
			.scaleExtent([minimumZoom, maximumZoom])
			.wheelDelta(
				(event) => -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002)
			)
			.filter((event) => {
				if (event.type === 'dblclick') return false;
				if (event.type === 'wheel' && !event.ctrlKey && !event.metaKey) return false;
				if (event.type === 'touchstart' && (event.touches?.length ?? 0) < 2) return false;
				return !(event.target as Element | null)?.closest('[data-bias-id], .map-tools');
			})
			.on('start', () => {
				dragging = true;
			})
			.on('zoom', (event) => {
				const bounds = viewport.getBoundingClientRect();
				const fitted = fittedMap(bounds);
				zoom = event.transform.k;
				panX = (event.transform.x + (event.transform.k - 1) * fitted.offsetX) / fitted.scale;
				panY = (event.transform.y + (event.transform.k - 1) * fitted.offsetY) / fitted.scale;
			})
			.on('end', () => {
				dragging = false;
				onviewchange?.(`Map view changed. Zoom ${(zoom * 100).toFixed(0)} percent.`);
			});
		zoomSelection = select<HTMLDivElement, unknown>(viewport);
		zoomSelection.call(zoomBehaviour).on('dblclick.zoom', null);
		scheduleDraw();
		return () => {
			darkQuery.removeEventListener('change', updateTheme);
			resizeObserver?.disconnect();
			zoomSelection?.on('.zoom', null);
			if (drawFrame) cancelAnimationFrame(drawFrame);
		};
	});

	$effect(() => {
		void tide;
		void zoom;
		void panX;
		void panY;
		void layout.terrain.values;
		if (hydrated) scheduleDraw();
	});

	function fittedMap(bounds: DOMRect | DOMRectReadOnly) {
		const scale = Math.max(
			0.0001,
			Math.min(Math.max(1, bounds.width) / viewWidth, Math.max(1, bounds.height) / viewHeight)
		);
		return {
			scale,
			offsetX: (bounds.width - viewWidth * scale) / 2,
			offsetY: (bounds.height - viewHeight * scale) / 2
		};
	}

	function scheduleDraw() {
		if (!hydrated || drawFrame) return;
		drawFrame = requestAnimationFrame(() => {
			drawFrame = 0;
			draw();
		});
	}

	function palette() {
		return darkMode
			? {
					deep: [6, 35, 44],
					shallow: [30, 80, 88],
					landLow: [101, 112, 99],
					landHigh: [213, 205, 176],
					grid: 'rgba(174, 205, 205, .09)',
					bathy: 'rgba(135, 194, 199, .32)',
					coast: 'rgba(238, 224, 188, .88)'
				}
			: {
					deep: [31, 79, 91],
					shallow: [112, 163, 163],
					landLow: [155, 159, 137],
					landHigh: [232, 223, 191],
					grid: 'rgba(16, 63, 72, .10)',
					bathy: 'rgba(19, 83, 93, .34)',
					coast: 'rgba(67, 61, 43, .82)'
				};
	}

	function rgb(colour: number[]) {
		return `rgb(${colour.join(', ')})`;
	}

	function normalizedHeight(grid: TerrainGrid, value: number) {
		const span = grid.max - grid.min || 1;
		return Math.max(0, Math.min(1, (value - grid.min) / span));
	}

	function waterSurface() {
		return 0.67 - tide * 0.49;
	}

	function draw() {
		if (!canvas || !viewport) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const targetWidth = Math.round(viewWidth * dpr);
		const targetHeight = Math.round(viewHeight * dpr);
		if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
			canvas.width = targetWidth;
			canvas.height = targetHeight;
		}
		const context = canvas.getContext('2d');
		if (!context) return;
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.clearRect(0, 0, viewWidth, viewHeight);
		context.save();
		context.translate(panX, panY);
		context.scale(zoom, zoom);
		drawField(context, layout.terrain);
		context.restore();
	}

	function drawField(context: CanvasRenderingContext2D, grid: TerrainGrid) {
		const colours = palette();
		const cellWidth = viewWidth / grid.width;
		const cellHeight = viewHeight / grid.height;
		const surface = waterSurface();
		const waterColour = scaleLinear<string>()
			.domain([0, 1])
			.range([rgb(colours.deep), rgb(colours.shallow)])
			.interpolate(interpolateRgb);
		const landColour = scaleLinear<string>()
			.domain([0, 1])
			.range([rgb(colours.landLow), rgb(colours.landHigh)])
			.interpolate(interpolateRgb);
		context.fillStyle = rgb(colours.deep);
		context.fillRect(0, 0, viewWidth, viewHeight);

		for (let y = 0; y < grid.height; y += 1) {
			for (let x = 0; x < grid.width; x += 1) {
				const index = y * grid.width + x;
				const height = normalizedHeight(grid, grid.values[index] ?? grid.min);
				const left = normalizedHeight(grid, grid.values[index - (x > 0 ? 1 : 0)] ?? grid.min);
				const up = normalizedHeight(
					grid,
					grid.values[index - (y > 0 ? grid.width : 0)] ?? grid.min
				);
				const shade = Math.max(-0.16, Math.min(0.16, (height - left) * 0.7 + (height - up) * 0.9));
				let colour: string;
				if (height >= surface) {
					const landPosition = (height - surface) / Math.max(0.01, 1 - surface);
					colour = landColour(Math.max(0, Math.min(1, landPosition + shade)));
				} else {
					const depthPosition = Math.pow(height / Math.max(surface, 0.01), 0.7);
					colour = waterColour(Math.max(0, Math.min(1, depthPosition + shade * 0.45)));
				}
				context.fillStyle = colour;
				context.fillRect(
					x * cellWidth,
					y * cellHeight,
					Math.ceil(cellWidth + 0.5),
					Math.ceil(cellHeight + 0.5)
				);
			}
		}

		drawSurveyGrid(context, colours.grid);
		const normalizedValues = grid.values.map((value) => normalizedHeight(grid, value));
		const thresholds = Array.from(new Set([0.12, 0.22, 0.32, 0.42, 0.52, 0.62, surface]))
			.filter((threshold) => threshold > 0 && threshold < 1)
			.sort((a, b) => a - b);
		const contourFeatures = makeContours().size([grid.width, grid.height]).thresholds(thresholds)(
			normalizedValues
		);
		for (const contour of contourFeatures) {
			const coastline = Math.abs(contour.value - surface) < 0.005;
			context.beginPath();
			traceContour(context, contour.coordinates, grid.width, grid.height);
			context.strokeStyle = coastline ? colours.coast : colours.bathy;
			context.lineWidth = coastline ? 1.7 / zoom : 0.75 / zoom;
			context.setLineDash(coastline ? [] : [3 / zoom, 4 / zoom]);
			context.stroke();
		}
		context.setLineDash([]);
	}

	function traceContour(
		context: CanvasRenderingContext2D,
		coordinates: number[][][][],
		gridWidth: number,
		gridHeight: number
	) {
		for (const polygon of coordinates) {
			for (const ring of polygon) {
				ring.forEach(([x, y], index) => {
					const px = (x / gridWidth) * viewWidth;
					const py = (y / gridHeight) * viewHeight;
					if (index === 0) context.moveTo(px, py);
					else context.lineTo(px, py);
				});
				context.closePath();
			}
		}
	}

	function drawSurveyGrid(context: CanvasRenderingContext2D, stroke: string) {
		context.save();
		context.strokeStyle = stroke;
		context.lineWidth = 0.6 / zoom;
		context.setLineDash([1 / zoom, 5 / zoom]);
		for (let x = 0; x <= viewWidth; x += 100) {
			context.beginPath();
			context.moveTo(x, 0);
			context.lineTo(x, viewHeight);
			context.stroke();
		}
		for (let y = 0; y <= viewHeight; y += 65) {
			context.beginPath();
			context.moveTo(0, y);
			context.lineTo(viewWidth, y);
			context.stroke();
		}
		context.restore();
	}

	function changeZoom(factor: number) {
		if (!zoomSelection || !zoomBehaviour) return;
		zoomSelection.call(zoomBehaviour.scaleBy, factor);
	}

	export function resetView() {
		if (zoomSelection && zoomBehaviour) {
			zoomSelection.call(zoomBehaviour.transform, zoomIdentity);
		} else {
			zoom = 1;
			panX = 0;
			panY = 0;
		}
		onviewchange?.('Map view reset.');
	}

	export function zoomIn() {
		changeZoom(1.25);
	}

	export function zoomOut() {
		changeZoom(0.8);
	}

	export function focusBias(id?: string) {
		const targetId = id ?? layout.points[0]?.id;
		if (!targetId) return;
		requestAnimationFrame(() => {
			overlay?.querySelector<SVGGElement>(`[data-bias-id="${targetId}"]`)?.focus();
		});
	}

	function keyboard(id: string, event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect(id);
			return;
		}
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		const current = layout.points.find((point) => point.id === id);
		if (!current) return;
		const candidates = current.neighbours
			.map((neighbour) => layout.points.find((point) => point.id === neighbour.id))
			.filter((point): point is NonNullable<typeof point> => Boolean(point));
		const directional = candidates.filter((candidate) => {
			if (event.key === 'ArrowLeft') return candidate.x < current.x;
			if (event.key === 'ArrowRight') return candidate.x > current.x;
			if (event.key === 'ArrowUp') return candidate.y < current.y;
			return candidate.y > current.y;
		});
		const target = (directional.length ? directional : candidates).sort((a, b) => {
			const aDistance = Math.hypot(a.x - current.x, a.y - current.y);
			const bDistance = Math.hypot(b.x - current.x, b.y - current.y);
			return aDistance - bDistance;
		})[0];
		if (!target) return;
		const element = overlay.querySelector<SVGGElement>(`[data-bias-id="${target.id}"]`);
		element?.focus();
		onviewchange?.(`${biases.find((bias) => bias.id === target.id)?.name ?? target.id} focused.`);
	}

	function exportSvgMarkup() {
		const clone = overlay.cloneNode(true) as SVGSVGElement;
		clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		clone.setAttribute('width', String(viewWidth));
		clone.setAttribute('height', String(viewHeight));
		clone.style.setProperty('--arch-label', darkMode ? '#f2ebd8' : '#18353a');
		clone.style.setProperty('--arch-label-halo', darkMode ? '#0c2931' : '#edf1e9');
		clone.style.setProperty('--arch-relation', darkMode ? '#f2c777' : '#7b3f2c');
		clone.style.setProperty('--arch-compare', '#efbd62');
		clone.style.setProperty('--arch-focus', '#fff0a6');
		clone.style.setProperty('--arch-peak-stroke', darkMode ? '#071c22' : '#24434a');
		const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
		image.setAttribute('href', canvas.toDataURL('image/png'));
		image.setAttribute('x', '0');
		image.setAttribute('y', '0');
		image.setAttribute('width', String(viewWidth));
		image.setAttribute('height', String(viewHeight));
		clone.insertBefore(image, clone.firstChild);
		const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
		style.textContent = `.bias-label,.family,.mechanism,.depth{paint-order:stroke fill;stroke:var(--arch-label-halo);stroke-width:4px;fill:var(--arch-label);font-family:Georgia,serif}.bias-label{font-size:10px;font-weight:700}.family{font-size:18px;font-style:italic}.mechanism{font-size:20px;font-weight:700}.depth{font-size:7px}.hit{fill:transparent}.peak.dimmed{opacity:.18}.peak.highlighted path,.peak.selected path,.peak.compared path{filter:drop-shadow(0 0 8px var(--arch-focus))}`;
		clone.insertBefore(style, image.nextSibling);
		return new XMLSerializer().serializeToString(clone);
	}

	export async function download(format: 'png' | 'svg') {
		const svgMarkup = exportSvgMarkup();
		if (format === 'svg') {
			downloadBlob(
				new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }),
				'bias-archipelago-view.svg'
			);
			onviewchange?.('Current map downloaded as SVG.');
			return;
		}
		const exportCanvas = document.createElement('canvas');
		exportCanvas.width = 2000;
		exportCanvas.height = 1300;
		const context = exportCanvas.getContext('2d');
		if (!context) return;
		const image = new Image();
		const source = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml' }));
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error('The map SVG could not be rasterized.'));
			image.src = source;
		});
		context.drawImage(image, 0, 0, exportCanvas.width, exportCanvas.height);
		URL.revokeObjectURL(source);
		exportCanvas.toBlob((blob) => {
			if (blob) downloadBlob(blob, 'bias-archipelago-view.png');
		}, 'image/png');
		onviewchange?.('Current map downloaded as PNG.');
	}

	function downloadBlob(blob: Blob, filename: string) {
		const link = document.createElement('a');
		const url = URL.createObjectURL(blob);
		link.href = url;
		link.download = filename;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1_000);
	}
</script>

<div
	bind:this={viewport}
	{id}
	class="viewport"
	class:compact
	class:dragging
	data-testid="bias-map"
	data-tide={tide.toFixed(2)}
	data-zoom={zoom.toFixed(2)}
	role="group"
	aria-label="Interactive bathymetric map of cognitive biases"
	ondblclick={resetView}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	<svg
		bind:this={overlay}
		viewBox={`0 0 ${viewWidth} ${viewHeight}`}
		preserveAspectRatio="xMidYMid meet"
		role="img"
		aria-labelledby={`${id}-title ${id}-description`}
	>
		<title id={`${id}-title`}>The Bias Archipelago</title>
		<desc id={`${id}-description`}>
			A curated explanatory terrain. Biases are separate peaks; shared functional features make
			neighbouring landforms. Use arrow keys to move between neighbouring peaks and Enter to open
			one.
		</desc>
		<g transform={worldTransform}>
			<BiasLabels
				{biases}
				{layout}
				{relations}
				{tide}
				{zoom}
				{selectedId}
				{compareId}
				{highlightedIds}
				{markers}
				{onselect}
				onkeyboard={keyboard}
			/>
		</g>
	</svg>
	<div class="coordinates" aria-hidden="true">
		<span>18°30′N · curated functional space</span>
		<span>{(zoom * 100).toFixed(0)}%</span>
	</div>
	{#if !compact}
		<div class="map-tools" aria-label="Map zoom controls">
			<button type="button" onclick={zoomIn} aria-label="Zoom in">+</button>
			<button type="button" onclick={zoomOut} aria-label="Zoom out">−</button>
			<button type="button" onclick={resetView} aria-label="Reset map position">⌖</button>
		</div>
	{/if}
</div>

<style>
	.viewport {
		position: relative;
		isolation: isolate;
		width: 100%;
		min-height: 24rem;
		overflow: hidden;
		border: 1px solid var(--arch-rule);
		border-radius: 0.55rem;
		background: var(--arch-water-deep);
		touch-action: pan-y;
		cursor: grab;
	}

	.viewport.dragging {
		cursor: grabbing;
	}

	.viewport.compact {
		min-height: 21rem;
	}

	canvas,
	svg {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	canvas {
		object-fit: contain;
	}

	.coordinates {
		position: absolute;
		right: 0.55rem;
		bottom: 0.45rem;
		left: 0.55rem;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: color-mix(in srgb, var(--arch-label) 75%, transparent);
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		pointer-events: none;
		text-transform: uppercase;
	}

	.map-tools {
		position: absolute;
		top: 0.65rem;
		right: 0.65rem;
		display: grid;
		gap: 0.25rem;
	}

	.map-tools button {
		display: grid;
		width: 2.55rem;
		height: 2.55rem;
		place-items: center;
		border: 1px solid var(--arch-rule);
		border-radius: 0.35rem;
		background: color-mix(in srgb, var(--arch-panel) 86%, transparent);
		color: var(--arch-text);
		font: inherit;
		font-size: 1rem;
		cursor: pointer;
	}

	.map-tools button:hover {
		border-color: var(--arch-accent);
	}

	@media (max-width: 44rem) {
		.viewport,
		.viewport.compact {
			min-height: 54dvh;
			max-height: 58dvh;
		}
	}
</style>
