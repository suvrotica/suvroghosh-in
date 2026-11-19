import {
	DEFAULT_RELATIVE_TOLERANCE,
	MAX_MATRIX_ENTRY,
	MAX_RELATIVE_TOLERANCE,
	MIN_RELATIVE_TOLERANCE,
	addVec,
	analyzeMatrix,
	clampNumber,
	cleanZero,
	cloneMatrix,
	formatEuclideanSpace,
	formatScalar,
	formatScientific,
	formatVec,
	generateSeededRankMatrix,
	matricesApproximatelyEqual,
	normalizeDim,
	scaleVec,
	setSmallestSingularValue,
	transposeMatrix
} from './math';
import { CANONICAL_PRESETS, DEFAULT_PRESET_ID, getPresetById } from './presets';
import type {
	BasisMode,
	CameraPresetId,
	Dim,
	LayerFlags,
	MatrixData,
	MorphMode,
	StudioTheme,
	SubspaceAnalysis,
	SubspaceViewerState,
	SvdResult,
	Vec,
	ViewMode
} from './types';

export function createDefaultLayers(): LayerFlags {
	return {
		showRowSpace: true,
		showNullspace: true,
		showColSpace: true,
		showLeftNullspace: true,
		showBasisVectors: true,
		showUnitSphere: true,
		showInputVector: true,
		showInputSplit: true,
		showAffineFiber: true,
		showTargetVector: true,
		showTargetSplit: true,
		showPseudoinverse: true,
		showRightAngles: true,
		showLabels: true,
		showGridAxes: true
	};
}

export function createDefaultState(presetId = DEFAULT_PRESET_ID): SubspaceViewerState {
	const preset = getPresetById(presetId) ?? CANONICAL_PRESETS[0];
	return {
		presetId: preset.id,
		m: preset.m,
		n: preset.n,
		matrix: cloneMatrix(preset.matrix),
		x: [...preset.defaultX],
		b: [...preset.defaultB],
		relativeTolerance: DEFAULT_RELATIVE_TOLERANCE,
		basisMode: 'svd',
		viewMode: 'dual',
		morphMode: 'linear',
		morphT: 0,
		linkCameras: true,
		cameraPreset: preset.defaultCameraPreset ?? 'isometric',
		studioTheme: 'dark',
		slideNullActive: false,
		slideNullPhase: 0,
		randomSeed: 42,
		randomTargetRank: Math.min(2, Math.min(preset.m, preset.n)),
		layers: createDefaultLayers()
	};
}

export function cloneState(state: SubspaceViewerState): SubspaceViewerState {
	return {
		...state,
		matrix: cloneMatrix(state.matrix),
		x: [...state.x],
		b: [...state.b],
		layers: { ...state.layers }
	};
}

export function applyPresetToState(
	state: SubspaceViewerState,
	presetId: string
): SubspaceViewerState {
	const preset = getPresetById(presetId);
	if (!preset) return cloneState(state);
	const next = cloneState(state);
	next.presetId = preset.id;
	next.m = preset.m;
	next.n = preset.n;
	next.matrix = cloneMatrix(preset.matrix);
	next.x = [...preset.defaultX];
	next.b = [...preset.defaultB];
	next.relativeTolerance = DEFAULT_RELATIVE_TOLERANCE;
	next.cameraPreset = preset.defaultCameraPreset ?? 'isometric';
	next.slideNullActive = false;
	next.slideNullPhase = 0;
	next.randomTargetRank = Math.min(preset.expectedRank, Math.min(preset.m, preset.n));
	if (preset.m !== preset.n && next.viewMode === 'superimposed') {
		next.viewMode = 'dual';
		next.morphT = 0;
	}
	return next;
}

export function resizeMatrixState(
	state: SubspaceViewerState,
	nextM: Dim,
	nextN: Dim
): SubspaceViewerState {
	const next = cloneState(state);
	const m = normalizeDim(nextM);
	const n = normalizeDim(nextN);
	const resized: MatrixData = Array.from({ length: m }, (_, i) =>
		Array.from({ length: n }, (__, j) => {
			if (i < state.matrix.length && j < (state.matrix[0]?.length ?? 0)) {
				return state.matrix[i][j];
			}
			return i === j ? 1 : 0;
		})
	);
	next.presetId = 'custom';
	next.m = m;
	next.n = n;
	next.matrix = resized;
	next.x = Array.from({ length: n }, (_, i) => state.x[i] ?? (i === 0 ? 1.2 : 0.6));
	next.b = Array.from({ length: m }, (_, i) => state.b[i] ?? (i === 0 ? 1.0 : 0.8));
	next.randomTargetRank = Math.min(next.randomTargetRank, Math.min(m, n));
	next.slideNullActive = false;
	next.slideNullPhase = 0;
	if (m !== n && next.viewMode === 'superimposed') {
		next.viewMode = 'dual';
		next.morphT = 0;
	}
	return next;
}

