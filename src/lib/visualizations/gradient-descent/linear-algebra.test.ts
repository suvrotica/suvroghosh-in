import { describe, expect, it } from 'vitest';
import {
	angleBetween,
	finiteDifferenceHessian,
	reconstructSymmetricMatrix,
	symmetricEigenDecomposition
} from './linear-algebra';
import { CONTAINED_SADDLE_LANDSCAPE } from './landscapes';
import type { Matrix2 } from './types';

describe('mathematical acceptance: curvature utilities', () => {
	it('13. reconstructs symmetric 2 × 2 matrices from a stable eigendecomposition', () => {
		const matrices: readonly Matrix2[] = [
			[
				[4, 1.5],
				[1.5, -2]
			],
			[
				[1e12, -3e5],
				[-3e5, 1e-7]
			],
			[
				[3, 0],
				[0, 3]
			],
			[
				[-7, 0],
				[0, 2]
			]
		];
		for (const matrix of matrices) {
			const decomposition = symmetricEigenDecomposition(matrix);
			const reconstructed = reconstructSymmetricMatrix(decomposition);
			for (const row of [0, 1] as const) {
				for (const column of [0, 1] as const) {
					const tolerance = 1e-12 * Math.max(1, Math.abs(matrix[row][column]));
					expect(Math.abs(reconstructed[row][column] - matrix[row][column])).toBeLessThanOrEqual(
						tolerance
					);
				}
			}
			const [first, second] = decomposition.vectors;
			expect(Math.hypot(...first)).toBeCloseTo(1, 14);
			expect(Math.hypot(...second)).toBeCloseTo(1, 14);
			expect(first[0] * second[0] + first[1] * second[1]).toBeCloseTo(0, 14);
		}
	});

	it('symmetrizes independently estimated mixed partials', () => {
		const hessian = finiteDifferenceHessian(CONTAINED_SADDLE_LANDSCAPE.gradient, [0.3, -0.8]);
		expect(hessian[0][1]).toBe(hessian[1][0]);
	});

	it('does not invent a direction angle for a zero vector', () => {
		expect(angleBetween([0, 0], [1, 0])).toBeNull();
		expect(angleBetween([1, 0], [0, 0])).toBeNull();
		expect(angleBetween([0, 0], [0, 0])).toBeNull();
		expect(angleBetween([1, 0], [0, 1])).toBeCloseTo(Math.PI / 2, 14);
		expect(angleBetween([1, 0], [-1, 0])).toBeCloseTo(Math.PI, 14);
	});
});
