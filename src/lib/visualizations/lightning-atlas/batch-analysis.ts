import { generateLightningFlash } from './leader-generator';
import { generateTerrain, worldToNormalized } from './terrain';
import type { BatchAnalysisInput, BatchAnalysisResult, FeatureFrequency } from './types';

export class AnalysisCancelledError extends Error {
	constructor() {
		super('Batch analysis cancelled.');
		this.name = 'AnalysisCancelledError';
	}
}

type AnalysisAccumulator = {
	counts: Map<string, FeatureFrequency>;
	heatmap: Map<string, { x: number; z: number; count: number }>;
	groundFlashCount: number;
};

function createAccumulator(): AnalysisAccumulator {
	return { counts: new Map(), heatmap: new Map(), groundFlashCount: 0 };
}

function recordRun(
	accumulator: AnalysisAccumulator,
	input: BatchAnalysisInput,
	terrain: ReturnType<typeof generateTerrain>,
	run: number
) {
	const { flash } = generateLightningFlash({ state: input.state, strikeIndex: run, terrain });
	if (!flash.attachment) return;
	accumulator.groundFlashCount += 1;
	const existing = accumulator.counts.get(flash.attachment.candidateId) ?? {
		candidateId: flash.attachment.candidateId,
		label: flash.attachment.label,
		kind: flash.attachment.kind,
		count: 0,
		frequency: 0
	};
	existing.count += 1;
	accumulator.counts.set(existing.candidateId, existing);

	const normalized = worldToNormalized(
		flash.attachment.position,
		terrain.widthMetres,
		terrain.depthMetres
	);
	const x = Math.round(normalized.x * 11) / 11;
	const z = Math.round(normalized.z * 8) / 8;
	const key = `${x}:${z}`;
	const cell = accumulator.heatmap.get(key) ?? { x, z, count: 0 };
	cell.count += 1;
	accumulator.heatmap.set(key, cell);
}

function finishAnalysis(
	input: BatchAnalysisInput,
	runs: number,
	accumulator: AnalysisAccumulator,
	start: number
): BatchAnalysisResult {
	const frequencies = Array.from(accumulator.counts.values())
		.map((entry) => ({ ...entry, frequency: entry.count / runs }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
	const end = typeof performance === 'undefined' ? Date.now() : performance.now();
	return {
		seed: input.state.seed,
		terrain: input.state.terrain,
		runs,
		groundFlashCount: accumulator.groundFlashCount,
		frequencies,
		heatmap: Array.from(accumulator.heatmap.values()).sort(
			(a, b) => b.count - a.count || a.z - b.z || a.x - b.x
		),
		durationMs: Math.max(0, end - start)
	};
}

export function analyseAttachmentBatch(
	input: BatchAnalysisInput,
	isCancelled: () => boolean = () => false
): BatchAnalysisResult {
	const start = typeof performance === 'undefined' ? Date.now() : performance.now();
	const runs = Math.max(1, Math.min(500, Math.round(input.runs)));
	const terrain = generateTerrain(
		input.state.terrain,
		input.state.seed,
		input.state.placedFeatures,
		65,
		input.state.environment.surfaceWetness
	);
	const accumulator = createAccumulator();

	for (let run = 0; run < runs; run += 1) {
		if (isCancelled()) throw new AnalysisCancelledError();
		recordRun(accumulator, input, terrain, run);
	}
	return finishAnalysis(input, runs, accumulator, start);
}

export async function analyseAttachmentBatchAsync(
	input: BatchAnalysisInput,
	isCancelled: () => boolean = () => false,
	options: { yieldEvery?: number; maximumRuns?: number } = {}
): Promise<BatchAnalysisResult> {
	const start = typeof performance === 'undefined' ? Date.now() : performance.now();
	const runs = Math.max(1, Math.min(options.maximumRuns ?? 500, Math.round(input.runs)));
	const yieldEvery = Math.max(1, Math.min(20, Math.round(options.yieldEvery ?? 4)));
	const terrain = generateTerrain(
		input.state.terrain,
		input.state.seed,
		input.state.placedFeatures,
		65,
		input.state.environment.surfaceWetness
	);
	const accumulator = createAccumulator();
	for (let run = 0; run < runs; run += 1) {
		if (isCancelled()) throw new AnalysisCancelledError();
		recordRun(accumulator, input, terrain, run);
		if ((run + 1) % yieldEvery === 0 && run + 1 < runs) {
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
	}
	if (isCancelled()) throw new AnalysisCancelledError();
	return finishAnalysis(input, runs, accumulator, start);
}
