/** State order used throughout the laboratory: θ₁, ω₁, θ₂, ω₂. */
export interface PendulumState {
	theta1: number;
	omega1: number;
	theta2: number;
	omega2: number;
}

/** Ideal planar double-pendulum parameters in SI units. */
export interface PendulumParameters {
	m1: number;
	m2: number;
	l1: number;
	l2: number;
	g: number;
}

export interface BobPositions {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export type IntegratorKind = 'rk4' | 'euler';
export type PendulumMode =
	| 'lab'
	| 'shadow'
	| 'atlas'
	| 'phase-space'
	| 'lying-integrator'
	| 'choir';
export type PerturbationDimension = keyof PendulumState;

export type PendulumPresetId =
	| 'polite-oscillator'
	| 'classic-chaos'
	| 'over-the-top'
	| 'heavy-passenger'
	| 'moon-workshop'
	| 'knife-edge'
	| 'custom';

export interface AtlasBounds {
	theta1Min: number;
	theta1Max: number;
	theta2Min: number;
	theta2Max: number;
}

export interface AtlasConfiguration extends AtlasBounds {
	resolution: number;
	fixedOmega1: number;
	fixedOmega2: number;
	perturbationDimension: PerturbationDimension;
	perturbationMagnitude: number;
	divergenceThreshold: number;
	timeCap: number;
	timestep: number;
	selectedTheta1?: number;
	selectedTheta2?: number;
}

/** Reproducible, user-controlled setup. Runtime clocks and trails live elsewhere. */
export interface PendulumConfiguration {
	mode: PendulumMode;
	preset: PendulumPresetId;
	initialState: PendulumState;
	parameters: PendulumParameters;
	integrator: IntegratorKind;
	timestep: number;
	speed: number;
	trailLength: number;
	perturbationDimension: PerturbationDimension;
	perturbationMagnitude: number;
	atlas: AtlasConfiguration;
}

export type DoublePendulumConfig = PendulumConfiguration;

export interface StateIssue {
	path: string;
	message: string;
	value?: unknown;
}

export interface ConfigurationResult {
	configuration: PendulumConfiguration;
	issues: StateIssue[];
	unsupportedVersion: boolean;
}

export interface PoincareSection {
	angle: 'theta1' | 'theta2';
	value: number;
	direction: 'positive' | 'negative' | 'either';
}

export interface PoincareCrossing extends PendulumState {
	/** Fraction of the integration interval at which the crossing occurred. */
	fraction: number;
	direction: 'positive' | 'negative';
}

export interface LyapunovAccumulator {
	accumulatedLogGrowth: number;
	elapsedTime: number;
	renormalizations: number;
}

export interface LyapunovReading extends LyapunovAccumulator {
	estimate: number | null;
	eFoldingTime: number | null;
	status: 'not-enough-evidence' | 'non-positive' | 'available' | 'invalid';
}

export const PENDULUM_STATE_KEYS = [
	'theta1',
	'omega1',
	'theta2',
	'omega2'
] as const satisfies readonly (keyof PendulumState)[];

export function createState(theta1 = 0, omega1 = 0, theta2 = 0, omega2 = 0): PendulumState {
	return { theta1, omega1, theta2, omega2 };
}

export function cloneState(state: Readonly<PendulumState>): PendulumState {
	return {
		theta1: state.theta1,
		omega1: state.omega1,
		theta2: state.theta2,
		omega2: state.omega2
	};
}

export function copyStateInto(state: Readonly<PendulumState>, out: PendulumState): PendulumState {
	out.theta1 = state.theta1;
	out.omega1 = state.omega1;
	out.theta2 = state.theta2;
	out.omega2 = state.omega2;
	return out;
}

export function isFiniteState(state: Readonly<PendulumState>): boolean {
	return (
		Number.isFinite(state.theta1) &&
		Number.isFinite(state.omega1) &&
		Number.isFinite(state.theta2) &&
		Number.isFinite(state.omega2)
	);
}

export function assertFiniteState(state: Readonly<PendulumState>, label = 'Pendulum state'): void {
	if (!isFiniteState(state)) throw new RangeError(`${label} must contain only finite numbers.`);
}

export function isValidParameters(parameters: Readonly<PendulumParameters>): boolean {
	return (
		Number.isFinite(parameters.m1) &&
		parameters.m1 > 0 &&
		Number.isFinite(parameters.m2) &&
		parameters.m2 > 0 &&
		Number.isFinite(parameters.l1) &&
		parameters.l1 > 0 &&
		Number.isFinite(parameters.l2) &&
		parameters.l2 > 0 &&
		Number.isFinite(parameters.g) &&
		parameters.g > 0
	);
}

export function assertValidParameters(parameters: Readonly<PendulumParameters>): void {
	if (!isValidParameters(parameters)) {
		throw new RangeError('Masses, lengths, and gravity must be finite and strictly positive.');
	}
}
