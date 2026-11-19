import { describe, expect, it } from 'vitest';
import {
	CANONICAL_PRESETS,
	analyzeMatrix,
	computeMorphMatrix3,
	computeSvd,
	dot,
	frobeniusNorm,
	generateSeededRankMatrix,
	matMul,
	matVec,
	norm,
	reconstructFromSvd,
	setSmallestSingularValue,
	smallestSingularValueUpperBound,
	subVec,
	transposeMatrix
} from './index';
import type { Dim, MatrixData } from './types';

describe('Four Fundamental Subspaces — SVD, RREF, Projections & Invariants', () => {
	it('verifies exact mathematical invariants across all 12 canonical presets', () => {
		expect(CANONICAL_PRESETS).toHaveLength(12);

		for (const preset of CANONICAL_PRESETS) {
			const analysis = analyzeMatrix(preset.matrix, preset.defaultX, preset.defaultB);

			// Expected rank and four fundamental dimension identities
			expect(analysis.rank, `rank of ${preset.id}`).toBe(preset.expectedRank);
			expect(analysis.subspaces.row.dimension).toBe(preset.expectedRank);
			expect(analysis.subspaces.col.dimension).toBe(preset.expectedRank);
			expect(analysis.subspaces.null.dimension).toBe(preset.n - preset.expectedRank);
			expect(analysis.subspaces.leftNull.dimension).toBe(preset.m - preset.expectedRank);
			expect(analysis.receipts.domainSumOk).toBe(true);
			expect(analysis.receipts.codomainSumOk).toBe(true);

			// Full SVD reconstruction and orthonormality to machine precision
			expect(analysis.receipts.svdReconstructionError, `SVD error for ${preset.id}`).toBeLessThan(
				1e-11
			);
			expect(analysis.receipts.uOrthonormalityError, `U ortho for ${preset.id}`).toBeLessThan(
				1e-11
			);
			expect(analysis.receipts.vOrthonormalityError, `V ortho for ${preset.id}`).toBeLessThan(
				1e-11
			);

			// Pairwise orthogonality of complements
			expect(analysis.receipts.rowNullMaxDot).toBeLessThan(1e-11);
			expect(analysis.receipts.colLeftNullMaxDot).toBeLessThan(1e-11);

			// Input orthogonal decomposition x = x_r + x_n
			const reconX = analysis.input.xRow.map((v, i) => v + analysis.input.xNull[i]);
			expect(norm(subVec(reconX, analysis.input.x))).toBeLessThan(1e-11);
			expect(analysis.input.orthogonalityDot).toBeLessThan(1e-11);
			expect(analysis.input.axNullResidualNorm).toBeLessThan(1e-11);

			// Target orthogonal decomposition b = p + e and normal equation A^T e = 0
			const reconB = analysis.target.projection.map((v, i) => v + analysis.target.residual[i]);
			expect(norm(subVec(reconB, analysis.target.b))).toBeLessThan(1e-11);
			expect(analysis.receipts.normalEquationResidual).toBeLessThan(1e-11);

			// Pseudoinverse A x^+ = p and x^+ orthogonal to N(A)
			expect(norm(subVec(analysis.target.axPlus, analysis.target.projection))).toBeLessThan(1e-10);
			for (const vNull of analysis.subspaces.null.svdBasis) {
				expect(Math.abs(dot(analysis.target.xPlus, vNull))).toBeLessThan(1e-11);
			}

			// RREF basis verification: every nullspace basis vector satisfies A v = 0,
			// every left-nullspace basis vector satisfies A^T y = 0,
			// and counts match rank / nullity
			expect(analysis.rref.rowSpaceBasis).toHaveLength(preset.expectedRank);
			expect(analysis.rref.columnSpaceBasis).toHaveLength(preset.expectedRank);
			expect(analysis.rref.nullspaceBasis).toHaveLength(preset.n - preset.expectedRank);
			expect(analysis.rref.leftNullspaceBasis).toHaveLength(preset.m - preset.expectedRank);

			for (const z of analysis.rref.nullspaceBasis) {
				expect(norm(matVec(preset.matrix, z))).toBeLessThan(1e-10);
			}
			const at = transposeMatrix(preset.matrix);
			for (const y of analysis.rref.leftNullspaceBasis) {
				expect(norm(matVec(at, y))).toBeLessThan(1e-10);
			}
		}
	});

	it('confirms specific algebraic properties of famous canonical presets', () => {
		// Tilted orthogonal projection: P^2 = P, symmetric, sigma = [1, 1, 0]
		const projPreset = CANONICAL_PRESETS.find((p) => p.id === 'tilted-projection')!;
		const pSq = matMul(projPreset.matrix, projPreset.matrix);
		const diffP = projPreset.matrix.map((row, i) => row.map((v, j) => v - pSq[i][j]));
		expect(frobeniusNorm(diffP)).toBeLessThan(1e-12);
		const projAnalysis = analyzeMatrix(projPreset.matrix, projPreset.defaultX, projPreset.defaultB);
		expect(projAnalysis.svd.singularValues[0]).toBeCloseTo(1, 10);
		expect(projAnalysis.svd.singularValues[1]).toBeCloseTo(1, 10);
		expect(projAnalysis.svd.singularValues[2]).toBeCloseTo(0, 10);

		// Strang graph incidence: N(A) = span{(1,1,1)}, N(A^T) = span{(1,1,-1)}
		const graphPreset = CANONICAL_PRESETS.find((p) => p.id === 'strang-graph-incidence')!;
		expect(norm(matVec(graphPreset.matrix, [1, 1, 1]))).toBeLessThan(1e-12);
		expect(norm(matVec(transposeMatrix(graphPreset.matrix), [1, 1, -1]))).toBeLessThan(1e-12);

		// Householder reflection: Q^T Q = I, det = -1, all sigma = 1
		const housePreset = CANONICAL_PRESETS.find((p) => p.id === 'householder-reflection')!;
		const houseAnalysis = analyzeMatrix(
			housePreset.matrix,
			housePreset.defaultX,
			housePreset.defaultB
		);
		expect(houseAnalysis.determinant).toBeCloseTo(-1, 10);
		for (const s of houseAnalysis.svd.singularValues) {
			expect(s).toBeCloseTo(1, 10);
		}

		// 3D shear: det = 1, non-normal so sigma_1 > 1 > sigma_3
		const shearPreset = CANONICAL_PRESETS.find((p) => p.id === 'shear-3d')!;
		const shearAnalysis = analyzeMatrix(
			shearPreset.matrix,
			shearPreset.defaultX,
			shearPreset.defaultB
		);
		expect(shearAnalysis.determinant).toBeCloseTo(1, 10);
		expect(shearAnalysis.svd.singularValues[0]).toBeGreaterThan(1.3);
		expect(shearAnalysis.svd.singularValues[2]).toBeLessThan(0.8);

		// Nearly singular: sigma = [2.0, 1.2, 0.04], condition number 50
		const nearPreset = CANONICAL_PRESETS.find((p) => p.id === 'nearly-singular')!;
		const nearAnalysis = analyzeMatrix(nearPreset.matrix, nearPreset.defaultX, nearPreset.defaultB);
		expect(nearAnalysis.svd.singularValues[0]).toBeCloseTo(2.0, 5);
		expect(nearAnalysis.svd.singularValues[1]).toBeCloseTo(1.2, 5);
		expect(nearAnalysis.svd.singularValues[2]).toBeCloseTo(0.04, 5);
		expect(nearAnalysis.svd.conditionNumber).toBeCloseTo(50, 3);
	});

	it('drops rank cleanly when dragging sigma_3 to 0 or increasing rank tolerance tau', () => {
		const nearPreset = CANONICAL_PRESETS.find((p) => p.id === 'nearly-singular')!;

		// Raising relative tolerance from 1e-6 to 0.02 makes tau = 3 * 2.0 * 0.02 = 0.12 > 0.04
		const truncated = analyzeMatrix(
			nearPreset.matrix,
			nearPreset.defaultX,
			nearPreset.defaultB,
			0.02
		);
		expect(truncated.rank).toBe(2);
		expect(truncated.svd.rankTruncated).toBe(true);
		expect(truncated.subspaces.null.dimension).toBe(1);
		expect(truncated.subspaces.leftNull.dimension).toBe(1);
		expect(truncated.rref.nullspaceBasis).toHaveLength(1);
		expect(truncated.rref.leftNullspaceBasis).toHaveLength(1);

		// Dragging sigma_3 explicitly down to 0
		const flattened = setSmallestSingularValue(nearPreset.matrix, 0);
		const flatAnalysis = analyzeMatrix(flattened, nearPreset.defaultX, nearPreset.defaultB);
		expect(flatAnalysis.rank).toBe(2);
		expect(flatAnalysis.svd.singularValues[2]).toBeLessThan(1e-10);
	});

	it('classifies all four linear-system regimes accurately', () => {
		// 1. Unique exact: full-rank 3x3
		const full = CANONICAL_PRESETS.find((p) => p.id === 'anisotropic-stretch-rotation')!;
		expect(analyzeMatrix(full.matrix, full.defaultX, full.defaultB).target.regimeId).toBe(
			'unique-exact'
		);

		// 2. Infinitely many exact: 2x3 full row rank
		const under = CANONICAL_PRESETS.find((p) => p.id === 'underdetermined-system')!;
		expect(analyzeMatrix(under.matrix, under.defaultX, under.defaultB).target.regimeId).toBe(
			'infinite-exact'
		);

		// 3. Unique least squares: 3x2 line fit with b not in C(A)
		const over = CANONICAL_PRESETS.find((p) => p.id === 'overdetermined-line-fit')!;
		const overRes = analyzeMatrix(over.matrix, over.defaultX, over.defaultB);
		expect(overRes.target.regimeId).toBe('unique-least-squares');
		// Snap b into C(A) -> becomes unique-exact
		const overExact = analyzeMatrix(over.matrix, over.defaultX, overRes.target.projection);
		expect(overExact.target.regimeId).toBe('unique-exact');

		// 4. Infinitely many least squares: rank-deficient 3x2 with b outside C(A)
		const defRect = CANONICAL_PRESETS.find((p) => p.id === 'rank-deficient-rectangular')!;
		const defRes = analyzeMatrix(defRect.matrix, defRect.defaultX, defRect.defaultB);
		expect(defRes.target.regimeId).toBe('infinite-least-squares');
		// Snap b into C(A) -> becomes infinite-exact
		const defExact = analyzeMatrix(defRect.matrix, defRect.defaultX, defRes.target.projection);
		expect(defExact.target.regimeId).toBe('infinite-exact');
	});

	it('handles all 9 rectangular matrix shapes (m, n in {1,2,3}) and every valid rank 0..min(m,n)', () => {
		const dims: Dim[] = [1, 2, 3];
		for (const m of dims) {
			for (const n of dims) {
				const maxRank = Math.min(m, n);
				for (let r = 0; r <= maxRank; r += 1) {
					const mat = generateSeededRankMatrix(m, n, r, 100 + m * 17 + n * 7 + r);
					const x = Array.from({ length: n }, (_, i) => i + 0.5);
					const b = Array.from({ length: m }, (_, i) => 1.2 - i * 0.4);
					const res = analyzeMatrix(mat, x, b);

					expect(res.rank, `shape ${m}x${n} target rank ${r}`).toBe(r);
					expect(res.receipts.domainSumOk).toBe(true);
					expect(res.receipts.codomainSumOk).toBe(true);
					expect(res.receipts.svdReconstructionError).toBeLessThan(1e-11);
					expect(res.receipts.uOrthonormalityError).toBeLessThan(1e-11);
					expect(res.receipts.vOrthonormalityError).toBeLessThan(1e-11);
					expect(res.rref.rowSpaceBasis).toHaveLength(r);
					expect(res.rref.nullspaceBasis).toHaveLength(n - r);
					expect(res.rref.columnSpaceBasis).toHaveLength(r);
					expect(res.rref.leftNullspaceBasis).toHaveLength(m - r);
				}
			}
		}
	});

	it('computes exact SVD reconstruction even for degenerate sparse single-entry matrices', () => {
		const sparse: MatrixData = [
			[0, 1, 0],
			[0, 0, 0],
			[0, 0, 0]
		];
		const svd = computeSvd(sparse);
		expect(svd.rank).toBe(1);
		expect(svd.singularValues[0]).toBeCloseTo(1, 12);
		const recon = reconstructFromSvd(svd);
		const diff = sparse.map((row, i) => row.map((v, j) => v - recon[i][j]));
		expect(frobeniusNorm(diff)).toBeLessThan(1e-12);
	});

	it('evaluates linear and 3-stage SVD morphs exactly at endpoints t = 0 and t = 1 (including reflections)', () => {
		const ids = ['asymmetric-rank2', 'householder-reflection', 'shear-3d', 'zero-matrix'];
		for (const id of ids) {
			const preset = CANONICAL_PRESETS.find((p) => p.id === id)!;
			const analysis = analyzeMatrix(preset.matrix, preset.defaultX, preset.defaultB);

			for (const mode of ['linear', 'svd-stages'] as const) {
				const at0 = computeMorphMatrix3(analysis, 0, mode).matrix3;
				const eyeDiff = at0.map((row, i) => row.map((v, j) => v - (i === j ? 1 : 0)));
				expect(frobeniusNorm(eyeDiff), `${id} ${mode} t=0`).toBeLessThan(1e-11);

				const at1 = computeMorphMatrix3(analysis, 1, mode).matrix3;
				const aDiff = at1.map((row, i) => row.map((v, j) => v - preset.matrix[i][j]));
				expect(frobeniusNorm(aDiff), `${id} ${mode} t=1`).toBeLessThan(1e-10);
			}
			expect(computeMorphMatrix3(analysis, 1 / 3, 'svd-stages').stageLabel).toContain('Stage 1/3');
			expect(computeMorphMatrix3(analysis, 2 / 3, 'svd-stages').stageLabel).toContain('Stage 2/3');
			expect(computeMorphMatrix3(analysis, 1, 'svd-stages').stageLabel).toContain('Stage 3/3');
		}
	});

	it('maintains exact RREF-to-SVD subspace alignment across all presets and rank tolerances', () => {
		for (const preset of CANONICAL_PRESETS) {
			for (const tol of [1e-6, 0.01, 0.02, 0.05, 0.1, 0.15, 0.25]) {
				const res = analyzeMatrix(preset.matrix, preset.defaultX, preset.defaultB, tol);

				expect(res.rref.pivotColumns).toHaveLength(res.rank);
				expect(res.rref.rowSpaceBasis).toHaveLength(res.rank);
				expect(res.rref.columnSpaceBasis).toHaveLength(res.rank);
				expect(res.rref.nullspaceBasis).toHaveLength(res.n - res.rank);
				expect(res.rref.leftNullspaceBasis).toHaveLength(res.m - res.rank);

				// Bottom rows below rank must be identically zero
				for (let i = res.rank; i < res.m; i += 1) {
					for (let j = 0; j < res.n; j += 1) {
						expect(
							Math.abs(res.rref.rref[i][j]),
							`${preset.id} tol=${tol} bottom row (${i},${j})`
						).toBeLessThan(1e-8);
					}
				}

				// RREF bases must span the exact same subspaces as the SVD bases
				for (const rVec of res.rref.rowSpaceBasis) {
					for (const nVec of res.subspaces.null.svdBasis) {
						expect(Math.abs(dot(rVec, nVec)) / (norm(rVec) || 1)).toBeLessThan(1e-8);
					}
				}
				for (const nVec of res.rref.nullspaceBasis) {
					for (const rVec of res.subspaces.row.svdBasis) {
						expect(Math.abs(dot(nVec, rVec)) / (norm(nVec) || 1)).toBeLessThan(1e-8);
					}
				}
				for (const yVec of res.rref.leftNullspaceBasis) {
					for (const uVec of res.subspaces.col.svdBasis) {
						expect(Math.abs(dot(yVec, uVec)) / (norm(yVec) || 1)).toBeLessThan(1e-8);
					}
				}
				for (const cVec of res.rref.columnSpaceBasis) {
					for (const yVec of res.subspaces.leftNull.svdBasis) {
						expect(Math.abs(dot(cVec, yVec)) / (norm(cVec) || 1)).toBeLessThan(1e-8);
					}
				}
			}
		}

		// Scale invariance: tiny 1e-12 identity matrix must keep matching rank and RREF pivots
		const tiny = analyzeMatrix(
			[
				[1e-12, 0],
				[0, 1e-12]
			],
			[1, 1],
			[1, 1]
		);
		expect(tiny.rank).toBe(2);
		expect(tiny.rref.pivotColumns).toEqual([0, 1]);
		expect(tiny.rref.rowSpaceBasis).toHaveLength(2);
		expect(tiny.rref.nullspaceBasis).toHaveLength(0);
	});

	it('preserves orientation and avoids axis swaps during smallest-singular-value homotopy', () => {
		const near = CANONICAL_PRESETS.find((p) => p.id === 'nearly-singular')!;
		const baseSvd = computeSvd(near.matrix);
		expect(smallestSingularValueUpperBound(baseSvd)).toBeCloseTo(1.2, 5);

		// Sweeping sigma_3 -> 0 -> sigma_3 with pinned SVD frame restores exact matrix & det sign (no flip)
		const dropped = setSmallestSingularValue(near.matrix, 0, baseSvd);
		expect(analyzeMatrix(dropped, near.defaultX, near.defaultB).rank).toBe(2);
		const restoredExact = setSmallestSingularValue(dropped, baseSvd.singularValues[2], baseSvd);
		const diffExact = near.matrix.map((row, i) => row.map((v, j) => v - restoredExact[i][j]));
		expect(frobeniusNorm(diffExact)).toBeLessThan(1e-12);
		const restoredNominal = setSmallestSingularValue(dropped, 0.04, baseSvd);
		const diffNominal = near.matrix.map((row, i) => row.map((v, j) => v - restoredNominal[i][j]));
		expect(frobeniusNorm(diffNominal)).toBeLessThan(1e-6);
		expect(analyzeMatrix(restoredNominal, near.defaultX, near.defaultB).determinant).toBeCloseTo(
			analyzeMatrix(near.matrix, near.defaultX, near.defaultB).determinant!,
			5
		);

		// Clamping above sigma_2 prevents discontinuous singular-axis swapping
		const clampedHigh = setSmallestSingularValue(near.matrix, 2.5, baseSvd);
		const highSigmas = analyzeMatrix(clampedHigh, near.defaultX, near.defaultB).svd.singularValues;
		expect(highSigmas[2]).toBeCloseTo(1.2, 4);

		// Zero matrix has upper bound 0 and stays zero instead of silently creating sigma_1
		const zero = CANONICAL_PRESETS.find((p) => p.id === 'zero-matrix')!;
		expect(smallestSingularValueUpperBound(computeSvd(zero.matrix))).toBe(0);
		const zeroAttempt = setSmallestSingularValue(zero.matrix, 0.8);
		expect(frobeniusNorm(zeroAttempt)).toBe(0);
	});
});
