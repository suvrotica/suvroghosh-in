<script lang="ts">
	import type { ScientificDiagnostics } from '$lib/visualizations/strange-attractor-orchestra';

	type Props = {
		pointCount?: number;
		eventCount?: number;
		generationMs?: number;
		fps?: number;
		workerMode?: string;
		renderer?: string;
		diagnostics?: ScientificDiagnostics;
		lyapunovUnit?: 'per simulated time unit' | 'per iteration';
		audioLookaheadMs?: number;
	};

	let {
		pointCount = 0,
		eventCount = 0,
		generationMs = 0,
		fps = 0,
		workerMode = 'warming',
		renderer = 'not loaded',
		diagnostics,
		lyapunovUnit = 'per simulated time unit',
		audioLookaheadMs = 125
	}: Props = $props();

	type ScalarComparison = NonNullable<
		ScientificDiagnostics['stepComparison']['finiteTimeLyapunovComparison']
	>;

	function vectorText(values: readonly number[] | null | undefined): string {
		return values ? values.map((value) => value.toFixed(3)).join(' / ') : 'not available';
	}

	function ratioText(value: number | null | undefined): string {
		return value === null || value === undefined
			? 'not enough returns'
			: `${value.toFixed(3)} · 1 is closer`;
	}

	function distanceText(value: number | null | undefined): string {
		return value === null || value === undefined
			? 'not enough crossings'
			: `${value.toFixed(3)} · lower is closer`;
	}

	function scalarComparisonText(
		comparison: ScalarComparison | null | undefined,
		unit: string,
		convergenceSensitive = false
	): string {
		if (!comparison) return 'not available';
		if (comparison.status === 'not-applicable') return 'not applicable';
		if (
			comparison.registeredValue === null ||
			comparison.halfStepValue === null ||
			comparison.absoluteDelta === null
		) {
			return comparison.status;
		}
		const interpretation = convergenceSensitive
			? comparison.status === 'warming-up'
				? 'warming estimates'
				: 'descriptive agreement'
			: 'lower is closer';
		return `h ${comparison.registeredValue.toFixed(4)} / h/2 ${comparison.halfStepValue.toFixed(4)} ${unit} · Δ ${comparison.absoluteDelta.toFixed(4)} · ${interpretation}`;
	}

	let lyapunovText = $derived.by(() => {
		const estimate = diagnostics?.finiteTimeLyapunov;
		if (!estimate) return 'calculating';
		if (estimate.status === 'not-applicable') return 'not applicable';
		if (estimate.value === null) return estimate.status;
		return `${estimate.value.toFixed(4)} ${lyapunovUnit} · ${estimate.status === 'available' ? 'converged' : 'warming'}`;
	});
	let stepText = $derived.by(() => {
		const comparison = diagnostics?.stepComparison;
		if (!comparison) return 'calculating';
		if (comparison.status === 'not-applicable') return 'not applicable';
		if (comparison.status === 'failed') return 'failed';
		return comparison.occupancyTotalVariation === null
			? 'computed'
			: `${comparison.occupancyTotalVariation.toFixed(3)} · lower is closer`;
	});
	let meanDeltaText = $derived(vectorText(diagnostics?.stepComparison.coordinateMeanDelta01));
	let spreadRatioText = $derived(vectorText(diagnostics?.stepComparison.coordinateDeviationRatio));
	let robustEndpointText = $derived(
		vectorText(diagnostics?.stepComparison.coordinateRobustRange?.endpointDelta01)
	);
	let robustSpanText = $derived(
		vectorText(diagnostics?.stepComparison.coordinateRobustRange?.spanRatio)
	);
	let sectionCountText = $derived.by(() => {
		const section = diagnostics?.stepComparison.poincareSection;
		return section
			? `${section.registeredEventCount.toLocaleString('en-GB')} at h / ${section.halfStepEventCount.toLocaleString('en-GB')} at h/2`
			: 'not available';
	});
	let sectionValueText = $derived(
		distanceText(diagnostics?.stepComparison.poincareSection?.valueTotalVariation)
	);
	let sectionIntervalText = $derived(
		distanceText(diagnostics?.stepComparison.poincareSection?.intervalTotalVariation)
	);
	let returnCountText = $derived.by(() => {
		const registered = diagnostics?.stepComparison.registeredReturnTimes;
		const halfStep = diagnostics?.stepComparison.halfStepReturnTimes;
		return registered && halfStep
			? `${registered.count.toLocaleString('en-GB')} at h / ${halfStep.count.toLocaleString('en-GB')} at h/2`
			: 'not enough returns';
	});
	let returnRatioText = $derived(ratioText(diagnostics?.stepComparison.returnIntervalMedianRatio));
	let returnSpreadRatioText = $derived(
		ratioText(diagnostics?.stepComparison.returnIntervalInterquantileRangeRatio)
	);
	let divergenceComparisonText = $derived(
		scalarComparisonText(
			diagnostics?.stepComparison.timeAveragedDivergenceComparison,
			'per simulated time unit'
		)
	);
	let lyapunovComparisonText = $derived(
		scalarComparisonText(
			diagnostics?.stepComparison.finiteTimeLyapunovComparison,
			lyapunovUnit,
			true
		)
	);
	let divergenceText = $derived(
		diagnostics?.timeAveragedDivergence === null ||
			diagnostics?.timeAveragedDivergence === undefined
			? 'not applicable'
			: diagnostics.timeAveragedDivergence.toFixed(4)
	);
