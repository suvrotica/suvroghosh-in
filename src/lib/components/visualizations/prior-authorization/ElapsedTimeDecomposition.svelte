<script lang="ts">
	import { scaleLinear } from 'd3-scale';
	import { formatMachineTime, formatPatientElapsed } from './format';
	import type { UiWallSegment } from './ui-types';

	type Props = {
		segments: UiWallSegment[];
		totalMinutes: number;
		pathwayLabel: string;
	};

	let { segments, totalMinutes, pathwayLabel }: Props = $props();
	const width = 960;
	const barHeight = 52;
	let scale = $derived(
		scaleLinear()
			.domain([0, Math.max(1, totalMinutes)])
			.range([0, width])
	);
	let bars = $derived(
		segments.map((segment) => ({
			...segment,
			x: scale(segment.startMinute),
			width: Math.max(0, scale(segment.endMinute) - scale(segment.startMinute)),
			needsMarker:
				segment.durationMinutes > 0 && scale(segment.endMinute) - scale(segment.startMinute) < 1
		}))
	);

	function formatSegmentDuration(minutes: number): string {
		const milliseconds = Math.round(minutes * 60_000);
		return milliseconds < 60_000 ? formatMachineTime(milliseconds) : formatPatientElapsed(minutes);
	}
</script>

<figure class="decomposition" aria-labelledby="decomposition-title">
	<div class="figure-heading">
		<div>
			<p>Wall-time decomposition only</p>
			<h2 id="decomposition-title">Where did Maya’s modeled elapsed time go?</h2>
		</div>
		<strong>{formatPatientElapsed(totalMinutes)}</strong>
	</div>
	<svg viewBox={`0 0 ${width} ${barHeight}`} role="img" aria-labelledby="wall-title wall-desc">
		<title id="wall-title">{pathwayLabel} patient elapsed-time decomposition</title>
		<desc id="wall-desc"
			>A stacked duration bar whose widths remain linearly proportional to disjoint wall-clock
			minutes only. A one-pixel line marks positive sub-pixel intervals without changing their
			encoded bar width. Human work and automated processing are not added to this bar.</desc
		>
		{#each bars as bar (bar.id)}
			<rect
				class={`segment segment-${bar.category}`}
				x={bar.x}
				y="0"
				width={bar.width}
				height={barHeight}
			/>
			{#if bar.needsMarker}<line
					class="subpixel-marker"
					x1={bar.x + bar.width / 2}
					x2={bar.x + bar.width / 2}
					y1="0"
					y2={barHeight}
				/>{/if}
		{/each}
	</svg>
	<ul>
		{#each segments as segment (segment.id)}
			<li>
				<span class={`swatch swatch-${segment.category}`} aria-hidden="true"></span>
				<strong>{segment.label}</strong>
				<data
					value={segment.durationMinutes}
					data-duration-ms={Math.round(segment.durationMinutes * 60_000)}
					>{formatSegmentDuration(segment.durationMinutes)}</data
				>
			</li>
		{/each}
	</ul>
	<figcaption>
		Bar widths use one linear wall-time scale. Positive intervals narrower than one display pixel
		receive a one-pixel centre marker for visibility; that marker is an annotation, not a nonlinear
		duration width. Patient days, staff minutes and machine milliseconds remain different
		quantities.
	</figcaption>
</figure>

<style>
	.decomposition {
		margin: 0;
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-raised);
		padding: 0.8rem;
		color: var(--ink);
	}

	.figure-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.7rem;
	}

	.figure-heading p,
	.figure-heading h2,
	ul,
	figcaption {
		margin: 0;
	}

	.figure-heading p {
		font: 750 0.58rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.figure-heading h2 {
		margin-top: 0.18rem;
		font: 760 0.95rem/1.2 var(--font-sans, sans-serif);
	}

	.figure-heading > strong {
		font: 780 0.95rem/1 var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		border: 1px solid var(--rule);
		border-radius: 0.35rem;
		overflow: hidden;
	}

	.segment-queue,
	.swatch-queue {
		fill: #a39478;
		background: #a39478;
	}

	.segment-human-review,
	.swatch-human-review {
		fill: #9b7b35;
		background: #9b7b35;
	}

	.segment-missing-information,
	.swatch-missing-information {
		fill: #9f4a43;
		background: #9f4a43;
	}

	.segment-transport,
	.swatch-transport {
		fill: #718493;
		background: #718493;
	}

	.segment-scheduling,
	.swatch-scheduling {
		fill: #796f9b;
		background: #796f9b;
	}

	.segment-automated,
	.swatch-automated {
		fill: #4a7f8c;
		background: #4a7f8c;
	}

	.subpixel-marker {
		stroke: var(--ink);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	ul {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem 0.8rem;
		padding: 0.7rem 0 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.35rem;
		font: 0.65rem/1.3 var(--font-sans, sans-serif);
	}

	.swatch {
		display: block;
		width: 0.7rem;
		height: 0.7rem;
		border: 1px solid var(--ink);
		border-radius: 0.15rem;
	}

	li data {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
		color: var(--ink-muted);
	}

	figcaption {
		margin-top: 0.6rem;
		border-top: 1px solid var(--rule);
		padding-top: 0.5rem;
		font: 0.65rem/1.4 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	@media (max-width: 42rem) {
		ul {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.decomposition,
		svg,
		figcaption,
		.swatch {
			border-color: CanvasText;
		}

		.segment {
			fill: Canvas;
			stroke: CanvasText;
			stroke-width: 2;
		}
	}
</style>
