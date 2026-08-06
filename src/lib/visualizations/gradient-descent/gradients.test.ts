import { describe, expect, it, vi } from 'vitest';
import { sampleGradient } from './gradients';
import { createRegressionLandscape } from './landscapes';
import { SeededRandom } from './prng';
import type { LandscapeDefinition } from './types';

const FLAT_LANDSCAPE: LandscapeDefinition = {
	id: 'plateau',
	name: 'Flat test landscape',
	shortDescription: 'A test surface with an exactly zero gradient.',
	parameterLabels: ['x', 'y'],
	domain: { min: [-1, -1], max: [1, 1] },
	defaultStart: [0, 0],
	defaultLearningRate: 0.1,
	knownMinima: [],
	recommendedCamera: 'perspective',
	recommendedHeightMapping: 'linear',
	citationsOrNotes: [],
	value: () => 0,
	gradient: () => [0, 0],
	hessian: () => [
		[0, 0],
		[0, 0]
	]
};

describe('gradient direction error', () => {
	it('is null when the full reference gradient has zero norm', () => {
		const sample = sampleGradient(
			FLAT_LANDSCAPE,
			[0, 0],
			{ kind: 'noisy', sigma: 1 },
			new SeededRandom('zero-reference-angle')
		);

		expect(Math.hypot(...sample.active)).toBeGreaterThan(0);
		expect(sample.full).toEqual([0, 0]);
		expect(sample.angularErrorRadians).toBeNull();
	});

	it('is null when both active and reference gradients have zero norm', () => {
		const sample = sampleGradient(
			FLAT_LANDSCAPE,
			[0, 0],
			{ kind: 'full' },
			new SeededRandom('two-zero-gradients')
		);

		expect(sample.angularErrorRadians).toBeNull();
	});
});

describe('gradient work accounting', () => {
	it('reuses the full regression gradient for a full-batch active gradient', () => {
		const landscape = createRegressionLandscape(false);
		const fullGradient = vi.spyOn(landscape, 'gradient');
		const indexedGradient = vi.spyOn(landscape, 'gradientForIndices');
		const sample = sampleGradient(
			landscape,
			landscape.defaultStart,
			{ kind: 'minibatch', batchSize: 'full' },
			new SeededRandom('full-batch-dedup')
		);

		expect(fullGradient).toHaveBeenCalledTimes(1);
		expect(indexedGradient).not.toHaveBeenCalled();
		expect(sample.work).toEqual({
			activeGradientComputations: 1,
			additionalFullGradientComputations: 0,
			activeGradientExamplesProcessed: landscape.points.length,
			diagnosticExamplesProcessed: 0
		});
	});
});
