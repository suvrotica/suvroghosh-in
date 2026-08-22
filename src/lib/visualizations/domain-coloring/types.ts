export type Complex = {
	re: number;
	im: number;
};

export type ComplexFunctionName =
	| 'exp'
	| 'log'
	| 'sin'
	| 'cos'
	| 'tan'
	| 'sqrt'
	| 'abs'
	| 'conj'
	| 'sinc';

export type ExpressionNode =
	| { kind: 'number'; value: number }
	| { kind: 'constant'; name: 'z' | 'i' | 'e' | 'pi' }
	| { kind: 'unary'; operator: '+' | '-'; value: ExpressionNode }
	| {
			kind: 'binary';
			operator: '+' | '-' | '*' | '/' | '^';
			left: ExpressionNode;
			right: ExpressionNode;
	  }
	| {
			kind: 'call';
			name: ComplexFunctionName;
			argument: ExpressionNode;
	  };

export type ViewMode = '2d' | '3d' | 'comparison' | 'sheets';
export type HeightLens = 'log-magnitude' | 'real' | 'imaginary' | 'phase' | 'flat';
export type HeightCompression = 'linear' | 'asinh';
export type CameraOrientation = 'isometric' | 'top' | 'front-real' | 'front-imaginary';
export type CameraProjection = 'orthographic' | 'perspective';
export type RenderQuality = 'low' | 'medium' | 'high';
export type SheetKind = 'sqrt' | 'cuberoot' | 'log';
export type MathematicalClass =
	| 'entire'
	| 'polynomial'
	| 'meromorphic'
	| 'principal-branch'
	| 'removable-extension'
	| 'essential-singularity'
	| 'antiholomorphic';

export type DomainBounds = {
	minRe: number;
	maxRe: number;
	minIm: number;
	maxIm: number;
};

/** Explicit rectangular mathematical domain, independent of camera motion. */
export type Viewport = {
	centerRe: number;
	centerIm: number;
	spanRe: number;
	spanIm: number;
};

export type ViewportBounds = DomainBounds;

export type CameraState = {
	orientation: CameraOrientation;
	projection: CameraProjection;
	azimuth: number;
	elevation: number;
	distance: number;
	zoom: number;
	targetX: number;
	targetY: number;
	targetZ: number;
};

export type HeightSettings = {
	lens: HeightLens;
	compression: HeightCompression;
	verticalScale: number;
	logCap: number;
	componentScale: number;
	componentCap: number;
};

export type OverlayState = {
	contours: boolean;
	grid: boolean;
	markers: boolean;
	mesh: boolean;
	lighting: boolean;
	caps: boolean;
};

export type LoopGeometry = {
	center: Complex;
	radius: number;
};

export type ExplorerState = {
	version: 1;
	presetId: string | null;
	expression: string;
	viewport: Viewport;
	viewMode: ViewMode;
	height: HeightSettings;
	camera: CameraState;
	overlays: OverlayState;
	quality: RenderQuality;
	sheetRange: number;
	sheetRadialMin: number;
	sheetRadialMax: number;
	allSheets: boolean;
	loop: LoopGeometry | null;
};

export type FeatureKind =
	| 'zero'
	| 'pole'
	| 'critical'
	| 'branch-point'
	| 'essential'
	| 'removable'
	| 'accumulation';

export type ComplexFeature = {
	id: string;
	kind: FeatureKind;
	z: Complex;
	label: string;
	order?: number;
	note?: string;
};

export type FeatureFamily = {
	id: string;
	kind: FeatureKind;
	description: string;
	nonExhaustive: true;
	generate: (bounds: DomainBounds, limit: number) => ComplexFeature[];
};

export type BranchCut =
	| {
			kind: 'ray';
			origin: Complex;
			direction: Complex;
			label: string;
	  }
	| {
			kind: 'segment';
			from: Complex;
			to: Complex;
			label: string;
	  }
	| {
			kind: 'real-preimage';
			label: string;
			test: (z: Complex) => number;
	  };

export type SheetSupport = {
	kind: SheetKind;
	defaultAllSheets: boolean;
	description: string;
};

export type PresetCategory =
	| 'Start here'
	| 'Zeros, poles, and critical points'
	| 'Classical maps'
	| 'Periodicity and growth'
	| 'Removable and essential singularities'
	| 'Principal branches and sheets'
	| 'Non-holomorphic control';

export type DomainColoringPreset = {
	id: string;
	label: string;
	expression: string;
	notation: string;
	category: PresetCategory;
	mathematicalClass: MathematicalClass;
	holomorphic: boolean;
	summary: string;
	notice: string;
	articleAnchor: string;
	view: Viewport;
	camera: CameraState;
	height: HeightSettings;
	quality: RenderQuality;
	overlays: OverlayState;
	features: readonly ComplexFeature[];
	featureFamilies?: readonly FeatureFamily[];
	cuts?: readonly BranchCut[];
	sheets?: SheetSupport;
};

export type EvaluationStatus =
	| 'finite'
	| 'zero'
	| 'pole'
	| 'zero-like'
	| 'pole-like'
	| 'undefined'
	| 'indeterminate';

export type EvaluationDiagnostic = {
	value: Complex;
	status: EvaluationStatus;
	reason?: string;
};

export type HeightSample = {
	raw: number | null;
	displayed: number | null;
	clipped: 'none' | 'low' | 'high';
	label: string;
	formula: string;
};

export type ProbeResult = {
	z: Complex;
	value: Complex;
	status: EvaluationStatus;
	statusDetail: string;
	modulus: number | null;
	phase: number | null;
	phaseDegrees: number | null;
	logMagnitude: number | null;
	height: HeightSample;
	derivative: Complex | null;
	localScale: number | null;
	localRotation: number | null;
	nearFeature: ComplexFeature | null;
};
