import { describe, expect, it } from 'vitest';
import {
	DEFAULT_RANDOM_MATRIX_STATE,
	computeRandomMatrix
} from '$lib/visualizations/random-matrix';
import {
	fromEngineState,
	toEngineState
} from '$lib/components/visualizations/random-matrix/engine-adapter';
import {
	appendUniversalityAnalysis,
	emptyUniversalityComparison,
	universalityEntryVariance,
	universalitySharedRadius
} from '$lib/components/visualizations/random-matrix/universality';

describe('universality comparison view', () => {
	it('keeps all three matched-moment ensembles distinct and on one shared domain', () => {
		const state = fromEngineState({
			...DEFAULT_RANDOM_MATRIX_STATE,
			preset: 'universality-test',
			dimension: 8,
			distribution: 'rademacher'
		});
		let comparison = emptyUniversalityComparison(state);
		for (const distribution of ['gaussian', 'uniform', 'rademacher'] as const) {
			const analysis = computeRandomMatrix({
				state: toEngineState({ ...state, distribution }),
				sampleIndex: 0
			});
			comparison = appendUniversalityAnalysis(comparison, distribution, analysis);
		}

		expect(universalityEntryVariance(comparison)).toBeCloseTo(1 / 8, 15);
		for (const distribution of ['gaussian', 'uniform', 'rademacher'] as const) {
			expect(comparison.distributions[distribution].completed).toBe(1);
			expect(comparison.distributions[distribution].eigenvalues).toHaveLength(8);
		}
		expect(universalitySharedRadius(comparison)).toBeGreaterThan(1);
	});

	it('caps retained points independently without mixing distributions', () => {
		const state = fromEngineState({
			...DEFAULT_RANDOM_MATRIX_STATE,
			preset: 'universality-test',
			dimension: 8
		});
		let comparison = emptyUniversalityComparison(state);
		const analysis = computeRandomMatrix({ state: DEFAULT_RANDOM_MATRIX_STATE, sampleIndex: 3 });
		comparison = appendUniversalityAnalysis(comparison, 'gaussian', analysis, 3);
		expect(comparison.distributions.gaussian.eigenvalues).toHaveLength(3);
		expect(comparison.distributions.uniform.eigenvalues).toHaveLength(0);
		expect(comparison.distributions.rademacher.eigenvalues).toHaveLength(0);
	});
});