export function transposeState(state: SubspaceViewerState): SubspaceViewerState {
	const next = cloneState(state);
	next.presetId = 'custom';
	next.matrix = transposeMatrix(state.matrix);
	next.m = state.n;
	next.n = state.m;
	// Swap domain/codomain probe vectors cleanly so dimensions stay matched
	next.x = [...state.b];
	next.b = [...state.x];
	next.slideNullActive = false;
	next.slideNullPhase = 0;
	return next;
}

export function symmetrizeState(state: SubspaceViewerState): SubspaceViewerState {
	if (state.m !== state.n) return cloneState(state);
	const next = cloneState(state);
	const d = state.m;
	next.presetId = 'custom';
	next.matrix = Array.from({ length: d }, (_, i) =>
		Array.from({ length: d }, (__, j) =>
			cleanZero(0.5 * (state.matrix[i][j] + state.matrix[j][i]), 1e-12)
		)
	);
	next.slideNullActive = false;
	return next;
}

export function applySeededRandomMatrix(
	state: SubspaceViewerState,
	targetRank: number,
	nextSeed?: number
): SubspaceViewerState {
	const next = cloneState(state);
	const seed = nextSeed ?? state.randomSeed + 1;
	const rank = Math.max(0, Math.min(Math.min(state.m, state.n), Math.round(targetRank)));
	next.presetId = 'custom';
	next.randomSeed = seed;
	next.randomTargetRank = rank;
	next.matrix = generateSeededRankMatrix(state.m, state.n, rank, seed);
	next.slideNullActive = false;
	next.slideNullPhase = 0;
	return next;
}

export function applySmallestSingularValue(
	state: SubspaceViewerState,
	newSigmaMin: number,
	pinnedSvd?: SvdResult
): SubspaceViewerState {
	const next = cloneState(state);
	next.matrix = setSmallestSingularValue(state.matrix, newSigmaMin, pinnedSvd);
	const currentPreset = getPresetById(state.presetId);
	if (currentPreset && !matricesApproximatelyEqual(next.matrix, currentPreset.matrix, 1e-4)) {
		next.presetId = 'custom';
	}
	return next;
}

export function snapTargetToColumnSpace(
	state: SubspaceViewerState,
	analysis: SubspaceAnalysis
): SubspaceViewerState {
	const next = cloneState(state);
	next.b = analysis.target.projection.map((v) => cleanZero(v, 1e-13));
	return next;
}

export function perturbTargetIntoLeftNullspace(
	state: SubspaceViewerState,
	analysis: SubspaceAnalysis,
	amount = 1.2
): SubspaceViewerState {
	const next = cloneState(state);
	const leftBasis = analysis.subspaces.leftNull.svdBasis;
	if (leftBasis.length === 0) return next;
	const perturbed = addVec(state.b, scaleVec(leftBasis[0], amount));
	next.b = perturbed.map((v) => clampNumber(Number(v.toFixed(4)), -10, 10));
	return next;
}

/**
 * Compute shifted input vector x(phase) = x + A_slide * sin(phase) * v_null
 * along the first nullspace direction so Ax stays invariant while x slides along the fiber.
 */
export function effectiveInputVector(state: SubspaceViewerState, analysis: SubspaceAnalysis): Vec {
	if (Math.abs(state.slideNullPhase) < 1e-9 || analysis.subspaces.null.svdBasis.length === 0) {
		return state.x;
	}
	const dir = analysis.subspaces.null.svdBasis[0];
	const offset = Math.sin(state.slideNullPhase) * 1.45;
	return addVec(state.x, scaleVec(dir, offset));
}

function encodeVec(vec: Vec): string {
	return vec.map((v) => Number(cleanZero(v, 1e-12).toFixed(7))).join(',');
}

function encodeMatrix(matrix: MatrixData): string {
	return matrix
		.map((row) => row.map((v) => Number(cleanZero(v, 1e-12).toFixed(7))).join(','))
		.join(';');
}

function parseNumberList(
	raw: string | null,
	expectedLen: number,
	min: number,
	max: number
): Vec | null {
	if (!raw) return null;
	const parts = raw.split(',').map((s) => Number(s.trim()));
	if (parts.length !== expectedLen || parts.some((v) => !Number.isFinite(v))) return null;
	return parts.map((v) => clampNumber(v, min, max));
}

