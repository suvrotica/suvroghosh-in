<script lang="ts">
	import type { EnsembleComparisonView, EnsembleSummaryView, RunSummaryView } from './ui-types';

	type Props = {
		comparison: EnsembleComparisonView | null;
		interventionLabel?: string;
		moreTimeNearWithoutBurst?: boolean;
	};

	let {
		comparison,
		interventionLabel = 'Intervention',
		moreTimeNearWithoutBurst = false
	}: Props = $props();

	function percent(value: number) {
		return `${Math.round(value * 100)}%`;
	}

	function firstBurstLabel(summary: EnsembleSummaryView) {
		return summary.medianFirstBurstTime === null
			? `No observed first bursts; ${summary.censoredRuns} of ${summary.runCount} silent at ${summary.observationHorizon} model min`
			: `Median ${summary.medianFirstBurstTime.toFixed(1)} model min among bursting runs; ${summary.censoredRuns} of ${summary.runCount} silent/censored at ${summary.observationHorizon} model min`;
	}

	function threadX(run: RunSummaryView, summary: EnsembleSummaryView, left: number, width: number) {
		return run.firstBurstTime === null
			? left + width
			: left + (run.firstBurstTime / summary.observationHorizon) * width;
	}

	function rowY(index: number) {
		return 62 + index * 9.25;
	}
</script>

