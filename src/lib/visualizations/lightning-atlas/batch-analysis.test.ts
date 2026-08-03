import { describe, expect, it } from 'vitest';
import { analyseAttachmentBatch } from './batch-analysis';
import { DEFAULT_ATLAS_STATE } from './config';
import type { SerializableAtlasState } from './types';

function baseState(): SerializableAtlasState {
	return {
		...DEFAULT_ATLAS_STATE,
		seed: 'tower-odds',
		mode: 'study',
		flashType: 'negative-cg',
		stormPosition: { x: 0.51, z: 0.48 },
		storm: { ...DEFAULT_ATLAS_STATE.storm },
		environment: { ...DEFAULT_ATLAS_STATE.environment },
		observer: { ...DEFAULT_ATLAS_STATE.observer },
		visibleLayers: [...DEFAULT_ATLAS_STATE.visibleLayers],
		placedFeatures: []
	};
}

describe('Lightning Atlas model attachment frequency', () => {
	it('lets an isolated mast materially change the model odds without guaranteeing a strike', () => {
		const baselineState = baseState();
		const baseline = analyseAttachmentBatch({ state: baselineState, runs: 80 });
		const mastState = {
			...baselineState,
			placedFeatures: [
				{ id: 'study-mast', kind: 'radio-mast' as const, x: 0.51, z: 0.48, rotation: 0 }
			]
		};
		const withMast = analyseAttachmentBatch({ state: mastState, runs: 80 });
		const mast = withMast.frequencies.find((entry) => entry.candidateId === 'study-mast');
		expect(baseline.frequencies.some((entry) => entry.candidateId === 'study-mast')).toBe(false);
		expect(mast?.count ?? 0).toBeGreaterThan(4);
		expect(mast?.count ?? 80).toBeLessThan(80);
	});

	it('reduces the mast advantage when the active charge region moves away', () => {
		const nearState = baseState();
		nearState.placedFeatures = [
			{ id: 'distance-mast', kind: 'radio-mast', x: 0.5, z: 0.5, rotation: 0 }
		];
		const farState = { ...nearState, stormPosition: { x: 0.08, z: 0.12 } };
		const near = analyseAttachmentBatch({ state: nearState, runs: 80 });
		const far = analyseAttachmentBatch({ state: farState, runs: 80 });
		const count = (result: typeof near) =>
			result.frequencies.find((entry) => entry.candidateId === 'distance-mast')?.count ?? 0;
		expect(count(near)).toBeGreaterThan(count(far));
	});

	it('keeps an explicit intra-cloud study honest about having no ground attachments', () => {
		const state = baseState();
		state.flashType = 'intra-cloud';
		const result = analyseAttachmentBatch({ state, runs: 24 });
		expect(result.runs).toBe(24);
		expect(result.groundFlashCount).toBe(0);
		expect(result.frequencies).toEqual([]);
		expect(result.heatmap).toEqual([]);
	});

	it('keeps wetness and conductivity causal in deterministic attachment distributions', () => {
		const surfaceState = baseState();
		surfaceState.seed = 'surface-extremes';
		surfaceState.terrain = 'volcanic-island';
		surfaceState.storm.cloudBaseMetres = 1_850;
		const dry = analyseAttachmentBatch({
			state: {
				...surfaceState,
				environment: { ...surfaceState.environment, surfaceWetness: 0, conductivityProxy: 0.54 }
			},
			runs: 100
		});
		const wet = analyseAttachmentBatch({
			state: {
				...surfaceState,
				environment: { ...surfaceState.environment, surfaceWetness: 1, conductivityProxy: 0.54 }
			},
			runs: 100
		});
		expect(wet.frequencies).not.toEqual(dry.frequencies);

		const low = analyseAttachmentBatch({
			state: {
				...surfaceState,
				environment: { ...surfaceState.environment, surfaceWetness: 0.36, conductivityProxy: 0 }
			},
			runs: 100
		});
		const high = analyseAttachmentBatch({
			state: {
				...surfaceState,
				environment: { ...surfaceState.environment, surfaceWetness: 0.36, conductivityProxy: 1 }
			},
			runs: 100
		});
		expect(high.frequencies).not.toEqual(low.frequencies);
	});
});
