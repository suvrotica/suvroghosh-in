import { describe, expect, it } from 'vitest';
import { initializeOptimizer, stepOptimizer } from './optimizers';
import type { AdamState, OptimizerConfig, OptimizerState, Vector2 } from './types';

function expectVectorClose(actual: Vector2 | undefined, expected: Vector2, digits = 11): void {
	expect(actual).toBeDefined();
	expect(actual![0]).toBeCloseTo(expected[0], digits);
	expect(actual![1]).toBeCloseTo(expected[1], digits);
}

describe('mathematical acceptance: optimizer recurrences', () => {
	it('4. performs one vanilla gradient-descent step with the exact expected displacement', () => {
		const config: OptimizerConfig = { id: 'gd', learningRate: 0.1 };
		const result = stepOptimizer([2, -3], [4, -6], initializeOptimizer(config), config);
		expect(result.theta).toEqual([1.6, -2.4]);
		expect(result.diagnostics.update).toEqual([-0.4, 0.6000000000000001]);
		expect(result.diagnostics.effectiveDirection).toEqual([4, -6]);
	});

	it('5. updates momentum state over multiple steps using v(t+1) = beta v(t) + g(t)', () => {
		const config: OptimizerConfig = { id: 'momentum', learningRate: 0.2, beta: 0.5 };
		const first = stepOptimizer([0, 0], [1, 2], initializeOptimizer(config), config);
		expect(first.state).toEqual({ id: 'momentum', iteration: 1, velocity: [1, 2] });
		expect(first.theta).toEqual([-0.2, -0.4]);
		const second = stepOptimizer(first.theta, [-1, 4], first.state, config);
		expect(second.state).toEqual({ id: 'momentum', iteration: 2, velocity: [-0.5, 5] });
		expect(second.diagnostics.update).toEqual([0.1, -1]);
		expect(second.theta).toEqual([-0.1, -1.4]);
	});

	it('6. accumulates and divides RMSProp squares element by element', () => {
		const config: OptimizerConfig = {
			id: 'rmsprop',
			learningRate: 0.1,
			rho: 0.5,
			epsilon: 1e-12
		};
		const first = stepOptimizer([0, 0], [2, 4], initializeOptimizer(config), config);
		expectVectorClose(first.diagnostics.accumulatedSquares, [2, 8]);
		expectVectorClose(first.diagnostics.effectiveDirection, [Math.SQRT2, Math.SQRT2]);
		const second = stepOptimizer(first.theta, [6, 2], first.state, config);
		expectVectorClose(second.diagnostics.accumulatedSquares, [19, 6]);
		expectVectorClose(second.diagnostics.effectiveDirection, [6 / Math.sqrt(19), 2 / Math.sqrt(6)]);
	});

	it('7. applies Adam bias correction on iteration 1', () => {
		const config: OptimizerConfig = {
			id: 'adam',
			learningRate: 0.05,
			beta1: 0.9,
			beta2: 0.99,
			epsilon: 1e-12
		};
		const result = stepOptimizer([0, 0], [2, -4], initializeOptimizer(config), config);
		expect(result.state.iteration).toBe(1);
		expectVectorClose(result.diagnostics.firstMoment, [0.2, -0.4]);
		expectVectorClose(result.diagnostics.secondMoment, [0.04, 0.16]);
		expectVectorClose(result.diagnostics.biasCorrectedFirstMoment, [2, -4]);
		expectVectorClose(result.diagnostics.biasCorrectedSecondMoment, [4, 16]);
		expectVectorClose(result.diagnostics.effectiveDirection, [1, -1]);
	});

	it('7. applies Adam bias correction on iteration 2 rather than reusing t = 1', () => {
		const config: OptimizerConfig = {
			id: 'adam',
			learningRate: 0.05,
			beta1: 0.9,
			beta2: 0.99,
			epsilon: 1e-12
		};
		const first = stepOptimizer([0, 0], [2, -4], initializeOptimizer(config), config);
		const second = stepOptimizer(first.theta, [1, -2], first.state, config);
		expect(second.state.iteration).toBe(2);
		expectVectorClose(second.diagnostics.firstMoment, [0.28, -0.56]);
		expectVectorClose(second.diagnostics.secondMoment, [0.0496, 0.1984]);
		expectVectorClose(second.diagnostics.biasCorrectedFirstMoment, [0.28 / 0.19, -0.56 / 0.19]);
		expectVectorClose(second.diagnostics.biasCorrectedSecondMoment, [
			0.0496 / 0.0199,
			0.1984 / 0.0199
		]);
		expect(second.diagnostics.biasCorrectedFirstMoment![0]).not.toBeCloseTo(2.8, 6);
	});

	it('7. keeps Adam t and weighted moments correct at later iterations', () => {
		const config: OptimizerConfig = {
			id: 'adam',
			learningRate: 0.02,
			beta1: 0.8,
			beta2: 0.95,
			epsilon: 1e-10
		};
		const gradients: readonly Vector2[] = [
			[2, -1],
			[-3, 4],
			[0.5, 2],
			[7, -2],
			[-1.5, 0.25]
		];
		let theta: Vector2 = [0, 0];
		let state: OptimizerState = initializeOptimizer(config);
		let final;
		for (const gradient of gradients) {
			final = stepOptimizer(theta, gradient, state, config);
			theta = final.theta;
			state = final.state;
		}
		expect((state as AdamState).iteration).toBe(5);

		const weighted = (axis: 0 | 1, beta: number, square: boolean) =>
			(1 - beta) *
			gradients.reduce(
				(sum, gradient, index) =>
					sum +
					beta ** (gradients.length - index - 1) * (square ? gradient[axis] ** 2 : gradient[axis]),
				0
			);
		const expectedFirst: Vector2 = [weighted(0, 0.8, false), weighted(1, 0.8, false)];
		const expectedSecond: Vector2 = [weighted(0, 0.95, true), weighted(1, 0.95, true)];
		expectVectorClose(final!.diagnostics.firstMoment, expectedFirst);
		expectVectorClose(final!.diagnostics.secondMoment, expectedSecond);
		expectVectorClose(final!.diagnostics.biasCorrectedFirstMoment, [
			expectedFirst[0] / (1 - 0.8 ** 5),
			expectedFirst[1] / (1 - 0.8 ** 5)
		]);
		expectVectorClose(final!.diagnostics.biasCorrectedSecondMoment, [
			expectedSecond[0] / (1 - 0.95 ** 5),
			expectedSecond[1] / (1 - 0.95 ** 5)
		]);
	});

	it('rejects invalid or mismatched state instead of silently coercing it', () => {
		expect(() => initializeOptimizer({ id: 'gd', learningRate: Number.NaN })).toThrow(RangeError);
		expect(() =>
			stepOptimizer(
				[0, 0],
				[1, 1],
				{ id: 'gd', iteration: 0 },
				{
					id: 'adam',
					learningRate: 0.1
				}
			)
		).toThrow(TypeError);
	});

	it('rejects every non-finite or unsafe numeric leaf in newly produced optimizer state', () => {
		expect(() =>
			stepOptimizer(
				[0, 0],
				[1, 1],
				{ id: 'gd', iteration: Number.MAX_SAFE_INTEGER },
				{ id: 'gd', learningRate: 0.1 }
			)
		).toThrow(/safe integer/);
		expect(() =>
			stepOptimizer(
				[0, 0],
				[Number.MAX_VALUE, 0],
				{ id: 'momentum', iteration: 1, velocity: [Number.MAX_VALUE, 0] },
				{ id: 'momentum', learningRate: 0.1, beta: 0.9 }
			)
		).toThrow(/optimizer state/);
		expect(() =>
			stepOptimizer(
				[0, 0],
				[Number.MAX_VALUE, 1],
				initializeOptimizer({ id: 'rmsprop', learningRate: 0.1 }),
				{ id: 'rmsprop', learningRate: 0.1 }
			)
		).toThrow(/optimizer state/);
		expect(() =>
			stepOptimizer(
				[0, 0],
				[Number.MAX_VALUE, 1],
				initializeOptimizer({ id: 'adam', learningRate: 0.1 }),
				{ id: 'adam', learningRate: 0.1 }
			)
		).toThrow(/optimizer state/);
	});
});
