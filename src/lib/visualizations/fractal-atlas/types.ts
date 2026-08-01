/**
 * Browser-independent contracts shared by the Fractal Atlas renderers, workers,
 * inspectors, presets, and serialisation layer.
 */

export const FRACTAL_STATE_VERSION = 1 as const;

export type FractalFamily =
	| 'mandelbrot'
	| 'julia'
	| 'multibrot'
	| 'burning-ship'
	| 'tricorn'
	| 'phoenix'
	| 'custom-map'
	| 'newton'
	| 'buddhabrot'
	| 'barnsley-fern'
	| 'sierpinski'
	| 'l-system';

export type EscapeTimeFamily =
	| 'mandelbrot'
	| 'julia'
	| 'multibrot'
	| 'burning-ship'
	| 'tricorn'
	| 'phoenix'
	| 'custom-map';

export type ComputationalClass =
	| 'escape-time'
	| 'convergence-basin'
	| 'orbit-density'
	| 'iterated-function-system'
	| 'recursive-construction'
	| 'recursive-grammar';

export type FractalPlane = 'parameter' | 'dynamical' | 'basin' | 'density' | 'construction';

export type ColoringMode =
	| 'binary'
	| 'bands'
	| 'smooth'
	| 'histogram'
	| 'distance'
	| 'orbit-trap'
	| 'root-basin'
	| 'density';

export type RenderQuality = 'battery' | 'draft' | 'balanced' | 'high';
export type PrecisionMode = 'auto' | 'float' | 'double-single' | 'perturbation';
export type PaletteInterpolation = 'srgb';
export type OrbitTrapKind = 'point' | 'line' | 'circle' | 'cross' | 'grid';

export interface ComplexValue {
	re: number;
	im: number;
}

export interface DecimalComplexValue {
	re: string;
	im: string;
}

export interface FractalViewport {
	center: ComplexValue;
	/** Authoritative centre for deep navigation; `center` is its Number compatibility shadow. */
	centerDecimal?: DecimalComplexValue;
	/** Vertical complex-plane span. The horizontal span follows the canvas aspect ratio. */
	spanY: number;
	/** Counter-clockwise complex-plane rotation, in radians. */
	rotation: number;
}

export interface ViewportBounds {
	minRe: number;
	maxRe: number;
	minIm: number;
	maxIm: number;
}

export interface ScreenPoint {
	x: number;
	y: number;
}

export interface OrbitTrapState {
	kind: OrbitTrapKind;
	position: ComplexValue;
	radius: number;
	spacing: number;
	rotation: number;
	mix: number;
}

/**
 * Coefficients are ordered from the highest power to the constant term.
 * `[1, 0, 0, -1]` therefore represents z³ − 1.
 */
export interface PolynomialState {
	coefficients: ComplexValue[];
}

/**
 * A deliberately small, data-only escape-map language. These fields are the
 * complete grammar: no expression text, JavaScript, AST, or shader source is
 * accepted anywhere in the state contract.
 */
export type CustomMapInitialZRule = 'plane-default' | 'zero' | 'pixel' | 'parameter';

export interface CustomMapRecipe {
	power: number;
	conjugateBeforePower: boolean;
	absoluteReal: boolean;
	absoluteImaginary: boolean;
	addC: boolean;
	memoryEnabled: boolean;
	memoryCoefficient: ComplexValue;
	initialZ: CustomMapInitialZRule;
}

export interface AffineTransform {
	id: string;
	label: string;
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
	probability: number;
	color?: string;
}

export interface IFSState {
	transforms: AffineTransform[];
	colorBy: 'transform' | 'age';
}

export interface LSystemDefinition {
	axiom: string;
	rules: Record<string, string>;
	angleDegrees: number;
	stepLength: number;
	startAngleDegrees?: number;
}

export interface LSystemState extends LSystemDefinition {
	presetId: string;
	generations: number;
	lineWidth: number;
	colorByDepth: boolean;
}

export interface PaletteStop {
	position: number;
	color: string;
}

export interface PaletteDefinition {
	id: string;
	label: string;
	stops: readonly PaletteStop[];
	interpolation: PaletteInterpolation;
	categorical?: boolean;
}

export interface DensityState {
	targetSamples: number;
	exposure: number;
	gamma: number;
	iterationBands: [number, number][];
}

export interface FractalViewState {
	version: typeof FRACTAL_STATE_VERSION;
	family: FractalFamily;
	plane: FractalPlane;
	center: ComplexValue;
	/** Decimal strings survive URL/local serialisation after Number addition collapses. */
	centerDecimal?: DecimalComplexValue;
	spanY: number;
	rotation: number;
	maxIterations: number;
	bailout: number;
	exponent: number;
	juliaC: ComplexValue;
	juliaCDecimal?: DecimalComplexValue;
	phoenixP: ComplexValue;
	/** Fixed remembered value z₋₁ for the second-order Phoenix recurrence. */
	phoenixPrevious: ComplexValue;
	/** Damping/over-relaxation λ in zₙ₊₁ = zₙ − λf(zₙ)/f′(zₙ). */
	newtonRelaxation: number;
	coloring: ColoringMode;
	paletteId: string;
	paletteOffset: number;
	paletteCycles: number;
	/** Screen-space relief-light azimuth in radians for distance shading. */
	distanceLightAngle?: number;
	/** Relief-light contribution from 0 (unlit distance tone) to 1 (full directional modulation). */
	distanceLightStrength?: number;
	interiorColor: string;
	customPalette?: PaletteStop[];
	orbitTrap?: OrbitTrapState;
	polynomial?: PolynomialState;
	customMap?: CustomMapRecipe;
	ifs?: IFSState;
	lSystem?: LSystemState;
	density?: DensityState;
	seed: number;
	renderQuality: RenderQuality;
	precisionMode: PrecisionMode;
	flipY: boolean;
	analyticInteriorTests: boolean;
	convergenceTolerance: number;
}

