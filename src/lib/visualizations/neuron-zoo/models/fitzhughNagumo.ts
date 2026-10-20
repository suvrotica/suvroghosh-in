import { upwardCrossingTime } from '../solvers/threshold';
import type {
	FitzHughNagumoParameters,
	FitzHughNagumoState,
	ModelDefinition,
	SpikeEvent,
	StepContext
} from '../types';

export const DEFAULT_FITZHUGH_NAGUMO_PARAMETERS: Readonly<FitzHughNagumoParameters> = Object.freeze(
	{
		a: 0.7,
		b: 0.8,
		epsilon: 0.08,
		timeScaleMs: 12.5,
		eventThreshold: 1
	}
);

export const DEFAULT_FHN_EQUILIBRIUM = Object.freeze({
	fast: -1.199_408_035_244_035,
	recovery: -0.624_260_044_055_044
});

export function validateFitzHughNagumoParameters(parameters: FitzHughNagumoParameters): string[] {
	const warnings: string[] = [];
	if (!Number.isFinite(parameters.a) || parameters.a < -2 || parameters.a > 2) {
		warnings.push('FitzHugh–Nagumo a must be within [-2, 2].');
	}
	if (!Number.isFinite(parameters.b) || parameters.b < 0.1 || parameters.b > 2) {
		warnings.push('FitzHugh–Nagumo b must be within [0.1, 2].');
	}
	if (
		!Number.isFinite(parameters.epsilon) ||
		parameters.epsilon < 0.001 ||
		parameters.epsilon > 1
	) {
		warnings.push('FitzHugh–Nagumo epsilon must be within [0.001, 1].');
	}
	if (
		!Number.isFinite(parameters.timeScaleMs) ||
		parameters.timeScaleMs < 1 ||
		parameters.timeScaleMs > 100
	) {
		warnings.push('FitzHugh–Nagumo time scale must be within [1, 100] ms.');
	}
	if (
		!Number.isFinite(parameters.eventThreshold) ||
		parameters.eventThreshold < -2 ||
		parameters.eventThreshold > 2
	) {
		warnings.push('FitzHugh–Nagumo event threshold must be within [-2, 2].');
	}
	return warnings;
}

export function fitzhughNagumoEquilibrium(
	parameters: FitzHughNagumoParameters = DEFAULT_FITZHUGH_NAGUMO_PARAMETERS
): { fast: number; recovery: number } {
	const errors = validateFitzHughNagumoParameters(parameters);
	if (errors.length) throw new RangeError(errors.join(' '));
	const residual = (value: number) =>
		value - (value * value * value) / 3 - (value + parameters.a) / parameters.b;
	// Unconstrained Newton iteration can cycle or escape to huge values for
	// admitted a/b pairs. Bracket an outer root of the cubic instead. Where
	// multiple roots exist, retain the negative resting branch when available.
	const turningPoint = Math.sqrt(Math.max(0, 1 - 1 / parameters.b));
	let lower = -4;
	let upper = parameters.b > 1 ? -turningPoint : 4;
	if (residual(upper) > 0) {
		lower = turningPoint;
		upper = 4;
	}
	for (let iteration = 0; iteration < 96; iteration += 1) {
		const middle = (lower + upper) / 2;
		if (residual(middle) > 0) lower = middle;
		else upper = middle;
	}
	const fast = (lower + upper) / 2;
	return { fast, recovery: (fast + parameters.a) / parameters.b };
}

export function createFitzHughNagumoState(
	parameters: FitzHughNagumoParameters = DEFAULT_FITZHUGH_NAGUMO_PARAMETERS
): FitzHughNagumoState {
	const equilibrium = fitzhughNagumoEquilibrium(parameters);
	return {
		modelId: 'fitzhugh-nagumo',
		fast: equilibrium.fast,
		recovery: equilibrium.recovery
	};
}

