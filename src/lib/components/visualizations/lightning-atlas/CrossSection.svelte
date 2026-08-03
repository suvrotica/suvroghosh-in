<script lang="ts">
	import { createChargePockets } from '$lib/visualizations/lightning-atlas/charge-field';
	import {
		normalizedToWorld,
		sampleTerrainHeight
	} from '$lib/visualizations/lightning-atlas/terrain';
	import type {
		LightningFlash,
		SerializableAtlasState,
		TerrainData
	} from '$lib/visualizations/lightning-atlas/types';

	type Props = {
		state: SerializableAtlasState;
		terrain: TerrainData;
		flash: LightningFlash | null;
		slice: number;
		onslice?: (slice: number) => void;
		onclose?: () => void;
	};

	let { state, terrain, flash, slice, onslice, onclose }: Props = $props();

	const width = 800;
	const height = 380;
	const margin = { left: 44, right: 28, top: 28, bottom: 42 };
	let pockets = $derived(createChargePockets(state, terrain));
	let maximumY = $derived(
		Math.max(
			terrain.maxHeight + 300,
			...pockets.map((pocket) => pocket.center.y + pocket.radii.y * 1.2)
		)
	);
	let minimumY = $derived(Math.min(-80, terrain.minHeight - 40));
	const xPixel = (worldX: number) =>
		margin.left +
		((worldX + terrain.widthMetres / 2) / terrain.widthMetres) *
			(width - margin.left - margin.right);
	const yPixel = (worldY: number) =>
		margin.top +
		((maximumY - worldY) / (maximumY - minimumY)) * (height - margin.top - margin.bottom);
	let worldSliceZ = $derived((slice - 0.5) * terrain.depthMetres);
	let profile = $derived.by(() =>
		Array.from({ length: 101 }, (_, index) => {
			const x = (index / 100 - 0.5) * terrain.widthMetres;
			return { x, y: sampleTerrainHeight(terrain, x, worldSliceZ) };
		})
	);
	let profilePath = $derived(
		`M ${profile.map((point) => `${xPixel(point.x).toFixed(1)},${yPixel(point.y).toFixed(1)}`).join(' L ')} L ${xPixel(terrain.widthMetres / 2)},${height - margin.bottom} L ${xPixel(-terrain.widthMetres / 2)},${height - margin.bottom} Z`
	);
	let mainSegments = $derived(
		flash ? flash.mainPath.map((index) => flash!.segments[index]).filter(Boolean) : []
	);
	let observerWorld = $derived(
		normalizedToWorld(state.observer, terrain.widthMetres, terrain.depthMetres)
	);
	let observerY = $derived(sampleTerrainHeight(terrain, observerWorld.x, observerWorld.z));
	let description = $derived(
		flash
			? `${flash.type} channel in a side cut through ${terrain.preset.replaceAll('-', ' ')}. ${flash.attachment ? `It attaches to ${flash.attachment.label}.` : 'It remains within the cloud.'} The observer is ${flash.observerDistanceMetres.toFixed(0)} metres from the nearest simulated channel section, giving a ${flash.thunderDelaySeconds.toFixed(1)} second first-arrival delay.`
			: `Side cut through ${terrain.preset.replaceAll('-', ' ')} showing simplified charge pockets above the procedural terrain and the observer position.`
	);
</script>

<section
	class="cross-section"
	id="lightning-atlas-cross-section"
	tabindex="-1"
	aria-labelledby="cross-section-heading"
