import { describe, expect, it } from 'vitest';
import { DEFAULT_RANDOM_MATRIX_STATE } from './constants';
import { computeEigenAnalysis, eigenvalueMatchDistance } from './decompositions';
import { applyRearrangement, generateMatrix, isExactlySymmetric } from './matrix';
import { MatrixRandom, createMatrixRandom } from './prng';
import { stateForPreset } from './presets';

describe('deterministic matrix generation', () => {
	it('has stable uniform and Gaussian fixtures', () => {
		const random = new MatrixRandom('fixture');
		expect(Array.from({ length: 5 }, () => random.next())).toEqual([
			0.203955196775496, 0.3368161527905613, 0.7545788302086294, 0.6134882539045066,
			0.19780318113043904
		]);
		const gaussian = new MatrixRandom('gaussian-fixture');
		expect(Array.from({ length: 5 }, () => gaussian.gaussian())).toEqual([
			0.25196920175800297, -0.3184775344677782, 0.19802598576724117, -0.7688312302479589,
			1.1775657499848973
		]);
	});

	it('makes seed, parameters and sample index completely determine entries', () => {
		const state = { ...DEFAULT_RANDOM_MATRIX_STATE, dimension: 12 };
		const first = generateMatrix(state, 7).values;
		const replay = generateMatrix(state, 7).values;
		const other = generateMatrix(state, 8).values;
		expect(replay).toEqual(first);
		expect(other).not.toEqual(first);
		expect(generateMatrix({ ...state, lens: 'direction-machine' }, 7).values).toEqual(first);
	});

	it('keeps the noise and planted direction fixed while continuous controls move', () => {
		const base = {
			...stateForPreset('hidden-rank-one-signal'),
			dimension: 10,
			signalStrength: 0
		};
		const noise = generateMatrix(base, 3).values;
		const weak = generateMatrix({ ...base, signalStrength: 0.5 }, 3).values;
		const strong = generateMatrix({ ...base, signalStrength: 1 }, 3).values;
		for (let index = 0; index < noise.length; index += 1) {
			expect(strong[index] - noise[index]).toBeCloseTo(2 * (weak[index] - noise[index]), 13);
		}
	});

	it('matches basic distribution moments over a deterministic sample', () => {
		for (const distribution of ['gaussian', 'uniform', 'rademacher'] as const) {
			const random = new MatrixRandom(`moments:${distribution}`);
			const count = 100_000;
			let sum = 0;
			let sumSquares = 0;
			for (let index = 0; index < count; index += 1) {
				const value = random.standardized(distribution);
				sum += value;
				sumSquares += value * value;
			}
			const mean = sum / count;
			const variance = sumSquares / count - mean * mean;
			expect(Math.abs(mean)).toBeLessThan(0.015);
			expect(Math.abs(variance - 1)).toBeLessThan(0.025);
		}
	});

	it('uses one latent noise realization as sparsity changes', () => {
		const base = {
			...DEFAULT_RANDOM_MATRIX_STATE,
			dimension: 24,
			distribution: 'rademacher' as const
		};
		const medium = generateMatrix({ ...base, sparsity: 0.5 }, 9).values;
		const sparse = generateMatrix({ ...base, sparsity: 0.75 }, 9).values;
		for (let index = 0; index < sparse.length; index += 1) {
			if (sparse[index] !== 0) {
				expect(medium[index]).not.toBe(0);
				expect(Math.sign(sparse[index])).toBe(Math.sign(medium[index]));
			}
		}
	});

	it('does not reroll when a generator-irrelevant control changes', () => {
		const circular = { ...stateForPreset('circular-cloud'), dimension: 12 };
		expect(generateMatrix({ ...circular, aspectRatio: 0.4 }, 2).values).toEqual(
			generateMatrix({ ...circular, aspectRatio: 1.8 }, 2).values
		);
		const sparse = { ...stateForPreset('sparse-galaxy'), dimension: 12 };
		expect(generateMatrix({ ...sparse, distribution: 'gaussian' }, 2).values).toEqual(
			generateMatrix({ ...sparse, distribution: 'rademacher' }, 2).values
		);
		const nonNormal = { ...stateForPreset('non-normal-trap'), dimension: 12 };
		expect(generateMatrix({ ...nonNormal, signalStrength: 0 }, 2).values).toEqual(
			generateMatrix({ ...nonNormal, signalStrength: 6 }, 2).values
		);
	});
});

