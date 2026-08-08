export type ScalarTrace = Float32Array | Float64Array;

export type TraceView = Readonly<{
	duration: number;
	times: ScalarTrace;
	downstreamActivity: ScalarTrace;
	nuclearActivity: ScalarTrace;
	occupancy: ScalarTrace;
	contactState: Uint8Array;
	contactPropensity: ScalarTrace;
	promoterState: Uint8Array;
	rnaCount: Uint32Array;
	initiationTimes: ScalarTrace;
	burstStartTimes: ScalarTrace;
	burstCount: number;
	seed: number;
}>;

export type RunSummaryView = Readonly<{
	seed: number;
	burstCount: number;
	initiationCount: number;
	firstBurstTime: number | null;
	activeFraction: number;
	nearFraction: number;
}>;

export type EnsembleSummaryView = Readonly<{
	runCount: number;
	burstingRuns: number;
	burstFraction: number;
	meanBurstCount: number;
	meanInitiationCount: number;
	medianFirstBurstTime: number | null;
	censoredRuns: number;
	observationHorizon: number;
}>;

export type EnsembleComparisonView = Readonly<{
	baseline: EnsembleSummaryView;
	intervention: EnsembleSummaryView;
	baselineRuns: readonly RunSummaryView[];
	interventionRuns: readonly RunSummaryView[];
}>;

export type RendererMode = '2d' | '3d';
export type RendererStatus = 'poster' | 'loading' | 'ready' | 'fallback' | 'context-lost';