export interface FamilyDefaults {
	plane: FractalPlane;
	viewport: FractalViewport;
	maxIterations: number;
	bailout: number;
	exponent: number;
	juliaC: ComplexValue;
	juliaCDecimal?: DecimalComplexValue;
	phoenixP: ComplexValue;
	phoenixPrevious: ComplexValue;
	newtonRelaxation: number;
	coloring: ColoringMode;
	paletteId: string;
	polynomial?: PolynomialState;
	customMap?: CustomMapRecipe;
	ifs?: IFSState;
	lSystem?: LSystemState;
	density?: DensityState;
}

export interface FamilyPassport {
	name: string;
	alternativeNames: readonly string[];
	formula: string;
	computationalClass: ComputationalClass;
	pixelRole: string;
	fixedQuantities: string;
	variableQuantities: string;
	colorMeaning: string;
	typicalSymmetry: string;
	suggestedExperiment: string;
	historicalNote: string;
	sectionId: string;
	finiteComputationCaveat: string;
}

export interface FamilyDefinition {
	id: FractalFamily;
	passport: FamilyPassport;
	supportedPlanes: readonly FractalPlane[];
	defaults: FamilyDefaults;
}

export type EscapeOrbitStatus = 'escaped' | 'periodic' | 'max-iterations' | 'non-finite';
export type NewtonOrbitStatus = 'converged' | 'derivative-zero' | 'max-iterations' | 'non-finite';

export interface OrbitPoint {
	iteration: number;
	value: ComplexValue;
	/** Authoritative Decimal value when the selected orbit used deep-coordinate arithmetic. */
	valueDecimal?: DecimalComplexValue;
	/** Present for recurrences, such as Phoenix, that retain the previous iterate. */
	previous?: ComplexValue;
	/** Newton diagnostic |f(zₙ)|, when a polynomial orbit supplied the point. */
	residual?: number;
	/** Newton diagnostic |f′(zₙ)|, evaluated before the next step. */
	derivativeMagnitude?: number;
	/** Index of the geometrically nearest known root, whether or not convergence was reached. */
	nearestRootIndex?: number;
	/** Euclidean distance from zₙ to the nearest known root. */
	nearestRootDistance?: number;
}

export interface PeriodDetectionSummary {
	enabled: boolean;
	tolerance: number;
	transientIterations: number;
	requiredMatchingCycles: number;
	matchingCycles: number;
}

export interface EscapeOrbitResult {
	/** The plane determines whether the probed pixel supplies c or z₀. */
	plane: 'parameter' | 'dynamical';
	/** Complex value supplied by the probed pixel. */
	pixel: ComplexValue;
	/** Authoritative probed coordinate when Decimal orbit arithmetic was requested. */
	pixelDecimal?: DecimalComplexValue;
	/** Parameter used by the recurrence. In parameter space this is the pixel value. */
	c: ComplexValue;
	/** Authoritative recurrence parameter when Decimal orbit arithmetic was requested. */
	cDecimal?: DecimalComplexValue;
	/** Escape radius used for this calculation. */
	bailout: number;
	/** Greatest |zₙ| reached, including points omitted from a bounded orbit recording. */
	maximumMagnitude: number;
	status: EscapeOrbitStatus;
	iterations: number;
	value: ComplexValue;
	/** Authoritative final iterate when Decimal orbit arithmetic was requested. */
	valueDecimal?: DecimalComplexValue;
	/** Significant-digit working precision of the Decimal orbit, when active. */
	decimalPrecision?: number;
	previous?: ComplexValue;
	orbit: OrbitPoint[];
	escapeMagnitude?: number;
	smoothIteration?: number;
	period?: number;
	/** Configuration and evidence for the optional approximate period detector. */
	periodDetection?: PeriodDetectionSummary;
}

export interface NewtonOrbitResult {
	/** Known roots used to classify convergence, when available. */
	roots: ComplexValue[];
	convergenceTolerance: number;
	relaxation: number;
	/** Greatest |zₙ| reached, including points omitted from a bounded orbit recording. */
	maximumMagnitude: number;
	status: NewtonOrbitStatus;
	iterations: number;
	value: ComplexValue;
	orbit: OrbitPoint[];
	rootIndex?: number;
	root?: ComplexValue;
	residual: number;
}

export type PresetGroup =
	| 'mandelbrot-landmarks'
	| 'julia-personalities'
	| 'related-escape-maps'
	| 'root-basins'
	| 'orbit-ghosts'
	| 'precision-demonstrations'
	| 'recursive-cousins';

export interface AtlasPreset {
	id: string;
	label: string;
	group: PresetGroup;
	description: string;
	verified: boolean;
	verificationNote: string;
	historicalNote?: string;
	openLinkedView?: boolean;
	state: FractalViewState;
}

export interface StateIssue {
	path: string;
	value?: unknown;
	message: string;
	severity: 'warning' | 'error';
}

export interface StateValidationResult {
	state: FractalViewState;
	issues: StateIssue[];
	unsupportedVersion: boolean;
	migrated: boolean;
}

export interface Point2D {
	x: number;
	y: number;
}

export interface LineSegment {
	from: Point2D;
	to: Point2D;
	depth?: number;
}

export interface Triangle {
	a: Point2D;
	b: Point2D;
	c: Point2D;
}

export interface IFSPoint extends Point2D {
	iteration: number;
	transformIndex: number;
}
