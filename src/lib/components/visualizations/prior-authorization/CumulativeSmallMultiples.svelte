<script lang="ts">
	import { max } from 'd3-array';
	import { scaleLinear } from 'd3-scale';
	import { line } from 'd3-shape';
	import { formatHumanWork, formatMachineTime, formatPatientElapsed } from './format';
	import type { UiCumulativePoint } from './ui-types';

	type Props = {
		points: UiCumulativePoint[];
		activeStep: number;
		pathwayLabel: string;
	};

	let { points, activeStep, pathwayLabel }: Props = $props();
	const width = 320;
	const height = 120;
	const padding = { top: 14, right: 12, bottom: 26, left: 12 };
	const charts = [
		{
			id: 'patient',
			label: 'Patient elapsed',
			unit: 'wall time',
			value: (point: UiCumulativePoint) => point.patientElapsedMinutes,
			format: formatPatientElapsed
		},
		{
			id: 'human',
			label: 'Active human work',
			unit: 'cumulative work',
			value: (point: UiCumulativePoint) => point.humanWorkSeconds,
			format: formatHumanWork
		},
		{
			id: 'machine',
			label: 'Automated processing',
			unit: 'cumulative processing',
			value: (point: UiCumulativePoint) => point.automatedProcessingMs,
			format: formatMachineTime
		}
	];

	let renderedCharts = $derived(
		charts.map((chart) => {
			const x = scaleLinear()
				.domain([0, Math.max(1, points.length - 1)])
				.range([padding.left, width - padding.right]);
			const maximum = max(points, chart.value) ?? 0;
			const y = scaleLinear()
				.domain([0, Math.max(1, maximum)])
				.range([height - padding.bottom, padding.top]);
			const makeLine = line<UiCumulativePoint>()
				.x((_, index) => x(index))
				.y((point) => y(chart.value(point)));
			const safeActive = Math.max(0, Math.min(activeStep, points.length - 1));
			const activePoint = points[safeActive];
			return {
				...chart,
				path: makeLine(points) ?? '',
				maximum,
				activePoint,
				activeX: x(safeActive),
				activeY: activePoint ? y(chart.value(activePoint)) : height - padding.bottom
			};
		})
	);
</script>

<section class="small-multiples" aria-labelledby="small-multiples-heading">
	<div class="heading">
		<p>Three scales for three quantities</p>
		<h2 id="small-multiples-heading">Cumulative clocks by conceptual milestone</h2>
	</div>
	<div class="charts">
		{#each renderedCharts as chart (chart.id)}
			<figure>
				<div class="chart-heading">
					<div><strong>{chart.label}</strong><small>{chart.unit} · independent scale</small></div>
					<output>{chart.activePoint ? chart.format(chart.value(chart.activePoint)) : '0'}</output>
				</div>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-labelledby={`chart-title-${chart.id} chart-desc-${chart.id}`}
				>
					<title id={`chart-title-${chart.id}`}
						>{pathwayLabel}: cumulative {chart.label.toLowerCase()}</title
					>
					<desc id={`chart-desc-${chart.id}`}
						>An independent-scale line across twelve conceptual milestones. The highlighted point is
						milestone {activeStep + 1}.</desc
					>
					<line
						class="axis"
						x1={padding.left}
						x2={width - padding.right}
						y1={height - padding.bottom}
						y2={height - padding.bottom}
					/>
					<path class={`series series-${chart.id}`} d={chart.path} />
					<line
						class="active-guide"
						x1={chart.activeX}
						x2={chart.activeX}
						y1={padding.top}
						y2={height - padding.bottom}
					/>
					<circle
						class={`active-dot active-dot-${chart.id}`}
						cx={chart.activeX}
						cy={chart.activeY}
						r="4"
					/>
					<text x={padding.left} y={height - 8}>01</text>
					<text x={width - padding.right} y={height - 8} text-anchor="end">12</text>
				</svg>
			</figure>
		{/each}
	</div>
	<p class="scale-note">
		These charts align by conceptual milestone, not by normalized percentage. Automated milliseconds
		never share an axis with patient days.
	</p>
</section>

<style>
	.small-multiples {
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-raised);
		padding: 0.8rem;
		color: var(--ink);
	}

	.heading p,
	.heading h2,
	figure,
	.scale-note {
		margin: 0;
	}

	.heading p {
		font: 750 0.58rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.heading h2 {
		margin-top: 0.18rem;
		font: 760 0.95rem/1.2 var(--font-sans, sans-serif);
	}

	.charts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
		margin-top: 0.7rem;
	}

	figure {
		min-width: 0;
		border: 1px solid var(--rule);
		border-radius: 0.55rem;
		background: var(--paper);
		padding: 0.55rem;
	}

	.chart-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.4rem;
	}

	.chart-heading > div {
		display: grid;
		gap: 0.1rem;
	}

	.chart-heading strong {
		font: 750 0.7rem/1.2 var(--font-sans, sans-serif);
	}

	.chart-heading small {
		font: 0.56rem/1.25 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	output {
		font: 760 0.66rem/1.2 var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
	}

	.axis,
	.active-guide {
		stroke: var(--rule);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.active-guide {
		stroke-dasharray: 3 3;
	}

	.series {
		fill: none;
		stroke-width: 2.5;
		vector-effect: non-scaling-stroke;
	}

	.series-patient,
	.active-dot-patient {
		stroke: #b66b52;
		fill: #b66b52;
	}

	.series-human,
	.active-dot-human {
		stroke: #9b7b35;
		fill: #9b7b35;
	}

	.series-machine,
	.active-dot-machine {
		stroke: #4a7f8c;
		fill: #4a7f8c;
	}

	text {
		fill: var(--ink-muted);
		font: 8px var(--font-mono, ui-monospace, monospace);
	}

	.scale-note {
		margin-top: 0.6rem;
		font: 0.64rem/1.4 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	@media (max-width: 58rem) {
		.charts {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.small-multiples,
		figure {
			border-color: CanvasText;
		}

		.series,
		.active-guide,
		.axis {
			stroke: CanvasText;
		}
	}
</style>
