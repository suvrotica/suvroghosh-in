export type Dim = 1 | 2 | 3;

export type Vec = number[];
export type Vec3 = [number, number, number];
export type MatrixData = number[][];

export type BasisMode = 'svd' | 'rref';
export type ViewMode = 'dual' | 'superimposed';
export type MorphMode = 'linear' | 'svd-stages';
export type StudioTheme = 'dark' | 'light';

export type CameraPresetId = 'isometric' | 'edge-on' | 'down-nullspace' | 'face-on-active';

export type SubspaceKey = 'row' | 'null' | 'col' | 'leftNull';

export type LinearSystemRegimeId =
	| 'unique-exact'
	| 'infinite-exact'
	| 'unique-least-squares'
	| 'infinite-least-squares';

export interface SvdResult {
	m: Dim;
	n: Dim;
	/** Full m x m orthonormal left singular matrix (columns are u_1..u_m). */
	u: MatrixData;
	/** Full n x n orthonormal right singular matrix (columns are v_1..v_n). */
	v: MatrixData;
	/** Left singular vectors u_1..u_m as column arrays of length m. */
	uVectors: Vec[];
	/** Right singular vectors v_1..v_n as column arrays of length n. */
	vVectors: Vec[];
	/** Singular values sigma_1 >= ... >= sigma_min(m,n) >= 0. */
	singularValues: number[];
	/** Effective threshold tau = max(m,n) * sigma_1 * relativeTolerance (0 if sigma_1 = 0). */
	tolerance: number;
	relativeTolerance: number;
	/** Effective numerical rank r = #{i : sigma_i > tau}. */
	rank: number;
	/** Condition number sigma_1 / sigma_r when r > 0, else null. */
	conditionNumber: number | null;
	/** True when a positive singular value (> 1e-12 * sigma_1) was dropped by tau. */
	rankTruncated: boolean;
}

export interface RrefResult {
	rref: MatrixData;
	pivotColumns: number[];
	freeColumns: number[];
	rowSpaceBasis: Vec[];
	columnSpaceBasis: Vec[];
	nullspaceBasis: Vec[];
	leftNullspaceBasis: Vec[];
	/** True when RREF was computed on the rank-r truncated SVD matrix for consistency with tau. */
	usedRankTruncation: boolean;
}

export interface SubspaceInfo {
	key: SubspaceKey;
	name: string;
	symbol: string;
	ambientSpace: 'domain' | 'codomain';
	ambientDim: Dim;
	dimension: number;
	geometryLabel:
		| 'Origin {0}'
		| '1D Line'
		| '2D Plane'
		| '3D Whole Space'
		| '2D Whole Plane'
		| '1D Whole Line';
	svdBasis: Vec[];
	rrefBasis: Vec[];
}

export interface InputDecomposition {
	x: Vec;
	xRow: Vec;
	xNull: Vec;
	ax: Vec;
	axRow: Vec;
	axNullResidualNorm: number;
	normX: number;
	normXRow: number;
	normXNull: number;
	normAx: number;
	/** Dot product |x_r . x_n|, should be ~0. */
	orthogonalityDot: number;
	/** Fiber x_r + N(A) anchor point (x_r) and orthonormal directions of N(A). */
	fiberAnchor: Vec;
	fiberDirections: Vec[];
}

export interface TargetDecomposition {
	b: Vec;
	/** Orthogonal projection p = proj_{C(A)}(b) in C(A). */
	projection: Vec;
	/** Residual e = b - p in N(A^T). */
	residual: Vec;
	/** Minimum-norm least-squares solution x^+ = A^+ b in C(A^T). */
	xPlus: Vec;
	/** Image A x^+, matching projection p up to numerical precision / truncation. */
	axPlus: Vec;
	normB: number;
	normProjection: number;
	normResidual: number;
	normXPlus: number;
	/** ||A^T e||_2, verifying residual orthogonality to C(A). */
	normalEquationResidual: number;
	/** Complete family x^+ + N(A). */
	solutionAnchor: Vec;
	solutionDirections: Vec[];
	isExact: boolean;
	regimeId: LinearSystemRegimeId;
	regimeTitle: string;
	regimeSummary: string;
}

export interface SubspaceReceipts {
	dimRow: number;
	dimNull: number;
	dimCol: number;
	dimLeftNull: number;
	domainSumOk: boolean;
	codomainSumOk: boolean;
	rowNullMaxDot: number;
	colLeftNullMaxDot: number;
	inputOrthogonalityDot: number;
	normalEquationResidual: number;
	svdReconstructionError: number;
	uOrthonormalityError: number;
	vOrthonormalityError: number;
}

export interface SubspaceAnalysis {
	m: Dim;
	n: Dim;
	matrix: MatrixData;
	svd: SvdResult;
	rref: RrefResult;
	rank: number;
	subspaces: Record<SubspaceKey, SubspaceInfo>;
	input: InputDecomposition;
	target: TargetDecomposition;
	receipts: SubspaceReceipts;
	/** 3x3 or 2x2 determinant when square, else null. */
	determinant: number | null;
}

export type PresetGroupId = 'rank-collapse' | 'rectangular' | 'full-rank' | 'boundary';

export interface CanonicalPreset {
	id: string;
	name: string;
	shortLabel: string;
	group: PresetGroupId;
	groupLabel: string;
	m: Dim;
	n: Dim;
	expectedRank: number;
	matrix: MatrixData;
	defaultX: Vec;
	defaultB: Vec;
	takeaway: string;
	geometricNote: string;
	highlightSigmaControl?: boolean;
	defaultCameraPreset?: CameraPresetId;
}

export interface LayerFlags {
	showRowSpace: boolean;
	showNullspace: boolean;
	showColSpace: boolean;
	showLeftNullspace: boolean;
	showBasisVectors: boolean;
	showUnitSphere: boolean;
	showInputVector: boolean;
	showInputSplit: boolean;
	showAffineFiber: boolean;
	showTargetVector: boolean;
	showTargetSplit: boolean;
	showPseudoinverse: boolean;
	showRightAngles: boolean;
	showLabels: boolean;
	showGridAxes: boolean;
}

export interface SubspaceViewerState {
	presetId: string;
	m: Dim;
	n: Dim;
	matrix: MatrixData;
	x: Vec;
	b: Vec;
	relativeTolerance: number;
	basisMode: BasisMode;
	viewMode: ViewMode;
	morphMode: MorphMode;
	morphT: number;
	linkCameras: boolean;
	cameraPreset: CameraPresetId;
	studioTheme: StudioTheme;
	slideNullActive: boolean;
	slideNullPhase: number;
	randomSeed: number;
	randomTargetRank: number;
	layers: LayerFlags;
}

export interface OrientationSnapshot {
	right: Vec3;
	up: Vec3;
	forward: Vec3;
}

export interface ProjectedLabel {
	id: string;
	text: string;
	color: string;
	anchorX: number;
	anchorY: number;
	labelX: number;
	labelY: number;
	stage: 'domain' | 'codomain' | 'superimposed';
}
