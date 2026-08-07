<script lang="ts">
	import { onMount } from 'svelte';
	import { nextAtlasAnnouncementMilestone } from '$lib/visualizations/reaction-diffusion/atlas-progress';
	import { DEFAULT_REACTION_DIFFUSION_SETUP } from '$lib/visualizations/reaction-diffusion/constants';
	import type {
		FieldMetrics,
		GrayScottSetup,
		SpectrumReading
	} from '$lib/visualizations/reaction-diffusion/types';
	import {
		ATLAS_WORKER_PROTOCOL_VERSION,
		isAtlasWorkerResponse,
		type AtlasWorkerResponse
	} from '$lib/visualizations/reaction-diffusion/workers/atlas-protocol';

	export type MorphospaceSelection = {
		feed: number;
		kill: number;
		modelTime: number;
		metrics: FieldMetrics;
		spectrum: SpectrumReading;
	};

	type Props = {
		setup?: GrayScottSetup;
		onloadtile?: (selection: MorphospaceSelection) => void;
		oncompare?: (selection: MorphospaceSelection) => void;
	};

	type AtlasTile = {
		id: string;
		row: number;
		column: number;
		feed: number;
		kill: number;
		field: { readonly size: number; readonly v: Float64Array } | null;
		metrics: FieldMetrics | null;
		spectrum: SpectrumReading | null;
		modelTime: number;
		revision: number;
	};
	const INITIAL_ATLAS_STATUS = 'Ready to calculate. The atlas does no work until you ask.';

	let { setup = { ...DEFAULT_REACTION_DIFFUSION_SETUP }, onloadtile, oncompare }: Props = $props();

	let root = $state<HTMLElement>();
	let feedMinimum = $state(0.02);
	let feedMaximum = $state(0.075);
	let killMinimum = $state(0.045);
	let killMaximum = $state(0.07);
	let modelTimeTarget = $state(360);
	let gridCount = $state(7);
	let tiles = $state<AtlasTile[]>([]);
	let selectedId = $state('');
	let status = $state(INITIAL_ATLAS_STATUS);
	let liveStatus = $state(INITIAL_ATLAS_STATUS);
	let progress = $state(0);
	let currentFeed = $state(0);
	let currentKill = $state(0);
	let calculating = $state(false);
	let paused = $state(false);
	let manualPaused = false;
	let suspended = false;
	let offscreen = false;
	let generation = 0;
	let atlasWorker: Worker | null = null;
	let completedTiles = $state(0);
	let stepsPerTile = $state(0);
	let currentTileStep = $state(0);
	let mounted = false;
	let intersectionObserver: IntersectionObserver | null = null;
	let lastAnnouncedMilestone = 0;

	let selected = $derived(tiles.find((tile) => tile.id === selectedId) ?? null);

	function setStatus(message: string) {
		status = message;
		liveStatus = message;
	}

	onMount(() => {
		mounted = true;
		currentFeed = setup.feed;
		currentKill = setup.kill;
		gridCount = window.matchMedia('(min-width: 800px)').matches ? 9 : 7;
		const listen = (event: Event) => {
			const detail = (event as CustomEvent<{ feed?: number; kill?: number }>).detail;
			if (Number.isFinite(detail?.feed)) currentFeed = detail.feed!;
			if (Number.isFinite(detail?.kill)) currentKill = detail.kill!;
		};
		window.addEventListener('reaction-diffusion:setup', listen);
		const handleVisibility = () => setSuspended(document.hidden || offscreen);
		document.addEventListener('visibilitychange', handleVisibility);
		if (root) {
			intersectionObserver = new IntersectionObserver(
				(entries) => {
					offscreen = !entries.some((entry) => entry.isIntersecting);
					setSuspended(document.hidden || offscreen);
				},
				{ rootMargin: '180px 0px', threshold: 0.01 }
			);
			intersectionObserver.observe(root);
		}
		return () => {
			mounted = false;
			generation += 1;
			if (atlasWorker) {
				atlasWorker.postMessage({
					protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
					generation,
					type: 'DISPOSE'
				});
				atlasWorker.terminate();
				atlasWorker = null;
			}
			window.removeEventListener('reaction-diffusion:setup', listen);
			document.removeEventListener('visibilitychange', handleVisibility);
			intersectionObserver?.disconnect();
		};
	});

	async function start() {
		generation += 1;
		const ownGeneration = generation;
		progress = 0;
		completedTiles = 0;
		currentTileStep = 0;
		stepsPerTile = 0;
		lastAnnouncedMilestone = 0;
		tiles = [];
		selectedId = '';
		calculating = true;
		manualPaused = false;
		suspended = document.hidden || offscreen;
		paused = suspended;
		setStatus(
			suspended
				? 'Preparing the lazy Float64 atlas Worker; this generation will remain suspended while the instrument is hidden or offscreen.'
				: 'Preparing the lazy Float64 atlas Worker. No solver runs on the article thread.'
		);
		try {
			if (!atlasWorker) {
				const module = await import('$lib/visualizations/reaction-diffusion/workers/atlas-client');
				if (!mounted || ownGeneration !== generation) return;
				atlasWorker = module.createReactionDiffusionAtlasWorker();
				atlasWorker.addEventListener('message', handleWorkerMessage);
				atlasWorker.addEventListener('error', handleWorkerError);
			}
			// Visibility can change while the Worker module is loading. Re-read it after
			// the await, then queue PAUSE directly after START so the Worker never pumps
			// an offscreen generation between those ordered messages.
			suspended = document.hidden || offscreen;
			paused = manualPaused || suspended;
			atlasWorker.postMessage({
				protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
				generation: ownGeneration,
				type: 'START',
				input: {
					setup: { ...setup },
					feedMinimum,
					feedMaximum,
					killMinimum,
					killMaximum,
					gridCount,
					modelTime: modelTimeTarget
				}
			});
			if (paused) {
				atlasWorker.postMessage({
					protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
					generation: ownGeneration,
					type: 'PAUSE'
				});
				setStatus(
					suspended
						? 'Atlas Worker prepared and suspended while the instrument is hidden or offscreen.'
						: 'Atlas Worker prepared and paused before its first fixed step.'
				);
			}
		} catch (error) {
			disposeFailedWorker();
			calculating = false;
			paused = false;
			setStatus(
				`The atlas Worker could not start: ${error instanceof Error ? error.message : 'Worker unavailable'}. The deterministic static plate remains available.`
			);
		}
	}

	function handleWorkerMessage(event: MessageEvent<unknown>) {
		if (!isAtlasWorkerResponse(event.data) || event.data.generation !== generation) return;
		const response: AtlasWorkerResponse = event.data;
		if (response.type === 'STARTED') {
			stepsPerTile = response.stepsPerTile;
			tiles = response.definitions.map((definition) => ({
				...definition,
				field: null,
				metrics: null,
				spectrum: null,
				modelTime: 0,
				revision: 0
			}));
			selectedId = tiles[0]?.id ?? '';
			setStatus(
				`Calculating ${tiles.length} independent 32 × 32 experiments progressively in a Float64 CPU Worker.`
			);
		} else if (response.type === 'PROGRESS') {
			progress = response.completedWork / Math.max(1, response.totalWork);
			completedTiles = response.completedTiles;
			currentTileStep = response.currentTileStep;
			stepsPerTile = response.stepsPerTile;
			status = `Worker progress: ${completedTiles} of ${response.totalTiles} tiles complete; the current tile is at step ${currentTileStep} of ${stepsPerTile}, model time ${(currentTileStep * setup.timestep).toFixed(1)}.`;
			const milestone = nextAtlasAnnouncementMilestone(progress, lastAnnouncedMilestone);
			if (milestone !== null) {
				lastAnnouncedMilestone = milestone;
				liveStatus = `Atlas calculation ${milestone}% complete; ${completedTiles} of ${response.totalTiles} tiles are finished.`;
			}
		} else if (response.type === 'TILE_RESULT') {
			tiles = tiles.map((tile) =>
				tile.id === response.tile.id
					? {
							...tile,
							field: { size: response.tile.size, v: response.tile.v },
							metrics: response.tile.metrics,
							spectrum: response.tile.spectrum,
							modelTime: response.tile.modelTime,
							revision: tile.revision + 1
						}
					: tile
			);
		} else if (response.type === 'PAUSED') {
			progress = response.completedWork / Math.max(1, response.totalWork);
			setStatus(
				`Paused after ${completedTiles} complete tiles. Finished tiles remain inspectable.`
			);
		} else if (response.type === 'COMPLETE') {
			progress = 1;
			completedTiles = response.totalTiles;
			calculating = false;
			paused = false;
			setStatus(
				`Complete at common model time ${response.modelTime.toFixed(1)}. Simulation and per-tile spectra ran off the main thread.`
			);
		} else if (response.type === 'ERROR') {
			calculating = false;
			paused = false;
			setStatus(`Calculation stopped without repairing a field: ${response.message}`);
		}
	}

	function handleWorkerError(event: ErrorEvent) {
		disposeFailedWorker();
		calculating = false;
		paused = false;
		setStatus(
			`The atlas Worker stopped unexpectedly: ${event.message || 'unknown Worker failure'}`
		);
	}

	function disposeFailedWorker() {
		if (!atlasWorker) return;
		atlasWorker.removeEventListener('message', handleWorkerMessage);
		atlasWorker.removeEventListener('error', handleWorkerError);
		atlasWorker.terminate();
		atlasWorker = null;
	}

	function togglePause() {
		if (!calculating || !atlasWorker) return;
		manualPaused = !manualPaused;
		paused = manualPaused || suspended;
		atlasWorker.postMessage({
			protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
			generation,
			type: paused ? 'PAUSE' : 'RESUME'
		});
		if (!paused) setStatus('Continuing the same fixed-step Worker experiments.');
	}

	function setSuspended(next: boolean) {
		if (suspended === next) return;
		suspended = next;
		paused = manualPaused || suspended;
		if (!calculating || !atlasWorker) return;
		atlasWorker.postMessage({
			protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
			generation,
			type: paused ? 'PAUSE' : 'RESUME'
		});
		if (suspended) setStatus('Atlas Worker suspended while the instrument is hidden or offscreen.');
		else if (!manualPaused) setStatus('Atlas Worker resumed at the same fixed simulation step.');
	}

	function choose(tile: AtlasTile) {
		selectedId = tile.id;
	}

	function selectionFor(tile: AtlasTile): MorphospaceSelection | null {
		if (!tile.spectrum || !tile.metrics) return null;
		return {
			feed: tile.feed,
			kill: tile.kill,
			modelTime: tile.modelTime,
			metrics: tile.metrics,
			spectrum: tile.spectrum
		};
	}

	function loadTile() {
		if (!selected) return;
		const detail = selectionFor(selected);
		if (!detail) return;
		onloadtile?.(detail);
		window.dispatchEvent(new CustomEvent('reaction-diffusion:load-tile', { detail }));
		setStatus(
			`F=${selected.feed.toFixed(5)}, k=${selected.kill.toFixed(5)} was sent to the laboratory. Its laboratory run begins again from the shared initial condition.`
		);
	}

	function compareTile() {
		if (!selected) return;
		const detail = selectionFor(selected);
		if (!detail) return;
		oncompare?.(detail);
		window.dispatchEvent(new CustomEvent('reaction-diffusion:compare-tile', { detail }));
		setStatus(`The selected tile was sent to the laboratory's synchronized comparison.`);
	}

	function drawTile(node: HTMLCanvasElement, tile: AtlasTile) {
		const render = (value: AtlasTile) => {
			const field = value.field;
			const size = field?.size ?? 32;
			node.width = size;
			node.height = size;
			const context = node.getContext('2d', { alpha: false });
			if (!context) return;
			if (!field) {
				context.fillStyle = '#172321';
				context.fillRect(0, 0, size, size);
				return;
			}
			const image = context.createImageData(size, size);
			for (let index = 0; index < field.v.length; index += 1) {
				const offset = index * 4;
				const v = Math.max(0, Math.min(1, field.v[index] * 2.8));
				image.data[offset] = Math.round(8 + 233 * v);
				image.data[offset + 1] = Math.round(22 + 198 * Math.sqrt(v));
				image.data[offset + 2] = Math.round(25 + 133 * (1 - v) + 48 * v);
				image.data[offset + 3] = 255;
			}
			context.putImageData(image, 0, 0);
		};
		render(tile);
		return { update: render };
	}

	function isCurrent(tile: AtlasTile) {
		if (tiles.length === 0) return false;
		const fSpacing = Math.abs(feedMaximum - feedMinimum) / Math.max(1, gridCount - 1);
		const kSpacing = Math.abs(killMaximum - killMinimum) / Math.max(1, gridCount - 1);
		return (
			Math.abs(tile.feed - currentFeed) <= fSpacing / 2 &&
			Math.abs(tile.kill - currentKill) <= kSpacing / 2
		);
	}

	function spectrumLabel(tile: AtlasTile) {
		if (!tile.spectrum) return calculating ? 'pending' : 'not measured';
		return tile.spectrum.trustworthy
			? `peak λ ${tile.spectrum.dominantWavelength?.toFixed(2)}`
			: 'no credible peak';
	}

	function tileMeasurementLabel(tile: AtlasTile) {
		if (!tile.metrics) return 'calculation pending';
		return `model time ${tile.modelTime.toFixed(1)}, mean V ${tile.metrics.meanV.toPrecision(3)}, variance ${tile.metrics.varianceV.toPrecision(3)}, ${spectrumLabel(tile)}`;
	}
