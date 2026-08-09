import type { CoreGenerationResult, GenerationProgress, OrchestraSnapshot } from './types';
import { ORCHESTRA_MODEL_VERSION } from './versions';
import { computeScientificDiagnostics } from './model/diagnostics';
import { extractFeatureStream } from './model/features';
import { getAttractorDefinition } from './model/registry';
import { generateTrajectory } from './model/trajectory';
import { applyNoiseLens } from './noise/noise-transform';
import { buildScore, stableScoreHash } from './score/score-builder';
import { parseOrchestraUrlState, serializeOrchestraUrlState } from './url-state';

export interface GenerateCoreOptions {
	readonly pointCount?: number;
	readonly mobile?: boolean;
	readonly durationSeconds?: number;
	/** Opt-in because the h/h² and shadow-trajectory diagnostics perform extra integrations. */
	readonly includeDiagnostics?: boolean;
	readonly diagnosticPointCount?: number;
	readonly lyapunovDuration?: number;
	readonly signal?: AbortSignal;
	readonly onProgress?: (progress: GenerationProgress) => void;
}

/** Validates an in-memory snapshot through the same strict reconstruction rules as a URL. */
export function validateOrchestraSnapshot(snapshot: OrchestraSnapshot): OrchestraSnapshot {
	const serialized = serializeOrchestraUrlState(snapshot);
	const parsed = parseOrchestraUrlState(serialized);
	const changed = (Object.keys(snapshot) as (keyof OrchestraSnapshot)[]).some(
		(key) => parsed.state[key] !== snapshot[key]
	);
	if (parsed.issues.length > 0 || changed) {
		throw new RangeError(
			parsed.issues.map((issue) => `${issue.key}: ${issue.message}`).join(' ') ||
				'The orchestra snapshot contains an unvalidated value.'
		);
	}
	return parsed.state;
}

export function generateCoreExperience(
	snapshotInput: OrchestraSnapshot,
	options: GenerateCoreOptions = {}
): CoreGenerationResult {
	const snapshot = validateOrchestraSnapshot(snapshotInput);
	const definition = getAttractorDefinition(snapshot.attractorId);
	const trajectory = generateTrajectory(definition, {
		pointCount: options.pointCount,
		signal: options.signal,
		onProgress: options.onProgress
	});
	const weather = applyNoiseLens(
		trajectory,
		{
			family: snapshot.noiseFamily,
			lens: snapshot.noiseLens,
			influence: snapshot.noiseInfluence,
			masterSeed: snapshot.masterSeed
		},
		{ onProgress: options.onProgress }
	);
	const features = extractFeatureStream(trajectory, weather, {
		onProgress: options.onProgress
	});
	const score = buildScore(snapshot, features, {
		mobile: options.mobile,
		durationSeconds: options.durationSeconds,
		onProgress: options.onProgress
	});
	const diagnostics = options.includeDiagnostics
		? (() => {
				options.onProgress?.({
					phase: 'diagnostics',
					completed: 0,
					total: 1,
					progress01: 0
				});
				const result = computeScientificDiagnostics(definition, trajectory, {
					stepComparisonPointCount: options.diagnosticPointCount,
					lyapunovDuration: options.lyapunovDuration,
					signal: options.signal
				});
				options.onProgress?.({
					phase: 'diagnostics',
					completed: 1,
					total: 1,
					progress01: 1
				});
				return result;
			})()
		: undefined;
	return {
		modelVersion: ORCHESTRA_MODEL_VERSION,
		snapshot,
		trajectory,
		weather,
		features,
		score,
		scoreHash: stableScoreHash(score),
		...(diagnostics ? { diagnostics } : {})
	};
}
