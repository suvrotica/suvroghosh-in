import { describe, expect, it } from 'vitest';
import {
	CANONICAL_PRESETS,
	analyzeMatrix,
	applyPresetToState,
	applySeededRandomMatrix,
	applySmallestSingularValue,
	buildJsonSummary,
	buildPlainTextSummary,
	computeSmartCameraPose,
	createDefaultState,
	decodeStateFromSearch,
	dot,
	effectiveInputVector,
	encodeStateToQuery,
	formatEuclideanSpace,
	formatSubscriptIndex,
	matVec,
	norm,
	padToVec3,
	perturbTargetIntoLeftNullspace,
	resizeMatrixState,
	snapTargetToColumnSpace,
	subVec,
	symmetrizeState,
	transposeState
} from './index';

describe('Four Fundamental Subspaces — State, Operations, Camera & Serialization', () => {
	it('transposes A <-> A^T cleanly, swapping row/column and null/left-null dimensions', () => {
		const over = applyPresetToState(createDefaultState(), 'overdetermined-line-fit');
		const before = analyzeMatrix(over.matrix, over.x, over.b);
		expect(before.m).toBe(3);
		expect(before.n).toBe(2);
		expect(before.subspaces.null.dimension).toBe(0);
		expect(before.subspaces.leftNull.dimension).toBe(1);

		const transposed = transposeState(over);
		const after = analyzeMatrix(transposed.matrix, transposed.x, transposed.b);
		expect(after.m).toBe(2);
		expect(after.n).toBe(3);
		expect(after.subspaces.null.dimension).toBe(1);
		expect(after.subspaces.leftNull.dimension).toBe(0);
	});

	it('symmetrizes square matrices so C(A^T) = C(A) and N(A) = N(A^T)', () => {
		const initial = createDefaultState('asymmetric-rank2');
		const sym = symmetrizeState(initial);
		for (let i = 0; i < 3; i += 1) {
			for (let j = 0; j < 3; j += 1) {
				expect(sym.matrix[i][j]).toBeCloseTo(sym.matrix[j][i], 12);
			}
		}
	});

	it('slides x along N(A) without changing Ax', () => {
		const state = createDefaultState('asymmetric-rank2');
		const baseAnalysis = analyzeMatrix(state.matrix, state.x, state.b);
		const shiftedState = { ...state, slideNullPhase: 1.1 };
		const xMoved = effectiveInputVector(shiftedState, baseAnalysis);

		expect(norm(subVec(xMoved, state.x))).toBeGreaterThan(0.5);
		const axBefore = matVec(state.matrix, state.x);
		const axAfter = matVec(state.matrix, xMoved);
		expect(norm(subVec(axAfter, axBefore))).toBeLessThan(1e-11);
	});

	it('snaps b into C(A) and perturbs b into N(A^T) cleanly across all 12 canonical presets', () => {
		for (const preset of CANONICAL_PRESETS) {
			const state = createDefaultState(preset.id);
			const initial = analyzeMatrix(state.matrix, state.x, state.b);
			const snapped = snapTargetToColumnSpace(state, initial);
			const afterSnap = analyzeMatrix(snapped.matrix, snapped.x, snapped.b);
			expect(afterSnap.target.isExact, `snap exact for ${preset.id}`).toBe(true);
			expect(afterSnap.target.normResidual, `snap residual for ${preset.id}`).toBeLessThan(1e-11);

			if (initial.subspaces.leftNull.dimension > 0) {
				const perturbed = perturbTargetIntoLeftNullspace(snapped, afterSnap, 1.5);
				const afterPerturb = analyzeMatrix(perturbed.matrix, perturbed.x, perturbed.b);
				expect(afterPerturb.target.isExact, `perturb inconsistent for ${preset.id}`).toBe(false);
				expect(afterPerturb.target.normResidual).toBeCloseTo(1.5, 3);
			}
		}
	});

	it('round-trips full viewer state through URL query strings and rejects malformed parameters', () => {
		const state = applyPresetToState(createDefaultState(), 'strang-graph-incidence');
		state.basisMode = 'rref';
		state.viewMode = 'superimposed';
		state.morphMode = 'svd-stages';
		state.morphT = 0.65;
		state.linkCameras = false;
		state.cameraPreset = 'edge-on';
		state.studioTheme = 'light';
		state.relativeTolerance = 1e-3;

		const query = encodeStateToQuery(state);
		const restored = decodeStateFromSearch(`?${query}`);

		expect(restored.presetId).toBe(state.presetId);
		expect(restored.m).toBe(3);
		expect(restored.n).toBe(3);
		expect(restored.basisMode).toBe('rref');
		expect(restored.viewMode).toBe('superimposed');
		expect(restored.morphMode).toBe('svd-stages');
		expect(restored.morphT).toBeCloseTo(0.65, 2);
		expect(restored.linkCameras).toBe(false);
		expect(restored.cameraPreset).toBe('edge-on');
		expect(restored.studioTheme).toBe('light');
		expect(restored.relativeTolerance).toBeCloseTo(1e-3, 5);

		// Malformed query must degrade safely to valid default state without NaN
		const bad = decodeStateFromSearch(
			'?preset=nonexistent&shape=9x9&a=NaN,Infinity&tol=-5&view=superimposed'
		);
		expect(bad.m).toBe(3);
		expect(bad.n).toBe(3);
		expect(bad.matrix.flat().every(Number.isFinite)).toBe(true);
		expect(bad.relativeTolerance).toBeGreaterThan(0);

		// Modified matrix under a named preset must decode as 'custom' rather than mislabeling the matrix
		const mismatched = decodeStateFromSearch(
			'?preset=asymmetric-rank2&shape=3x3&a=1,0,0;0,1,0;0,0,1'
		);
		expect(mismatched.presetId).toBe('custom');
		expect(analyzeMatrix(mismatched.matrix, mismatched.x, mismatched.b).rank).toBe(3);

		// Dropping smallest singular value marks presetId as 'custom'
		const nearState = createDefaultState('nearly-singular');
		const dropped = applySmallestSingularValue(nearState, 0);
		expect(dropped.presetId).toBe('custom');
	});

	it('computes geometrically faithful, roll-free smart camera poses for edge-on and down-nullspace presets', () => {
		const state = createDefaultState('asymmetric-rank2');
		const analysis = analyzeMatrix(state.matrix, state.x, state.b);
		const nullDir = padToVec3(analysis.subspaces.null.svdBasis[0]);

		// Edge-on camera sits inside C(A^T), hence perpendicular to N(A), with level up [0,1,0]
		const edgeOn = computeSmartCameraPose(analysis, 'edge-on', 'domain');
		const edgeOnUnit = edgeOn.position.map((v) => v / norm(edgeOn.position));
		expect(Math.abs(dot(edgeOnUnit, nullDir))).toBeLessThan(1e-10);
		expect(edgeOn.up).toEqual([0, 1, 0]);

		// Down-nullspace camera sits directly along N(A) with level up [0,1,0]
		const downNull = computeSmartCameraPose(analysis, 'down-nullspace', 'domain');
		const downNullUnit = downNull.position.map((v) => v / norm(downNull.position));
		expect(Math.abs(dot(downNullUnit, nullDir))).toBeCloseTo(1, 10);
		expect(downNull.up).toEqual([0, 1, 0]);

		// Vertical normal plane (x2 = 0) stays non-singular for OrbitControls
		const horiz = analyzeMatrix(
			[
				[1, 0, 0],
				[0, 0, 0],
				[0, 0, 1]
			],
			[1, 1, 1],
			[1, 1, 1]
		);
		const downVert = computeSmartCameraPose(horiz, 'down-nullspace', 'domain');
		expect(downVert.up).toEqual([0, 1, 0]);
		expect(
			Math.abs(
				dot(
					downVert.position.map((v) => v / norm(downVert.position)),
					[0, 1, 0]
				)
			)
		).toBeLessThan(1);
	});

	it('generates deterministic seeded random matrices and clean text/JSON summaries', () => {
		const base = resizeMatrixState(createDefaultState(), 3, 2);
		const first = applySeededRandomMatrix(base, 1, 77);
		const second = applySeededRandomMatrix(base, 1, 77);
		expect(first.matrix).toEqual(second.matrix);
		expect(analyzeMatrix(first.matrix, first.x, first.b).rank).toBe(1);

		expect(formatEuclideanSpace(1)).toBe('ℝ¹');
		expect(formatEuclideanSpace(2)).toBe('ℝ²');
		expect(formatEuclideanSpace(3)).toBe('ℝ³');
		expect(formatSubscriptIndex(0)).toBe('₀');
		expect(formatSubscriptIndex(1)).toBe('₁');
		expect(formatSubscriptIndex(2)).toBe('₂');
		expect(formatSubscriptIndex(3)).toBe('₃');
		expect(formatSubscriptIndex(12)).toBe('₁₂');
		expect(formatSubscriptIndex(-3)).toBe('₀');
		expect(formatSubscriptIndex(Number.NaN)).toBe('₀');

		const text = buildPlainTextSummary(first);
		expect(text).toContain('Four Fundamental Subspaces Summary');
		expect(text).toContain('Rank r = 1');
		expect(text).toContain('Row Space C(Aᵀ) ⊂ ℝ²');
		expect(text).toContain('Nullspace N(A) ⊂ ℝ²');
		expect(text).toContain('Column Space C(A) ⊂ ℝ³');
		expect(text).toContain('Left Nullspace N(Aᵀ) ⊂ ℝ³');
		expect(text).toContain('xᵣ');
		expect(text).toContain('xₙ');
		expect(text).toContain('max|vᵣ·vₙ|');
		expect(text).not.toMatch(/ℝ\^|x_r|x_n|v_r|v_n|u_c|_F/);

		const oneByOne = resizeMatrixState(createDefaultState(), 1, 1);
		const text1x1 = buildPlainTextSummary(oneByOne);
		expect(text1x1).toContain('Row Space C(Aᵀ) ⊂ ℝ¹');
		expect(text1x1).toContain('Column Space C(A) ⊂ ℝ¹');
		expect(text1x1).not.toContain('ℝ^');

		const json = JSON.parse(buildJsonSummary(first));
		expect(json.rank).toBe(1);
		expect(json.shape).toEqual([3, 2]);
		expect(CANONICAL_PRESETS.length).toBe(12);
	});
});