function parseMatrixParam(raw: string | null, m: Dim, n: Dim): MatrixData | null {
	if (!raw) return null;
	const rows = raw.split(';');
	if (rows.length !== m) return null;
	const matrix: MatrixData = [];
	for (const row of rows) {
		const parsed = parseNumberList(row, n, -MAX_MATRIX_ENTRY, MAX_MATRIX_ENTRY);
		if (!parsed) return null;
		matrix.push(parsed);
	}
	return matrix;
}

export function encodeStateToQuery(state: SubspaceViewerState, preserveSearch = ''): string {
	const params = new URLSearchParams();
	params.set('preset', state.presetId);
	params.set('shape', `${state.m}x${state.n}`);
	params.set('a', encodeMatrix(state.matrix));
	params.set('x', encodeVec(state.x));
	params.set('b', encodeVec(state.b));
	if (Math.abs(state.relativeTolerance - DEFAULT_RELATIVE_TOLERANCE) > 1e-12) {
		params.set('tol', state.relativeTolerance.toExponential(2));
	}
	if (state.basisMode !== 'svd') params.set('basis', state.basisMode);
	if (state.viewMode !== 'dual') params.set('view', state.viewMode);
	if (state.morphMode !== 'linear') params.set('mmode', state.morphMode);
	if (state.morphT > 0) params.set('t', state.morphT.toFixed(2));
	if (!state.linkCameras) params.set('link', '0');
	if (state.cameraPreset !== 'isometric') params.set('cam', state.cameraPreset);
	if (state.studioTheme !== 'dark') params.set('theme', state.studioTheme);
	if (preserveSearch) {
		const existing = new URLSearchParams(preserveSearch);
		const webglFlag = existing.get('webgl');
		if (webglFlag) params.set('webgl', webglFlag);
	}
	return params.toString();
}

export function decodeStateFromSearch(search: string): SubspaceViewerState {
	const params = new URLSearchParams(search);
	const presetParam = params.get('preset') ?? DEFAULT_PRESET_ID;
	const base = getPresetById(presetParam)
		? createDefaultState(presetParam)
		: createDefaultState(DEFAULT_PRESET_ID);

	const shapeRaw = params.get('shape');
	if (shapeRaw && /^[123]x[123]$/.test(shapeRaw)) {
		const m = normalizeDim(Number(shapeRaw[0]));
		const n = normalizeDim(Number(shapeRaw[2]));
		const parsedA = parseMatrixParam(params.get('a'), m, n);
		if (parsedA) {
			base.m = m;
			base.n = n;
			base.matrix = parsedA;
			const matchedPreset = getPresetById(presetParam);
			const matchesPresetMatrix =
				matchedPreset !== undefined &&
				matchedPreset.m === m &&
				matchedPreset.n === n &&
				matricesApproximatelyEqual(parsedA, matchedPreset.matrix, 1e-4);
			base.presetId = matchesPresetMatrix ? matchedPreset.id : 'custom';
		}
	}

	const parsedX = parseNumberList(params.get('x'), base.n, -10, 10);
	if (parsedX) base.x = parsedX;

	const parsedB = parseNumberList(params.get('b'), base.m, -10, 10);
	if (parsedB) base.b = parsedB;

	const tolRaw = params.get('tol');
	if (tolRaw !== null) {
		const tolVal = Number(tolRaw);
		if (Number.isFinite(tolVal)) {
			base.relativeTolerance = clampNumber(tolVal, MIN_RELATIVE_TOLERANCE, MAX_RELATIVE_TOLERANCE);
		}
	}

	const basis = params.get('basis');
	if (basis === 'svd' || basis === 'rref') base.basisMode = basis as BasisMode;

	const view = params.get('view');
	if ((view === 'dual' || view === 'superimposed') && (view === 'dual' || base.m === base.n)) {
		base.viewMode = view as ViewMode;
	}

	const mmode = params.get('mmode');
	if (mmode === 'linear' || mmode === 'svd-stages') base.morphMode = mmode as MorphMode;

	const tRaw = params.get('t');
	if (tRaw !== null) {
		const tVal = Number(tRaw);
		if (Number.isFinite(tVal)) base.morphT = clampNumber(tVal, 0, 1);
	}

	const link = params.get('link');
	if (link === '0') base.linkCameras = false;
	if (link === '1') base.linkCameras = true;

	const cam = params.get('cam');
	if (
		cam === 'isometric' ||
		cam === 'edge-on' ||
		cam === 'down-nullspace' ||
		cam === 'face-on-active'
	) {
		base.cameraPreset = cam as CameraPresetId;
	}

	const theme = params.get('theme');
	if (theme === 'dark' || theme === 'light') base.studioTheme = theme as StudioTheme;

	return base;
}