</script>

<section class="diagnostics" aria-labelledby="sa-diagnostics-title">
	<h3 id="sa-diagnostics-title">Instrument diagnostics</h3>
	<dl>
		<div>
			<dt>Canonical points</dt>
			<dd>{pointCount.toLocaleString('en-GB')}</dd>
		</div>
		<div>
			<dt>Score events</dt>
			<dd>{eventCount.toLocaleString('en-GB')}</dd>
		</div>
		<div>
			<dt>Trajectory generation</dt>
			<dd>{generationMs.toFixed(1)} ms</dd>
		</div>
		<div>
			<dt>Observed frame rate</dt>
			<dd>{fps > 0 ? `${fps.toFixed(0)} fps` : 'warming'}</dd>
		</div>
		<div>
			<dt>Computation</dt>
			<dd>{workerMode}</dd>
		</div>
		<div>
			<dt>Renderer</dt>
			<dd>{renderer}</dd>
		</div>
		<div>
			<dt>Audio look-ahead</dt>
			<dd>{audioLookaheadMs} ms</dd>
		</div>
		<div>
			<dt>Finite-time largest Lyapunov estimate</dt>
			<dd>{lyapunovText}</dd>
		</div>
		<div>
			<dt>h versus h/2 occupancy distance</dt>
			<dd>{stepText}</dd>
		</div>
		{#if diagnostics?.stepComparison.status === 'available'}
			<div>
				<dt>Coordinate mean delta (x / y / z)</dt>
				<dd>{meanDeltaText} · lower is closer</dd>
			</div>
			<div>
				<dt>Coordinate deviation ratio (x / y / z)</dt>
				<dd>{spreadRatioText} · 1 is closer</dd>
			</div>
			<div>
				<dt>Robust-range endpoint delta (x / y / z)</dt>
				<dd>{robustEndpointText} · lower is closer</dd>
			</div>
			<div>
				<dt>Robust-range span ratio (x / y / z)</dt>
				<dd>{robustSpanText} · 1 is closer</dd>
			</div>
			<div>
				<dt>Poincaré observations</dt>
				<dd>{sectionCountText}</dd>
			</div>
			<div>
				<dt>Poincaré value-distribution distance</dt>
				<dd>{sectionValueText}</dd>
			</div>
			<div>
				<dt>Poincaré interval-distribution distance</dt>
				<dd>{sectionIntervalText}</dd>
			</div>
			<div>
				<dt>Return intervals observed</dt>
				<dd>{returnCountText}</dd>
			</div>
			<div>
				<dt>Return-time median ratio</dt>
				<dd>{returnRatioText}</dd>
			</div>
			<div>
				<dt>Return-time central-80% span ratio</dt>
				<dd>{returnSpreadRatioText}</dd>
			</div>
			<div>
				<dt>Time-averaged divergence h versus h/2</dt>
				<dd>{divergenceComparisonText}</dd>
			</div>
			<div>
				<dt>Finite-time Lyapunov h versus h/2</dt>
				<dd>{lyapunovComparisonText}</dd>
			</div>
		{/if}
		<div>
			<dt>Time-averaged divergence</dt>
			<dd>{divergenceText}</dd>
		</div>
	</dl>
	<p>
		A finite-time estimate is a numerical diagnostic, not proof. Renderer quality never changes the
		integration, feature stream or score.
	</p>
	{#if diagnostics}
		<p class="diagnostic-note">
			{diagnostics.finiteTimeLyapunov.note}
			{diagnostics.stepComparison.note}
		</p>
	{/if}
</section>

<style>
	.diagnostics h3 {
		margin: 0 0 0.7rem;
		color: #e5e0d3;
		font: 700 0.9rem/1.2 var(--font-sans, sans-serif);
	}

	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem 1rem;
		margin: 0;
	}

	dl div {
		display: grid;
		gap: 0.15rem;
		border-bottom: 1px solid rgb(225 220 201 / 10%);
		padding-bottom: 0.35rem;
	}

	dt,
	dd,
	p {
		font-family: var(--font-mono, monospace);
	}

	dt {
		color: #76817f;
		font-size: 0.58rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	dd {
		margin: 0;
		color: #c8c5b9;
		font-size: 0.68rem;
	}

	p {
		margin: 0.7rem 0 0;
		color: #777f7c;
		font-size: 0.61rem;
		line-height: 1.5;
	}

	@media (max-width: 540px) {
		dl {
			grid-template-columns: 1fr;
		}
	}
</style>
