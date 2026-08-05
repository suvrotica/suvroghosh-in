import { describe, expect, it } from 'vitest';
import { sampleGradient } from './gradients';
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