describe('ensemble scaling and transformations', () => {
	it('generates exactly symmetric Wigner matrices with off-diagonal variance near 1/n', () => {
		const state = { ...stateForPreset('wigner-moonrise'), dimension: 64 };
		let sumSquares = 0;
		let count = 0;
		for (let sample = 0; sample < 80; sample += 1) {
			const generated = generateMatrix(state, sample);
			expect(isExactlySymmetric(generated.values, 64)).toBe(true);
			for (let row = 0; row < 64; row += 1) {
				for (let column = row + 1; column < 64; column += 1) {
					sumSquares += generated.values[row * 64 + column] ** 2;
					count += 1;
				}
			}
		}
		expect(sumSquares / count).toBeCloseTo(1 / 64, 3);
	});

	it('constructs Wishart matrices as symmetric positive semidefinite', () => {
		const state = { ...stateForPreset('wishart-ridge'), dimension: 16, aspectRatio: 0.8 };
		const generated = generateMatrix(state, 2);
		const eigen = computeEigenAnalysis(generated.values, 16, 16, { symmetric: true });
		expect(isExactlySymmetric(generated.values, 16)).toBe(true);
		expect(Math.min(...eigen.real)).toBeGreaterThanOrEqual(-1e-12);
	});

	it('exposes the rank deficit predicted when Wishart gamma exceeds one', () => {
		const state = { ...stateForPreset('wishart-ridge'), dimension: 12, aspectRatio: 2 };
		const generated = generateMatrix(state, 2);
		const eigen = computeEigenAnalysis(generated.values, 12, 12, { symmetric: true });
		expect(eigen.real.filter((value) => Math.abs(value) < 1e-11).length).toBeGreaterThanOrEqual(6);
	});

	it('generates every preset with finite, correctly shaped storage', () => {
		for (const preset of [
			'circular-cloud',
			'wigner-moonrise',
			'wishart-ridge',
			'universality-test',
			'hidden-rank-one-signal',
			'sparse-galaxy',
			'same-spectrum-different-face',
			'non-normal-trap'
		] as const) {
			const generated = generateMatrix({ ...stateForPreset(preset), dimension: 10 }, 5);
			expect(generated.values, preset).toHaveLength(100);
			expect([...generated.values].every(Number.isFinite), preset).toBe(true);
		}
	});

	it('preserves declared symmetry for every planted structure', () => {
		for (const signalType of [
			'rank-one',
			'two-block',
			'diagonal-band',
			'toeplitz',
			'sparse-hubs',
			'repeated-motif',
			'nonzero-mean',
			'unequal-row-variance'
		] as const) {
			const generated = generateMatrix(
				{
					...stateForPreset('wigner-moonrise'),
					dimension: 12,
					signalType,
					signalStrength: 0.8
				},
				2
			);
			expect(isExactlySymmetric(generated.values, 12), signalType).toBe(true);
		}
	});

	it('joint permutations and orthogonal similarities preserve eigenvalues', () => {
		const state = { ...stateForPreset('wigner-moonrise'), dimension: 16 };
		const matrix = generateMatrix(state, 4).values;
		const baseline = computeEigenAnalysis(matrix, 16, 16, { symmetric: true });
		for (const rearrangement of [
			'joint-permutation',
			'orthogonal-similarity',
			'spectral-order'
		] as const) {
			const changed = applyRearrangement(
				matrix,
				16,
				16,
				rearrangement,
				createMatrixRandom(state, 4, rearrangement)
			);
			const eigen = computeEigenAnalysis(changed.values, 16, 16, { symmetric: true });
			expect(changed.spectrumPreserving).toBe(true);
			expect(eigenvalueMatchDistance(baseline, eigen)).toBeLessThan(1e-12);
		}
	});

	it('keeps a symmetric orthogonal basis change exactly symmetric', () => {
		const state = { ...stateForPreset('wigner-moonrise'), dimension: 16 };
		const matrix = generateMatrix(state, 4).values;
		const changed = applyRearrangement(
			matrix,
			16,
			16,
			'orthogonal-similarity',
			createMatrixRandom(state, 4, 'basis-symmetry')
		);
		expect(isExactlySymmetric(changed.values, 16)).toBe(true);

		const aboveNonsymmetricCap = generateMatrix(
			{ ...stateForPreset('same-spectrum-different-face'), dimension: 129 },
			1
		);
		expect(isExactlySymmetric(aboveNonsymmetricCap.comparison!, 129)).toBe(true);
	});

	it('does not claim entry or row sorting preserves the spectrum', () => {
		const state = { ...DEFAULT_RANDOM_MATRIX_STATE, dimension: 8 };
		const matrix = generateMatrix(state, 1).values;
		for (const rearrangement of ['entry-shuffle', 'row-norm'] as const) {
			const changed = applyRearrangement(
				matrix,
				8,
				8,
				rearrangement,
				createMatrixRandom(state, 1, rearrangement)
			);
			expect(changed.spectrumPreserving).toBe(false);
		}
	});

	it('uses a joint leading-left-singular-vector order for nonsymmetric matrices', () => {
		const state = { ...stateForPreset('circular-cloud'), dimension: 10 };
		const matrix = generateMatrix(state, 4).values;
		const baseline = computeEigenAnalysis(matrix, 10, 10, { symmetric: false });
		const ordered = applyRearrangement(
			matrix,
			10,
			10,
			'spectral-order',
			createMatrixRandom(state, 4, 'nonsymmetric-order')
		);
		const eigen = computeEigenAnalysis(ordered.values, 10, 10, { symmetric: false });
		expect(ordered.label).toContain('PAPᵀ');
		expect(ordered.spectrumPreserving).toBe(true);
		expect(eigenvalueMatchDistance(baseline, eigen)).toBeLessThan(1e-11);
	});
});
