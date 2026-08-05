import { describe, expect, it } from 'vitest';
import {
	CONTAINED_SADDLE_LANDSCAPE,
	createQuadraticLandscape,
	createRegressionLandscape,
	DEFAULT_LANDSCAPES,
	HIMMELBLAU_LANDSCAPE,
	PLATEAU_LANDSCAPE,
	RASTRIGIN_LANDSCAPE,
	ROSENBROCK_LANDSCAPE
} from './landscapes';
import { finiteDifferenceGradient, finiteDifferenceHessian } from './linear-algebra';
import type { LandscapeDefinition, Matrix2, Vector2 } from './types';

function expectNumberClose(actual: number, expected: number, tolerance: number): void {
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
		tolerance * Math.max(1, Math.abs(expected))
	);
}

function expectVectorClose(actual: Vector2, expected: Vector2, tolerance: number): void {
	expectNumberClose(actual[0], expected[0], tolerance);
	expectNumberClose(actual[1], expected[1], tolerance);
}

function expectMatrixClose(actual: Matrix2, expected: Matrix2, tolerance: number): void {
	for (const row of [0, 1] as const) {
		for (const column of [0, 1] as const) {
			expectNumberClose(actual[row][column], expected[row][column], tolerance);
		}
	}
}

const CASES: readonly [LandscapeDefinition, readonly Vector2[]][] = [
	[
		createQuadraticLandscape({ lambda1: 2.5, lambda2: 19, rotation: 0.41 }),
		[
			[0.7, -1.1],
			[-2.2, 1.4]
		]
	],
	[
		ROSENBROCK_LANDSCAPE,
		[
			[-1.1, 1.2],
			[0.3, 0.5]
		]
	],
	[
		HIMMELBLAU_LANDSCAPE,
		[
			[0.5, -0.75],
			[-2, 2]
		]
	],
	[
		RASTRIGIN_LANDSCAPE,
		[
			[0.3, -0.7],
			[1.2, 2.1]
		]
	],
	[
		CONTAINED_SADDLE_LANDSCAPE,
		[
			[0.4, -0.6],
			[1.2, 0.8]
		]
	],
	[
		PLATEAU_LANDSCAPE,
		[
			[0.8, -1.4],
			[3, -2]
		]
	],
	[
		createRegressionLandscape(false),
		[
			[-0.3, 1.2],
			[2, -1]
		]
	]
];

describe('mathematical acceptance: analytic landscapes', () => {
	it('1. matches every analytic gradient against central finite differences at interior points', () => {
		for (const [landscape, points] of CASES) {
			for (const point of points) {
				expectVectorClose(
					landscape.gradient(point),
					finiteDifferenceGradient(landscape.value, point),
					2e-7
				);
			}
		}
	});

	it('2. matches supplied Hessians against finite differences of gradients', () => {
		for (const [landscape, points] of CASES) {
			expect(landscape.hessian, `${landscape.id} should expose its analytic Hessian`).toBeTypeOf(
				'function'
			);
			for (const point of points) {
				expectMatrixClose(
					landscape.hessian!(point),
					finiteDifferenceHessian(landscape.gradient, point),
					3e-7
				);
			}
		}
	});

	it('3. gives every registered known minimum a near-zero gradient', () => {
		for (const landscape of Object.values(DEFAULT_LANDSCAPES)) {
			for (const minimum of landscape.knownMinima) {
				const gradient = landscape.gradient(minimum.theta);
				// Published Himmelblau coordinates are rounded to six decimal places.
				expect(
					Math.hypot(...gradient),
					`${landscape.id} at ${minimum.theta.join(',')}`
				).toBeLessThan(2e-4);
			}
		}
	});

	it('14. derives the quadratic stability annotation from the true lambda maximum', () => {
		const landscape = createQuadraticLandscape({ lambda1: 3, lambda2: 17, rotation: -0.72 });
		expect(landscape.lambdaMin).toBe(3);
		expect(landscape.lambdaMax).toBe(17);
		expect(landscape.conditionNumber).toBeCloseTo(17 / 3, 14);
		expect(landscape.stableLearningRateUpperBound).toBeCloseTo(2 / 17, 14);
		expect(landscape.optimalFixedLearningRate).toBeCloseTo(2 / 20, 14);
	});

	it('rejects non-finite quadratic eigenvalues and rotations before constructing the matrix', () => {
		for (const parameters of [
			{ lambda1: Number.POSITIVE_INFINITY },
			{ lambda2: Number.NEGATIVE_INFINITY },
			{ lambda1: Number.NaN },
			{ lambda2: Number.NaN },
			{ rotation: Number.POSITIVE_INFINITY },
			{ rotation: Number.NaN }
		]) {
			expect(() => createQuadraticLandscape(parameters)).toThrow(RangeError);
		}
	});

	it('15. keeps the regression gradient equal to finite differences with and without the outlier', () => {
		for (const includesOutlier of [false, true]) {
			const landscape = createRegressionLandscape(includesOutlier);
			for (const point of [
				[-0.4, 2.1],
				[2.7, -1.3]
			] as const) {
				expectVectorClose(
					landscape.gradient(point),
					finiteDifferenceGradient(landscape.value, point),
					2e-8
				);
			}
		}
	});

	it('16. changes the regression objective and optimum deterministically when the fixed outlier is toggled', () => {
		const plainA = createRegressionLandscape(false);
		const plainB = createRegressionLandscape(false);
		const outlierA = createRegressionLandscape(true);
		const outlierB = createRegressionLandscape(true);
		const probe: Vector2 = [1.4, -0.2];
		expect(plainA.value(probe)).toBe(plainB.value(probe));
		expect(outlierA.value(probe)).toBe(outlierB.value(probe));
		expect(outlierA.value(probe)).not.toBe(plainA.value(probe));
		expect(outlierA.knownMinima[0].theta).toEqual(outlierB.knownMinima[0].theta);
		expect(outlierA.knownMinima[0].theta).not.toEqual(plainA.knownMinima[0].theta);
		expect(Math.hypot(...plainA.gradient(plainA.knownMinima[0].theta))).toBeLessThan(1e-12);
		expect(Math.hypot(...outlierA.gradient(outlierA.knownMinima[0].theta))).toBeLessThan(1e-12);
	});
});