export function fitzhughNagumoDerivatives(
	fast: number,
	recovery: number,
	input: number,
	parameters: FitzHughNagumoParameters = DEFAULT_FITZHUGH_NAGUMO_PARAMETERS
): readonly [number, number] {
	return [
		(fast - (fast * fast * fast) / 3 - recovery + input) / parameters.timeScaleMs,
		(parameters.epsilon * (fast + parameters.a - parameters.b * recovery)) / parameters.timeScaleMs
	];
}

export function fitzhughNagumoVNullcline(fast: number, input: number): number {
	return fast - (fast * fast * fast) / 3 + input;
}

export function fitzhughNagumoWNullcline(
	fast: number,
	parameters: FitzHughNagumoParameters = DEFAULT_FITZHUGH_NAGUMO_PARAMETERS
): number {
	return (fast + parameters.a) / parameters.b;
}

export interface FitzHughNagumoStep {
	state: FitzHughNagumoState;
	event: SpikeEvent | null;
}

export function stepFitzHughNagumo(
	state: FitzHughNagumoState,
	context: StepContext,
	parameters: FitzHughNagumoParameters = DEFAULT_FITZHUGH_NAGUMO_PARAMETERS
): FitzHughNagumoStep {
	const { fast: v, recovery: w } = state;
	const dt = context.dtMs;
	const input = context.nativeInput;
	const [k1v, k1w] = fitzhughNagumoDerivatives(v, w, input, parameters);
	const [k2v, k2w] = fitzhughNagumoDerivatives(
		v + (dt * k1v) / 2,
		w + (dt * k1w) / 2,
		input,
		parameters
	);
	const [k3v, k3w] = fitzhughNagumoDerivatives(
		v + (dt * k2v) / 2,
		w + (dt * k2w) / 2,
		input,
		parameters
	);
	const [k4v, k4w] = fitzhughNagumoDerivatives(v + dt * k3v, w + dt * k3w, input, parameters);
	const nextV = v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
	const nextW = w + (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
	if (!Number.isFinite(nextV) || !Number.isFinite(nextW)) {
		throw new RangeError('FitzHugh–Nagumo model produced a non-finite state.');
	}
	const crossing = upwardCrossingTime(v, nextV, parameters.eventThreshold, context.tMs, dt);
	return {
		state: { modelId: 'fitzhugh-nagumo', fast: nextV, recovery: nextW },
		event:
			crossing === null
				? null
				: {
						modelId: 'fitzhugh-nagumo',
						timeMs: crossing,
						stepIndex: context.stepIndex,
						kind: 'phase-crossing'
					}
	};
}

export const FITZHUGH_NAGUMO_DEFINITION: Readonly<ModelDefinition<FitzHughNagumoParameters>> =
	Object.freeze({
		id: 'fitzhugh-nagumo',
		defaultParameters: DEFAULT_FITZHUGH_NAGUMO_PARAMETERS,
		capabilities: Object.freeze({
			physicalVoltage: false,
			continuousState: true,
			explicitLeak: false,
			explicitReset: false,
			explicitRefractory: false,
			recoveryVariable: true,
			ionGates: false,
			ionicCurrents: false,
			biologicalEnergyEstimate: false
		}),
		display: Object.freeze({
			name: 'FitzHugh–Nagumo',
			abbreviation: 'FHN',
			year: '1961–1962',
			modelClass: 'Two-variable excitable phase-plane model',
			stateVariables: Object.freeze(['v', 'w']),
			inputUnits: 'dimensionless drive',
			primaryOutput: 'fast activation-like variable v',
			primaryUnits: 'dimensionless',
			keeps: 'excitability, recovery, oscillation, phase geometry',
			throwsAway: 'physical channels, conductances, and ion accounting',
			equationPlainText: Object.freeze([
				'dv/dt = (v - v^3/3 - w + I(t)) / T_FHN',
				'dw/dt = epsilon (v + a - bw) / T_FHN'
			])
		}),
		stateVariableCount: 2,
		derivativeEvaluationsPerStep: 4,
		validateParameters: validateFitzHughNagumoParameters
	});