export function buildPlainTextSummary(
	state: SubspaceViewerState,
	analysis?: SubspaceAnalysis
): string {
	const res = analysis ?? analyzeMatrix(state.matrix, state.x, state.b, state.relativeTolerance);
	const preset = getPresetById(state.presetId);
	const basisKey = state.basisMode === 'svd' ? 'svdBasis' : 'rrefBasis';
	const fmtBasis = (vecs: Vec[]) =>
		vecs.length === 0 ? '{0}' : vecs.map((v) => formatVec(v, 3)).join(', ');

	const matrixLines = res.matrix
		.map((row) => `  [ ${row.map((v) => formatScalar(v, 3).padStart(6, ' ')).join('  ')} ]`)
		.join('\n');

	return [
		`Four Fundamental Subspaces Summary — ${preset ? preset.name : `Custom ${res.m}×${res.n} Matrix`}`,
		`Matrix A (${res.m}×${res.n}):`,
		matrixLines,
		`Rank r = ${res.rank} (tolerance τ = ${formatScientific(res.svd.tolerance)}, relative tol = ${state.relativeTolerance.toExponential(1)})`,
		`Singular values: [${res.svd.singularValues.map((s) => formatScalar(s, 4)).join(', ')}] | κ(A) = ${res.svd.conditionNumber === null ? '∞' : formatScalar(res.svd.conditionNumber, 3)}`,
		`Dimension identities: dim C(Aᵀ) + dim N(A) = ${res.receipts.dimRow} + ${res.receipts.dimNull} = ${res.n} | dim C(A) + dim N(Aᵀ) = ${res.receipts.dimCol} + ${res.receipts.dimLeftNull} = ${res.m}`,
		`Basis mode: ${state.basisMode === 'svd' ? 'SVD Orthonormal' : 'RREF / Pivot'}`,
		`  Row Space C(Aᵀ) ⊂ ${formatEuclideanSpace(res.n)} (dim ${res.subspaces.row.dimension}, ${res.subspaces.row.geometryLabel}): ${fmtBasis(res.subspaces.row[basisKey])}`,
		`  Nullspace N(A) ⊂ ${formatEuclideanSpace(res.n)} (dim ${res.subspaces.null.dimension}, ${res.subspaces.null.geometryLabel}): ${fmtBasis(res.subspaces.null[basisKey])}`,
		`  Column Space C(A) ⊂ ${formatEuclideanSpace(res.m)} (dim ${res.subspaces.col.dimension}, ${res.subspaces.col.geometryLabel}): ${fmtBasis(res.subspaces.col[basisKey])}`,
		`  Left Nullspace N(Aᵀ) ⊂ ${formatEuclideanSpace(res.m)} (dim ${res.subspaces.leftNull.dimension}, ${res.subspaces.leftNull.geometryLabel}): ${fmtBasis(res.subspaces.leftNull[basisKey])}`,
		`Input split x = ${formatVec(res.input.x, 3)} = xᵣ ${formatVec(res.input.xRow, 3)} + xₙ ${formatVec(res.input.xNull, 3)} → Ax = ${formatVec(res.input.ax, 3)}`,
		`Target split b = ${formatVec(res.target.b, 3)} = p ${formatVec(res.target.projection, 3)} + e ${formatVec(res.target.residual, 3)} (‖e‖ = ${formatScientific(res.target.normResidual)})`,
		`Pseudoinverse x⁺ = A⁺b = ${formatVec(res.target.xPlus, 3)} | System status: ${res.target.regimeTitle}`,
		`Receipts: max|vᵣ·vₙ| = ${formatScientific(res.receipts.rowNullMaxDot)}, max|u·y| = ${formatScientific(res.receipts.colLeftNullMaxDot)}, ‖Aᵀe‖₂ = ${formatScientific(res.receipts.normalEquationResidual)}, Frobenius ‖A − UΣVᵀ‖ = ${formatScientific(res.receipts.svdReconstructionError)}`
	].join('\n');
}

export function buildJsonSummary(state: SubspaceViewerState, analysis?: SubspaceAnalysis): string {
	const res = analysis ?? analyzeMatrix(state.matrix, state.x, state.b, state.relativeTolerance);
	return JSON.stringify(
		{
			presetId: state.presetId,
			shape: [res.m, res.n],
			matrix: res.matrix,
			rank: res.rank,
			relativeTolerance: state.relativeTolerance,
			tolerance: res.svd.tolerance,
			singularValues: res.svd.singularValues,
			conditionNumber: res.svd.conditionNumber,
			determinant: res.determinant,
			basisMode: state.basisMode,
			subspaces: res.subspaces,
			rref: res.rref,
			input: res.input,
			target: res.target,
			receipts: res.receipts
		},
		null,
		2
	);
}
