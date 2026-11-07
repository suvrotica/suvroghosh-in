export const PREDATOR_PREY_LOOM_ENGINE_VERSION = '1.0.0';

export interface LoomParameters {
	/** Intrinsic prey growth rate r (per model-time unit) */
	r: number;
	/** Carrying capacity K (food available to prey, illustrative prey density units) */
	K: number;
	/** Hunting efficiency a (search/attack rate per predator per model-time unit) */
	a: number;
	/** Predator handling time h per unit of prey consumed (model-time units) */
	h: number;
	/** Conversion efficiency e of consumed prey into new predator density */
	e: number;
	/** Per-capita predator mortality rate m (per model-time unit) */
	m: number;
}

export interface LoomInitialState {
	/** Initial prey population density N(0) */
	N0: number;
	/** Initial predator population density P(0) */
	P0: number;
}

export type WorkedSettingId = 'k-1.5' | 'k-3.0' | 'k-4.0';

export interface WorkedSettingPreset {
	id: WorkedSettingId;
	label: string;
	shortLabel: string;
	K: number;
	a: number;
	summary: string;
	outcomeExplanation: string;
}

export type GuidedPromptId = 'watch-delay' | 'disturb-populations' | 'increase-food';

export interface GuidedPromptDefinition {
	id: GuidedPromptId;
	stepNumber: 1 | 2 | 3;
	title: string;
	instruction: string;
	actionLabel: string;
}

export type InterventionKind =
	| 'food-pulse'
	| 'predator-removal'
	| 'hunting-efficiency'
	| 'sustained-food'
	| 'restore-conditions';

export interface InterventionSpec {
	kind: InterventionKind;
	/** Model time t at which the intervention starts */
	time: number;
	/** For food-pulse: duration in model-time units (default 10) */
	duration?: number;
	/** For food-pulse: multiplier on carrying capacity K (default 1.5 for +50%) */
	kMultiplier?: number;
	/** For predator-removal: fraction removed (default 0.25 for -25%) */
	removalFraction?: number;
	/** For hunting-efficiency or sustained-food or restore-conditions: target parameter values */
	targetK?: number;
	targetA?: number;
	/** Earlier parameters stored so Restore earlier conditions can restore them */
	previousK?: number;
	previousA?: number;
}

export interface TrajectorySample {
	/** Model time t */
	time: number;
	/** Prey population density N(t) */
	prey: number;
	/** Predator population density P(t) */
	predator: number;
	/** Instantaneous prey rate of change dN/dt */
	dPreyDt: number;
	/** Instantaneous predator rate of change dP/dt */
	dPredatorDt: number;
	/** Active carrying capacity K(t) at this sample */
	activeK: number;
	/** Active hunting efficiency a(t) at this sample */
	activeA: number;
	/** Segment index (increments across discontinuous jumps) */
	segmentIndex: number;
}

export interface DiscontinuousJumpMarker {
	time: number;
	label: string;
	fromPrey: number;
	fromPredator: number;
	toPrey: number;
	toPredator: number;
}

export interface TimelineEventMarker {
	id: string;
	time: number;
	endTime?: number;
	kind: InterventionKind | 'pulse-end';
	label: string;
	shortLabel: string;
	preyAtEvent: number;
	predatorAtEvent: number;
	/** For predator removal, records pre-jump and post-jump predator values */
	jump?: DiscontinuousJumpMarker;
}

export interface PeakExtremum {
	time: number;
	value: number;
	prey: number;
	predator: number;
	sampleIndex: number;
}

export interface MeasuredPeakLag {
	preyPeak: PeakExtremum;
	predatorPeak: PeakExtremum;
	/** Predator peak time minus prey peak time (model-time units) */
	lagTime: number;
	caption: string;
}

export type AnalyticalStabilityRegime =
	| 'prey-only'
	| 'stable-node'
	| 'stable-spiral'
	| 'hopf-neutral'
	| 'unstable-spiral-cycle'
	| 'unstable-node-cycle';

export type ComparisonBehaviourClass = 'settles' | 'still-settling' | 'persistent-cycle';

export interface EquilibriumAnalysis {
	/** Critical carrying capacity K_crit = (e + m*h) / (a*h*(e - m*h)) where Hopf bifurcation occurs */
	kCritical: number;
	/** Coexistence prey density N* = m / (a*(e - m*h)) */
	equilibriumPrey: number;
	/** Coexistence predator density P* = (r/a) * (1 - N* / K) * (1 + a*h*N*) */
	equilibriumPredator: number;
	/** Whether coexistence equilibrium lies in the positive quadrant (N* > 0 and P* > 0) */
	coexistencePositive: boolean;
	/** Trace of Jacobian at (N*, P*) */
	jacobianTrace: number;
	/** Determinant of Jacobian at (N*, P*) */
	jacobianDeterminant: number;
	/** Real part of dominant eigenvalue at (N*, P*) */
	eigenvalueReal: number;
	/** Imaginary magnitude of eigenvalues at (N*, P*) */
	eigenvalueImag: number;
	/** Whether the coexistence point is locally asymptotically stable (tr(J) < 0 and det(J) > 0) */
	isEquilibriumStable: boolean;
	/** Distance K - K_crit */
	enrichmentMargin: number;
	regime: AnalyticalStabilityRegime;
}

export interface SimulationRunResult {
	parameters: LoomParameters;
	initialState: LoomInitialState;
	duration: number;
	dt: number;
	samples: TrajectorySample[];
	/** Continuous polyline segments (split only at discontinuous jumps like predator removal) */
	segments: TrajectorySample[][];
	/** Optional faint "Without this change" comparison trajectory starting immediately before the active intervention */
	baselineComparisonSamples: TrajectorySample[] | null;
	baselineStartTime: number | null;
	eventMarkers: TimelineEventMarker[];
	jumpMarkers: DiscontinuousJumpMarker[];
	/** All local maxima of prey N(t) */
	preyPeaks: PeakExtremum[];
	/** All local maxima of predators P(t) */
	predatorPeaks: PeakExtremum[];
	/** Highlighted prey peak and following predator peak with measured lag */
	measuredLag: MeasuredPeakLag | null;
	/** Minimum and maximum values over the run */
	minPrey: number;
	maxPrey: number;
	minPredator: number;
	maxPredator: number;
	/** Minimum prey in the second half of the run (to measure trough depth) */
	lateMinPrey: number;
	lateMaxPrey: number;
	lateMinPredator: number;
	lateMaxPredator: number;
	analysis: EquilibriumAnalysis;
	behaviourClass: ComparisonBehaviourClass;
	/** Dynamic explanation chosen from the actual computed trajectory */
	computedHeadline: string;
	computedDetail: string;
	recoverySentence: string;
	/** Numerical verification status: true when finite and strictly positive throughout */
	numericalValid: boolean;
	numericalError: string | null;
}

export interface ComparisonCellResult {
	rowIndex: number;
	colIndex: number;
	a: number;
	K: number;
	run: SimulationRunResult;
	behaviourClass: ComparisonBehaviourClass;
	badgeLabel: string;
	stabilityNote: string;
}
