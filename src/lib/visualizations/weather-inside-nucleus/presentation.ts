import type {
	EnsembleComparisonView,
	EnsembleSummaryView,
	RunSummaryView,
	TraceView
} from '$lib/components/visualizations/weather-inside-nucleus/ui-types';
import type { SimulationResult } from './model';
import type { NucleusTraceBuffers } from './render/types';
import type { CompactEnsembleArm, CompactMatchedEnsembleResult } from './worker/protocol';

/** A zero-copy view of one scientific result for the semantic SVG presentation. */
export function simulationToTraceView(result: SimulationResult): TraceView {
	return {
		duration: result.parameters.duration,
		times: result.timeline.time,
		downstreamActivity: result.timeline.downstreamActivity,
		nuclearActivity: result.timeline.nuclearActivity,
		occupancy: result.timeline.occupancy,
		contactState: result.timeline.contactState,
		contactPropensity: result.timeline.contactPropensity,
		promoterState: result.timeline.promoterState,
		rnaCount: result.timeline.rnaCount,
		initiationTimes: result.initiationTimes,
		burstStartTimes: result.burstStartTimes,
		burstCount: result.summary.burstCount,
		seed: result.seed
	};
}

/** A zero-copy, presentation-only boundary for Three.js. */
export function simulationToRendererTrace(result: SimulationResult): NucleusTraceBuffers {
	return {
		modelVersion: result.modelVersion,
		seed: result.seed,
		duration: result.parameters.duration,
		sampleTimes: result.timeline.time,
		signalInput: result.timeline.signalInput,
		receptorActivity: result.timeline.receptorActivity,
		downstreamActivity: result.timeline.downstreamActivity,
		nuclearActivity: result.timeline.nuclearActivity,
		occupancy: result.timeline.occupancy,
		licensing: result.timeline.licensing,
		contactPropensity: result.timeline.contactPropensity,
		contactState: result.timeline.contactState,
		promoterState: result.timeline.promoterState,
		rnaCount: result.timeline.rnaCount,
		initiationTimes: result.initiationTimes
	};
}

function armSummary(arm: CompactEnsembleArm): EnsembleSummaryView {
	return {
		runCount: arm.summary.runCount,
		burstingRuns: arm.summary.burstingRunCount,
		burstFraction: arm.summary.burstFraction,
		meanBurstCount: arm.summary.meanBurstCount,
		meanInitiationCount: arm.summary.meanInitiationCount,
		medianFirstBurstTime: arm.summary.medianFirstBurstTimeAmongBursting,
		censoredRuns: arm.summary.silentRunCount,
		observationHorizon: arm.parameters.duration
	};
}

function armRuns(arm: CompactEnsembleArm, seeds: Uint32Array): RunSummaryView[] {
	return Array.from(seeds, (seed, index) => ({
		seed,
		burstCount: arm.burstCounts[index],
		initiationCount: arm.initiationCounts[index],
		firstBurstTime: arm.firstBurstCensored[index] ? null : arm.firstBurstTimes[index],
		activeFraction: Math.min(1, arm.burstCounts[index] / 4),
		nearFraction: arm.nearFractions[index]
	}));
}

export function compactEnsembleToComparison(
	result: CompactMatchedEnsembleResult
): EnsembleComparisonView {
	return {
		baseline: armSummary(result.baseline),
		intervention: armSummary(result.intervention),
		baselineRuns: armRuns(result.baseline, result.seeds),
		interventionRuns: armRuns(result.intervention, result.seeds)
	};
}