<section class="ensemble" aria-labelledby="wn-ensemble-heading" data-testid="nucleus-ensemble">
	<p class="eyebrow">Matched random streams · teaching comparison</p>
	<h2 id="wn-ensemble-heading">Compare 48 possible histories</h2>
	<p class="explanation">
		Each line is one possible modeled history. Baseline and intervention reuse the same seed list;
		the pairing is computational rather than a pairing of biological specimens.
	</p>

	{#if moreTimeNearWithoutBurst}
		<p class="decisive">
			<strong>More time near; no burst in this history.</strong> Across the observation window, the raised-contact
			replay spent a larger fraction of model time in the near state than its matched baseline and produced
			no modeled burst.
		</p>
	{/if}

	{#if comparison}
		<div class="woven-field">
			<svg
				viewBox="0 0 980 540"
				role="img"
				aria-label={`Across ${comparison.baseline.runCount} matched histories, baseline produced bursts in ${comparison.baseline.burstingRuns} runs and ${interventionLabel} produced bursts in ${comparison.intervention.burstingRuns} runs. Silent histories remain shown at the right observation boundary.`}
			>
				<defs>
					<pattern id="wn-silent-weave" width="8" height="8" patternUnits="userSpaceOnUse">
						<path d="M0 8 L8 0" stroke="#a3a5b9" stroke-opacity="0.18" />
					</pattern>
				</defs>
				<rect x="16" y="18" width="948" height="504" rx="12" fill="#070916" stroke="#35384e" />
				<rect x="464" y="52" width="20" height="450" fill="url(#wn-silent-weave)" />
				<rect x="940" y="52" width="20" height="450" fill="url(#wn-silent-weave)" />
				<text x="34" y="42" class="condition"
					>Baseline · {comparison.baseline.burstingRuns}/{comparison.baseline.runCount} burst</text
				>
				<text x="510" y="42" class="condition intervention"
					>{interventionLabel} · {comparison.intervention.burstingRuns}/{comparison.intervention
						.runCount} burst</text
				>
				<text x="465" y="516" class="censored">silent</text>
				<text x="941" y="516" class="censored">silent</text>
				{#each comparison.baselineRuns.slice(0, 48) as run, index (run.seed)}
					{@const endX = threadX(run, comparison.baseline, 34, 430)}
					<path
						d={`M34 ${rowY(index)} H${endX}`}
						stroke="#6ce5ff"
						stroke-opacity={0.23 + Math.min(0.55, run.activeFraction * 1.8)}
						stroke-width={run.burstCount ? 2.2 : 1.2}
					/>
					{#if run.firstBurstTime === null}
						<path
							d={`M456 ${rowY(index) - 3} l7 6 M463 ${rowY(index) - 3} l-7 6`}
							stroke="#8c8fa5"
							stroke-width="1"
						/>
					{:else}
						<circle
							cx={endX}
							cy={rowY(index)}
							r={2.4 + Math.min(3, run.burstCount)}
							fill="#f7fbff"
						/>
					{/if}
				{/each}
				{#each comparison.interventionRuns.slice(0, 48) as run, index (run.seed)}
					{@const endX = threadX(run, comparison.intervention, 510, 430)}
					<path
						d={`M510 ${rowY(index)} H${endX}`}
						stroke="#ed62d0"
						stroke-opacity={0.23 + Math.min(0.58, run.activeFraction * 1.8)}
						stroke-width={run.burstCount ? 2.2 : 1.2}
					/>
					{#if run.firstBurstTime === null}
						<path
							d={`M932 ${rowY(index) - 3} l7 6 M939 ${rowY(index) - 3} l-7 6`}
							stroke="#a69aad"
							stroke-width="1"
						/>
					{:else}
						<circle
							cx={endX}
							cy={rowY(index)}
							r={2.4 + Math.min(3, run.burstCount)}
							fill="#ffd8f4"
						/>
					{/if}
				{/each}
			</svg>
		</div>

		<div class="direct-results" aria-hidden="true">
			<p>
				<span class="baseline-line"></span> Baseline:
				<strong>{percent(comparison.baseline.burstFraction)}</strong>
				burst at least once; mean <strong>{comparison.baseline.meanBurstCount.toFixed(2)}</strong> bursts.
			</p>
			<p>
				<span class="intervention-line"></span>
				{interventionLabel}: <strong>{percent(comparison.intervention.burstFraction)}</strong> burst
				at least once; mean <strong>{comparison.intervention.meanBurstCount.toFixed(2)}</strong> bursts.
			</p>
		</div>

		<p class="conclusion">
			<strong>The odds moved. The outcome did not obey.</strong> Repetition reveals the changed probability;
			no individual result was commanded.
		</p>

		<div class="table-wrap">
			<table>
				<caption
					>Model-distribution summary; silent runs remain in every denominator and are censored at
					the observation horizon.</caption
				>
				<thead>
					<tr
						><th scope="col">Condition</th><th scope="col">Seed count</th><th scope="col"
							>Runs with ≥1 burst</th
						><th scope="col">Mean burst count</th><th scope="col">Time to first burst</th></tr
					>
				</thead>
				<tbody>
					<tr>
						<th scope="row">Baseline</th>
						<td>{comparison.baseline.runCount}</td>
						<td
							>{comparison.baseline.burstingRuns}/{comparison.baseline.runCount} · {percent(
								comparison.baseline.burstFraction
							)}</td
						>
						<td>{comparison.baseline.meanBurstCount.toFixed(2)}</td>
						<td>{firstBurstLabel(comparison.baseline)}</td>
					</tr>
					<tr>
						<th scope="row">{interventionLabel}</th>
						<td>{comparison.intervention.runCount}</td>
						<td
							>{comparison.intervention.burstingRuns}/{comparison.intervention.runCount} · {percent(
								comparison.intervention.burstFraction
							)}</td
						>
						<td>{comparison.intervention.meanBurstCount.toFixed(2)}</td>
						<td>{firstBurstLabel(comparison.intervention)}</td>
					</tr>
				</tbody>
			</table>
		</div>
	{:else}
		<p class="waiting" role="status">
			The last valid single-history trace remains visible while the 48 matched histories are
			calculated.
		</p>
	{/if}
</section>

<style>
	.ensemble {
		border-top: 1px solid rgb(157 155 198 / 28%);
		background: #090b18;
		padding: clamp(1rem, 3vw, 2rem);
		color: #e9e7f2;
	}

	.eyebrow {
		margin: 0;
		color: #8fdff1;
		font: 750 0.65rem/1.2 var(--font-sans, sans-serif);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0.4rem 0 0;
		font: 780 clamp(1.5rem, 3vw, 2.5rem) / 1 var(--font-sans, sans-serif);
		letter-spacing: -0.035em;
	}

	.explanation,
	.decisive,
	.conclusion,
	.waiting {
		max-width: 70ch;
		margin: 0.65rem 0 0;
		color: #b7b6c9;
		font: 0.82rem/1.55 var(--font-sans, sans-serif);
	}

	.decisive {
		border-left: 3px solid #ffd166;
		padding: 0.55rem 0.75rem;
		color: #e5dfca;
	}

	.decisive strong,
	.conclusion strong {
		color: #fff5d5;
	}

	.woven-field {
		margin-top: 1rem;
		overflow-x: auto;
	}

	svg {
		display: block;
		width: 100%;
		min-width: 620px;
		height: auto;
	}

	svg text {
		fill: #bec0d0;
		font:
			700 12px/1 ui-monospace,
			monospace;
	}

	svg .condition.intervention {
		fill: #ffd2f3;
	}

	svg .censored {
		fill: #85889d;
		font-size: 9px;
		text-anchor: middle;
	}

	.direct-results {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 0.7rem;
	}

	.direct-results p {
		margin: 0;
		color: #c7c7d6;
		font: 0.78rem/1.5 var(--font-sans, sans-serif);
	}

	.baseline-line,
	.intervention-line {
		display: inline-block;
		width: 1.8rem;
		height: 0.2rem;
		margin-right: 0.35rem;
		background: #6ce5ff;
		vertical-align: middle;
	}

	.intervention-line {
		background: #ed62d0;
	}

	.conclusion {
		margin-top: 1rem;
		font-size: 0.95rem;
	}

	.table-wrap {
		margin-top: 1.1rem;
		overflow-x: auto;
		border: 1px solid #36394e;
		border-radius: 0.4rem;
	}

	table {
		width: 100%;
		min-width: 690px;
		border-collapse: collapse;
		font: 0.72rem/1.45 var(--font-sans, sans-serif);
	}

	caption {
		background: #0e1020;
		padding: 0.65rem;
		color: #aaaabd;
		text-align: left;
	}

	th,
	td {
		border-top: 1px solid #323548;
		padding: 0.65rem;
		text-align: left;
		vertical-align: top;
	}

	thead th {
		color: #f2eff8;
	}

	tbody th {
		color: #ffd166;
	}

	@media (max-width: 640px) {
		.direct-results {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.ensemble,
		.table-wrap,
		caption {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