>
	<header>
		<div>
			<p>Analytical cutaway</p>
			<h3 id="cross-section-heading">Storm cross-section</h3>
		</div>
		<button type="button" onclick={onclose}>Close cross-section</button>
	</header>

	<label class="slice-control">
		<span>Cross-section line: {Math.round(slice * 100)}% northward</span>
		<input
			type="range"
			min="0"
			max="1"
			step="0.01"
			value={slice}
			oninput={(event) => onslice?.(Number(event.currentTarget.value))}
		/>
	</label>

	<div class="svg-wrap" role="img" aria-label={description}>
		<svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
			<defs>
				<linearGradient id="cross-sky" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="var(--cross-sky-top)" />
					<stop offset="1" stop-color="var(--cross-sky-bottom)" />
				</linearGradient>
				<marker
					id="arrow-lightning"
					viewBox="0 0 10 10"
					refX="8"
					refY="5"
					markerWidth="5"
					markerHeight="5"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--cross-bolt)" />
				</marker>
				<marker
					id="arrow-sound"
					viewBox="0 0 10 10"
					refX="8"
					refY="5"
					markerWidth="5"
					markerHeight="5"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--cross-sound)" />
				</marker>
			</defs>
			<rect {width} {height} fill="url(#cross-sky)" />

			{#each [0.25, 0.5, 0.75] as contour (contour)}
				<path
					d={`M ${margin.left},${yPixel(minimumY + (maximumY - minimumY) * contour)} C ${width * 0.28},${yPixel(minimumY + (maximumY - minimumY) * (contour + 0.06))} ${width * 0.68},${yPixel(minimumY + (maximumY - minimumY) * (contour - 0.05))} ${width - margin.right},${yPixel(minimumY + (maximumY - minimumY) * contour)}`}
					class="potential-contour"
				/>
			{/each}

			{#each pockets as pocket (pocket.id)}
				<ellipse
					cx={xPixel(pocket.center.x)}
					cy={yPixel(pocket.center.y)}
					rx={(pocket.radii.x / terrain.widthMetres) * (width - margin.left - margin.right)}
					ry={(pocket.radii.y / (maximumY - minimumY)) * (height - margin.top - margin.bottom)}
					class:positive={pocket.polarity > 0}
					class="charge-pocket"
				/>
				<text x={xPixel(pocket.center.x)} y={yPixel(pocket.center.y) + 5} class="polarity">
					{pocket.polarity > 0 ? '+' : '−'}
				</text>
			{/each}

			<path d={profilePath} class="terrain-profile" />
			<line
				x1={margin.left}
				y1={yPixel(Math.min(...profile.map((point) => point.y)) - 8)}
				x2={width - margin.right}
				y2={yPixel(Math.min(...profile.map((point) => point.y)) - 8)}
				class="ground-line"
			/>

			{#if flash}
				{#each flash.segments.filter((segment) => !segment.isMainChannel) as segment (segment)}
					<line
						x1={xPixel(segment.start.x)}
						y1={yPixel(segment.start.y)}
						x2={xPixel(segment.end.x)}
						y2={yPixel(segment.end.y)}
						class="branch"
					/>
				{/each}
				{#each mainSegments as segment (segment)}
					<line
						x1={xPixel(segment.start.x)}
						y1={yPixel(segment.start.y)}
						x2={xPixel(segment.end.x)}
						y2={yPixel(segment.end.y)}
						class="main-channel"
					/>
				{/each}
				{#each flash.streamers as streamer (streamer.id)}
					<line
						x1={xPixel(streamer.start.x)}
						y1={yPixel(streamer.start.y)}
						x2={xPixel(streamer.end.x)}
						y2={yPixel(streamer.end.y)}
						class:winning={streamer.won}
						class="streamer"
					/>
				{/each}
				{#if flash.attachment}
					<circle
						cx={xPixel(flash.attachment.position.x)}
						cy={yPixel(flash.attachment.position.y)}
						r="5"
						class="attachment"
					/>
					<line
						x1={xPixel(flash.attachment.position.x)}
						y1={yPixel(flash.attachment.position.y) - 6}
						x2={xPixel(mainSegments[0]?.start.x ?? flash.attachment.position.x)}
						y2={yPixel(mainSegments[0]?.start.y ?? flash.attachment.position.y)}
						class="return-arrow"
						marker-end="url(#arrow-lightning)"
					/>
					<line
						x1={xPixel(flash.attachment.position.x)}
						y1={yPixel(flash.attachment.position.y)}
						x2={xPixel(observerWorld.x)}
						y2={yPixel(observerY + 18)}
						class="sound-path"
						marker-end="url(#arrow-sound)"
					/>
				{/if}
			{/if}

			<g transform={`translate(${xPixel(observerWorld.x)},${yPixel(observerY)})`} class="observer">
				<line x1="0" y1="0" x2="0" y2="-22" />
				<circle cx="0" cy="-28" r="6" />
				<text x="10" y="-19">observer</text>
			</g>

			<text x={margin.left} y={height - 12} class="axis-label">west</text>
			<text x={width - margin.right} y={height - 12} text-anchor="end" class="axis-label">east</text
			>
			<text x={margin.left + 5} y={margin.top + 14} class="axis-label"
				>normalised potential contours</text
			>
		</svg>
	</div>

	<p class="text-equivalent">{description}</p>
	<ul class="legend" aria-label="Cross-section legend">
		<li><span class="swatch positive"></span> positive charge region</li>
		<li><span class="swatch negative"></span> negative charge region</li>
		<li><span class="swatch bolt"></span> established channel</li>
		<li><span class="swatch sound"></span> approximate sound path</li>
	</ul>
</section>

<style>
	.cross-section {
		border-top: 1px solid var(--atlas-line);
		background: var(--atlas-panel-strong);
		padding: 1rem;
		color: var(--atlas-text);
		--cross-sky-top: #172236;
		--cross-sky-bottom: #283646;
		--cross-bolt: #e9f0ff;
		--cross-sound: #d8a964;
	}

	.cross-section header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.cross-section header p,
	.cross-section header h3 {
		margin: 0;
	}

	.cross-section header p {
		color: var(--atlas-muted);
		font:
			0.65rem 'Courier Prime',
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.cross-section header h3 {
		margin-top: 0.12rem;
		font-size: 1.05rem;
	}

	button {
		min-height: 2.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.35rem;
		background: var(--atlas-control);
		padding: 0.45rem 0.7rem;
		color: inherit;
		font: inherit;
		font-size: 0.74rem;
	}

	.slice-control {
		display: grid;
		grid-template-columns: minmax(11rem, 18rem) 1fr;
		align-items: center;
		gap: 1rem;
		margin: 0.85rem 0 0.65rem;
		color: var(--atlas-muted);
		font-size: 0.72rem;
	}

	.slice-control input {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--atlas-accent);
	}

	.svg-wrap {
		overflow: hidden;
		border: 1px solid var(--atlas-line);
		border-radius: 0.4rem;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
	}

	.potential-contour {
		fill: none;
		stroke: #b7a980;
		stroke-width: 1;
		stroke-dasharray: 5 7;
		opacity: 0.38;
	}

	.charge-pocket {
		fill: #6084bc33;
		stroke: #9ebdf0;
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}

	.charge-pocket.positive {
		fill: #c98b6230;
		stroke: #e9ad85;
	}

	.polarity {
		fill: #f3f0e8;
		font-size: 18px;
		font-weight: 700;
		text-anchor: middle;
	}

	.terrain-profile {
		fill: #263b35;
		stroke: #81988d;
		stroke-width: 2;
	}

	.ground-line {
		stroke: #9a8d6d;
		stroke-width: 1;
		opacity: 0.45;
	}

	.branch,
	.main-channel,
	.streamer,
	.return-arrow,
	.sound-path {
		fill: none;
		stroke-linecap: round;
	}

	.branch {
		stroke: #9aaee2;
		stroke-width: 0.9;
		opacity: 0.46;
	}

	.main-channel {
		stroke: var(--cross-bolt);
		stroke-width: 2.4;
	}

	.streamer {
		stroke: #d0a9e9;
		stroke-width: 1.3;
		stroke-dasharray: 3 3;
	}

	.streamer.winning {
		stroke-width: 2.2;
		stroke-dasharray: none;
	}

	.return-arrow {
		stroke: var(--cross-bolt);
		stroke-width: 1.2;
		stroke-dasharray: 5 4;
	}

	.sound-path {
		stroke: var(--cross-sound);
		stroke-width: 1.5;
		stroke-dasharray: 7 5;
	}

	.attachment {
		fill: #fff3a8;
		stroke: #ffffff;
		stroke-width: 2;
	}

	.observer line,
	.observer circle {
		fill: #f0c46a;
		stroke: #f0c46a;
		stroke-width: 3;
	}

	.observer text,
	.axis-label {
		fill: #d7dbe3;
		font:
			11px 'Courier Prime',
			monospace;
	}

	.text-equivalent {
		margin: 0.65rem 0 0;
		color: var(--atlas-muted);
		font-size: 0.75rem;
		line-height: 1.5;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 1rem;
		margin: 0.65rem 0 0;
		padding: 0;
		color: var(--atlas-muted);
		font-size: 0.68rem;
		list-style: none;
	}

	.swatch {
		display: inline-block;
		width: 0.8rem;
		height: 0.3rem;
		margin-right: 0.25rem;
		vertical-align: middle;
		background: #9ebdf0;
	}

	.swatch.positive {
		background: #e9ad85;
	}
	.swatch.negative {
		background: #9ebdf0;
	}
	.swatch.bolt {
		background: #eef3ff;
	}
	.swatch.sound {
		background: #d8a964;
	}

	:global([data-display-mode='field-map']) .cross-section {
		--cross-sky-top: #d8d1bd;
		--cross-sky-bottom: #ebe5d4;
		--cross-bolt: #283245;
		--cross-sound: #8d5b24;
	}

	:global([data-display-mode='field-map']) .terrain-profile {
		fill: #9b9c7f;
		stroke: #575e50;
	}
	:global([data-display-mode='field-map']) .observer text,
	:global([data-display-mode='field-map']) .axis-label,
	:global([data-display-mode='field-map']) .polarity {
		fill: #252a2f;
	}

	@media (max-width: 600px) {
		.cross-section {
			padding: 0.75rem;
		}
		.slice-control {
			grid-template-columns: 1fr;
			gap: 0.35rem;
		}
		.svg-wrap {
			overflow-x: auto;
		}
		svg {
			min-width: 42rem;
		}
	}
</style>