</script>

<section bind:this={root} class="atlas instrument-panel" aria-labelledby="morphospace-title">
	<header>
		<div>
			<p class="eyebrow">Many controlled runs · one finite time</p>
			<h3 id="morphospace-title">Feed–kill morphospace</h3>
			<p>
				This is a live finite-time morphospace under the displayed experiment—not a universal
				Gray–Scott phase diagram. Each square is an independent calculation.
			</p>
		</div>
		<div class="atlas-actions">
			<button type="button" class="primary" onclick={start}
				>{tiles.length ? 'Restart calculation' : 'Calculate atlas'}</button
			>
			<button type="button" onclick={togglePause} disabled={!calculating}
				>{paused ? 'Continue' : 'Pause'}</button
			>
		</div>
	</header>

	<details class="range-controls">
		<summary>Atlas range and common observation time</summary>
		<div class="range-grid">
			<label
				>F minimum <input
					type="number"
					min="0"
					max="0.2"
					step="0.0005"
					bind:value={feedMinimum}
				/></label
			>
			<label
				>F maximum <input
					type="number"
					min="0"
					max="0.2"
					step="0.0005"
					bind:value={feedMaximum}
				/></label
			>
			<label
				>k minimum <input
					type="number"
					min="0"
					max="0.2"
					step="0.0005"
					bind:value={killMinimum}
				/></label
			>
			<label
				>k maximum <input
					type="number"
					min="0"
					max="0.2"
					step="0.0005"
					bind:value={killMaximum}
				/></label
			>
			<label
				>Model time <input
					type="number"
					min="20"
					max="1200"
					step="20"
					bind:value={modelTimeTarget}
				/></label
			>
		</div>
	</details>

	<div class="progress-block">
		<div class="progress-track" aria-hidden="true">
			<span style={`--progress:${progress * 100}%`}></span>
		</div>
		<p>{status} <strong>{Math.round(progress * 100)}%</strong></p>
	</div>
	<p class="sr-status" role="status" aria-live="polite" aria-atomic="true">{liveStatus}</p>

	{#if tiles.length}
		<div class="axis-grid">
			<span class="k-label">kill k ↑</span>
			<div class="tile-grid" style={`--count:${gridCount}`}>
				{#each tiles as tile (tile.id)}
					<button
						type="button"
						class:selected={tile.id === selectedId}
						class:current={isCurrent(tile)}
						onclick={() => choose(tile)}
						aria-label={`F ${tile.feed.toFixed(5)}, k ${tile.kill.toFixed(5)}, ${tileMeasurementLabel(tile)}`}
					>
						<canvas use:drawTile={tile} aria-hidden="true"></canvas>
						{#if isCurrent(tile)}<span class="crosshair" aria-hidden="true"></span>{/if}
						<span class="tile-tip" aria-hidden="true">
							F {tile.feed.toFixed(4)} · k {tile.kill.toFixed(4)}<br />
							{#if tile.metrics}
								t {tile.modelTime.toFixed(1)} · ⟨V⟩ {tile.metrics.meanV.toFixed(4)} · var {tile.metrics.varianceV.toExponential(
									2
								)}<br />
								{spectrumLabel(tile)}
							{:else}
								calculation pending
							{/if}
						</span>
					</button>
				{/each}
			</div>
			<span class="f-label">feed F →</span>
		</div>

		{#if selected}
			<div class="selection" aria-live="polite">
				<div>
					<p class="eyebrow">Selected independent run</p>
					<strong>F = {selected.feed.toFixed(5)} · k = {selected.kill.toFixed(5)}</strong>
					<p>
						{#if selected.metrics}
							model time {selected.modelTime.toFixed(1)} · Mean V {selected.metrics.meanV.toFixed(
								5
							)} · variance V {selected.metrics.varianceV.toExponential(3)} · {spectrumLabel(
								selected
							)}
						{:else}
							This tile is waiting for its progressive Worker batch.
						{/if}
					</p>
				</div>
				<div class="atlas-actions">
					<button type="button" class="primary" onclick={loadTile} disabled={!selected.spectrum}
						>Use this tile in the laboratory</button
					>
					<button type="button" onclick={compareTile} disabled={!selected.spectrum}
						>Compare with current run</button
					>
				</div>
			</div>
		{/if}

		<details class="data-table">
			<summary>Accessible tile measurements ({tiles.length} rows)</summary>
			<div class="table-scroll">
				<table>
					<caption
						>Finite-time morphospace values; common target model time {modelTimeTarget}</caption
					>
					<thead
						><tr
							><th>Tile</th><th>F</th><th>k</th><th>Mean V</th><th>Variance V</th><th>Spectrum</th
							></tr
						></thead
					>
					<tbody>
						{#each tiles as tile (tile.id)}
							<tr
								><th>{tile.row + 1}, {tile.column + 1}</th><td>{tile.feed.toFixed(6)}</td><td
									>{tile.kill.toFixed(6)}</td
								><td>{tile.metrics ? tile.metrics.meanV.toPrecision(6) : 'pending'}</td><td
									>{tile.metrics ? tile.metrics.varianceV.toExponential(4) : 'pending'}</td
								><td
									>{tile.modelTime ? tile.modelTime.toFixed(2) : 'pending'} · {spectrumLabel(
										tile
									)}</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{:else}
		<div class="atlas-poster">
			<img
				src="/images/reaction-diffusion-atlas.png"
				alt="A deterministic Gray–Scott concentration field, standing in while the live feed–kill atlas is idle."
			/>
			<p>Calculation is intentionally idle. Choose a range if needed, then calculate the atlas.</p>
		</div>
	{/if}

	<p class="method-note">
		Common conditions: D<sub>U</sub>
		{setup.diffusionU}, D<sub>V</sub>
		{setup.diffusionV}, Δt {setup.timestep}, periodic 32 × 32 grid, central soft disk, seed “{setup.seed}”.
		Tile edges never exchange neighbours. Results depend on all of these choices and elapsed time.
	</p>
</section>

<noscript>
	<figure class="noscript-plate">
		<img
			src="/images/reaction-diffusion-atlas.png"
			alt="Static deterministic Gray–Scott field with mineral colours."
		/>
		<figcaption>
			The live atlas requires JavaScript; the article and this model-generated plate preserve the
			scientific explanation.
		</figcaption>
	</figure>
</noscript>

<style>
	.instrument-panel {
		--accent: #2d756c;
		margin-block: 2rem;
		border: 1px solid color-mix(in oklab, var(--essay-ink, #24302e) 22%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklab, var(--paper-raised, #faf6ec) 96%, #cfe2d8);
		padding: clamp(1rem, 3vw, 1.6rem);
		color: var(--essay-ink, #24302e);
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	header > div:first-child {
		max-width: 50rem;
	}
	h3 {
		margin: 0 0 0.45rem;
		font-size: clamp(1.45rem, 3vw, 2.2rem);
	}
	header p {
		margin: 0;
	}
	.eyebrow {
		margin: 0 0 0.3rem !important;
		color: var(--accent);
		font-size: 0.75rem;
		font-weight: 850;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.atlas-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	button {
		min-height: 2.6rem;
		border: 1px solid color-mix(in oklab, currentColor 28%, transparent);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--paper, #f5f0e5) 92%, white);
		padding: 0.55rem 0.78rem;
		color: inherit;
		font: 750 0.875rem/1.2 inherit;
		cursor: pointer;
	}
	button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: white;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}
	button:focus-visible,
	input:focus-visible,
	summary:focus-visible {
		outline: 3px solid #e6b94f;
		outline-offset: 2px;
	}
	.range-controls,
	.data-table {
		margin-top: 1rem;
		border-top: 1px solid color-mix(in oklab, currentColor 15%, transparent);
		padding-top: 0.75rem;
	}
	summary {
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 800;
	}
	.range-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
		gap: 0.65rem;
		margin-top: 0.7rem;
	}
	.range-grid label {
		display: grid;
		gap: 0.25rem;
		font-size: 0.875rem;
		font-weight: 800;
	}
	input {
		width: 100%;
		min-height: 2.35rem;
		box-sizing: border-box;
		border: 1px solid color-mix(in oklab, currentColor 24%, transparent);
		border-radius: 0.4rem;
		background: var(--paper, #f5f0e5);
		padding: 0.35rem 0.45rem;
		color: inherit;
		font:
			700 0.78rem/1 ui-monospace,
			monospace;
	}
	.progress-block {
		margin-block: 0.9rem;
	}
	.sr-status {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.progress-block p {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin: 0.35rem 0 0;
		font-size: 0.875rem;
	}
	.progress-track {
		height: 0.35rem;
		overflow: hidden;
		border-radius: 1rem;
		background: color-mix(in oklab, currentColor 12%, transparent);
	}
	.progress-track span {
		display: block;
		width: var(--progress);
		height: 100%;
		background: var(--accent);
	}
	.axis-grid {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		gap: 0.35rem;
		align-items: center;
		max-width: 55rem;
		margin-inline: auto;
	}
	.k-label,
	.f-label {
		font:
			800 0.75rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.k-label {
		grid-row: 1;
		writing-mode: vertical-rl;
		rotate: 180deg;
	}
	.f-label {
		grid-column: 2;
		text-align: center;
	}
	.tile-grid {
		display: grid;
		grid-template-columns: repeat(var(--count), minmax(0, 1fr));
		gap: 2px;
		aspect-ratio: 1;
		overflow: visible;
		background: #091113;
		border: 2px solid #182323;
	}
	.tile-grid button {
		position: relative;
		min-width: 0;
		min-height: 0;
		aspect-ratio: 1;
		border: 0;
		border-radius: 0;
		background: #0b1516;
		padding: 0;
	}
	.tile-grid canvas {
		display: block;
		width: 100%;
		height: 100%;
		image-rendering: pixelated;
	}
	.tile-grid button.selected {
		z-index: 3;
		outline: 3px solid #f1cd70;
		outline-offset: -3px;
	}
	.tile-grid button.current::after {
		content: '';
		position: absolute;
		inset: 12%;
		border: 1px solid white;
		border-radius: 50%;
		box-shadow: 0 0 0 1px #111;
	}
	.crosshair::before,
	.crosshair::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		background: white;
		box-shadow: 0 0 0.12rem #000;
	}
	.crosshair::before {
		width: 48%;
		height: 1px;
	}
	.crosshair::after {
		width: 1px;
		height: 48%;
	}
	.tile-tip {
		position: absolute;
		z-index: 10;
		left: 50%;
		bottom: calc(100% + 0.35rem);
		display: none;
		width: 12.5rem;
		translate: -50% 0;
		border: 1px solid rgb(255 255 255 / 0.2);
		border-radius: 0.35rem;
		background: #101918;
		padding: 0.45rem;
		color: #f6edda;
		font:
			600 0.75rem/1.45 ui-monospace,
			monospace;
		text-align: left;
		pointer-events: none;
	}
	.tile-grid button:hover .tile-tip,
	.tile-grid button:focus-visible .tile-tip {
		display: block;
	}
	.selection {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		margin-top: 1rem;
		border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
		border-radius: 0.65rem;
		padding: 0.8rem;
	}
	.selection p {
		margin: 0.25rem 0 0;
		font-size: 0.875rem;
	}
	.table-scroll {
		overflow-x: auto;
		margin-top: 0.6rem;
	}
	table {
		width: 100%;
		min-width: 42rem;
		border-collapse: collapse;
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}
	caption {
		padding: 0.4rem;
		text-align: left;
		font-weight: 750;
	}
	th,
	td {
		border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
		padding: 0.4rem;
		text-align: right;
	}
	th:first-child {
		text-align: left;
	}
	.atlas-poster {
		display: grid;
		place-items: center;
		min-height: 20rem;
		overflow: hidden;
		border-radius: 0.7rem;
		background: #0b1516;
		color: #f2ead9;
	}
	.atlas-poster img {
		grid-area: 1 / 1;
		width: 100%;
		height: 100%;
		max-height: 34rem;
		object-fit: cover;
		opacity: 0.52;
	}
	.atlas-poster p {
		grid-area: 1 / 1;
		z-index: 1;
		max-width: 25rem;
		margin: 1rem;
		border-radius: 0.4rem;
		background: rgb(8 15 15 / 0.82);
		padding: 0.8rem;
		text-align: center;
	}
	.method-note {
		margin: 1rem 0 0;
		font-size: 0.875rem;
		line-height: 1.5;
		opacity: 0.78;
	}
	.noscript-plate img {
		max-width: 100%;
	}
	@media (max-width: 45rem) {
		.instrument-panel {
			border-radius: 0.7rem;
		}
		.tile-tip {
			width: 9.5rem;
		}
		.progress-block p {
			display: block;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.progress-track span {
			transition: none;
		}
	}
	:global(html[data-theme='night']) .instrument-panel,
	:global(html[data-theme='high-contrast']) .instrument-panel {
		--accent: #8ed8c7;
	}
	:global(html[data-theme='high-contrast']) .instrument-panel {
		border-width: 2px;
	}
</style>
