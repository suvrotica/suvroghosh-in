import { upwardCrossingTime } from '../solvers/threshold';
import type {
	HodgkinHuxleyParameters,
	HodgkinHuxleyState,
	ModelDefinition,
	SpikeEvent,
	StepContext
} from '../types';

export const DEFAULT_HODGKIN_HUXLEY_PARAMETERS: Readonly<HodgkinHuxleyParameters> = Object.freeze({
	capacitanceUfPerCm2: 1,
	sodiumConductanceMsPerCm2: 120,
	potassiumConductanceMsPerCm2: 36,
	leakConductanceMsPerCm2: 0.3,
	sodiumReversalMv: 50,
	potassiumReversalMv: -77,
	leakReversalMv: -54.387,
	initialVoltageMv: -65,
	spikeThresholdMv: 0
});

const GATE_ROUNDOFF_EPSILON = 1e-12;

export function validateHodgkinHuxleyParameters(parameters: HodgkinHuxleyParameters): string[] {
	const warnings: string[] = [];
	for (const [label, value, minimum, maximum] of [
		['capacitance', parameters.capacitanceUfPerCm2, 0.1, 5],
		['sodium conductance', parameters.sodiumConductanceMsPerCm2, 1, 300],
		['potassium conductance', parameters.potassiumConductanceMsPerCm2, 1, 150],
		['leak conductance', parameters.leakConductanceMsPerCm2, 0.01, 5]
	] as const) {
		if (!Number.isFinite(value) || value < minimum || value > maximum) {
			warnings.push(`Hodgkin–Huxley ${label} must be within [${minimum}, ${maximum}].`);
		}
	}
	for (const [label, value] of [
		['sodium reversal', parameters.sodiumReversalMv],
		['potassium reversal', parameters.potassiumReversalMv],
		['leak reversal', parameters.leakReversalMv],
		['initial', parameters.initialVoltageMv],
		['spike threshold', parameters.spikeThresholdMv]
	] as const) {
		if (!Number.isFinite(value) || value < -150 || value > 100) {
			warnings.push(`Hodgkin–Huxley ${label} voltage must be within [-150, 100] mV.`);
		}
	}
	return warnings;
}

/**
 * Stable x/(1-exp(-x/k)), including the analytic limit k at x=0.
 */
export function vtrap(x: number, k: number): number {
	if (!Number.isFinite(x) || !Number.isFinite(k) || k === 0) {
		throw new RangeError('vtrap arguments must be finite and k must be nonzero.');
	}
	const scaled = x / k;
	if (Math.abs(scaled) < 1e-7) {
		const squared = scaled * scaled;
		return k * (1 + scaled / 2 + squared / 12 - (squared * squared) / 720);
	}
	return x / -Math.expm1(-scaled);
}

export interface HodgkinHuxleyRates {
	alphaM: number;
	betaM: number;
	alphaH: number;
	betaH: number;
	alphaN: number;
	betaN: number;
}

export function hodgkinHuxleyRates(voltageMv: number): HodgkinHuxleyRates {
	return {
		alphaM: 0.1 * vtrap(voltageMv + 40, 10),
		betaM: 4 * Math.exp(-(voltageMv + 65) / 18),
		alphaH: 0.07 * Math.exp(-(voltageMv + 65) / 20),
		betaH: 1 / (1 + Math.exp(-(voltageMv + 35) / 10)),
		alphaN: 0.01 * vtrap(voltageMv + 55, 10),
		betaN: 0.125 * Math.exp(-(voltageMv + 65) / 80)
	};
}

export function gateSteadyState(alpha: number, beta: number): number {
	return alpha / (alpha + beta);
}

export function hodgkinHuxleySteadyGates(voltageMv: number): {
	m: number;
	h: number;
	n: number;
} {
	const rates = hodgkinHuxleyRates(voltageMv);
	return {
		m: gateSteadyState(rates.alphaM, rates.betaM),
		h: gateSteadyState(rates.alphaH, rates.betaH),
		n: gateSteadyState(rates.alphaN, rates.betaN)
	};
}

export function createHodgkinHuxleyState(
	parameters: HodgkinHuxleyParameters = DEFAULT_HODGKIN_HUXLEY_PARAMETERS
): HodgkinHuxleyState {
	const gates = hodgkinHuxleySteadyGates(parameters.initialVoltageMv);
	return {
		modelId: 'hodgkin-huxley',
		voltageMv: parameters.initialVoltageMv,
		...gates
	};
}

export interface HodgkinHuxleyCurrents {
	sodiumUaPerCm2: number;
	potassiumUaPerCm2: number;
	leakUaPerCm2: number;
	sodiumConductanceMsPerCm2: number;
	potassiumConductanceMsPerCm2: number;
}

export function hodgkinHuxleyCurrents(
	state: Pick<HodgkinHuxleyState, 'voltageMv' | 'm' | 'h' | 'n'>,
	parameters: HodgkinHuxleyParameters = DEFAULT_HODGKIN_HUXLEY_PARAMETERS
): HodgkinHuxleyCurrents {
	const sodiumConductanceMsPerCm2 =
		parameters.sodiumConductanceMsPerCm2 * state.m * state.m * state.m * state.h;
	const potassiumConductanceMsPerCm2 =
		parameters.potassiumConductanceMsPerCm2 * state.n * state.n * state.n * state.n;
	return {
		sodiumUaPerCm2: sodiumConductanceMsPerCm2 * (state.voltageMv - parameters.sodiumReversalMv),
		potassiumUaPerCm2:
			potassiumConductanceMsPerCm2 * (state.voltageMv - parameters.potassiumReversalMv),
		leakUaPerCm2:
			parameters.leakConductanceMsPerCm2 * (state.voltageMv - parameters.leakReversalMv),
		sodiumConductanceMsPerCm2,
		potassiumConductanceMsPerCm2
	};
}

export function hodgkinHuxleyDerivatives(
	state: Pick<HodgkinHuxleyState, 'voltageMv' | 'm' | 'h' | 'n'>,
	inputUaPerCm2: number,
	parameters: HodgkinHuxleyParameters = DEFAULT_HODGKIN_HUXLEY_PARAMETERS
): readonly [number, number, number, number] {
	const currents = hodgkinHuxleyCurrents(state, parameters);
	const rates = hodgkinHuxleyRates(state.voltageMv);
	return [
		(inputUaPerCm2 - currents.sodiumUaPerCm2 - currents.potassiumUaPerCm2 - currents.leakUaPerCm2) /
			parameters.capacitanceUfPerCm2,
		rates.alphaM * (1 - state.m) - rates.betaM * state.m,
		rates.alphaH * (1 - state.h) - rates.betaH * state.h,
		rates.alphaN * (1 - state.n) - rates.betaN * state.n
	];
}

function correctGateRoundoff(value: number, name: string): number {
	if (value >= 0 && value <= 1) return value;
	if (value < 0 && value >= -GATE_ROUNDOFF_EPSILON) return 0;
	if (value > 1 && value <= 1 + GATE_ROUNDOFF_EPSILON) return 1;
	throw new RangeError(`Hodgkin–Huxley gate ${name} left [0, 1]: ${value}.`);
}

export interface HodgkinHuxleyStep {
	state: HodgkinHuxleyState;
	event: SpikeEvent | null;
	currents: HodgkinHuxleyCurrents;
}

export function stepHodgkinHuxley(
	state: HodgkinHuxleyState,
	context: StepContext,
	parameters: HodgkinHuxleyParameters = DEFAULT_HODGKIN_HUXLEY_PARAMETERS
): HodgkinHuxleyStep {
	const dt = context.dtMs;
	const input = context.nativeInput;
	const derivative = (v: number, m: number, h: number, n: number) =>
		hodgkinHuxleyDerivatives({ voltageMv: v, m, h, n }, input, parameters);
	const [k1v, k1m, k1h, k1n] = derivative(state.voltageMv, state.m, state.h, state.n);
	const [k2v, k2m, k2h, k2n] = derivative(
		state.voltageMv + (dt * k1v) / 2,
		state.m + (dt * k1m) / 2,
		state.h + (dt * k1h) / 2,
		state.n + (dt * k1n) / 2
	);
	const [k3v, k3m, k3h, k3n] = derivative(
		state.voltageMv + (dt * k2v) / 2,
		state.m + (dt * k2m) / 2,
		state.h + (dt * k2h) / 2,
		state.n + (dt * k2n) / 2
	);
	const [k4v, k4m, k4h, k4n] = derivative(
		state.voltageMv + dt * k3v,
		state.m + dt * k3m,
		state.h + dt * k3h,
		state.n + dt * k3n
	);
	const nextState: HodgkinHuxleyState = {
		modelId: 'hodgkin-huxley',
		voltageMv: state.voltageMv + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v),
		m: correctGateRoundoff(state.m + (dt / 6) * (k1m + 2 * k2m + 2 * k3m + k4m), 'm'),
		h: correctGateRoundoff(state.h + (dt / 6) * (k1h + 2 * k2h + 2 * k3h + k4h), 'h'),
		n: correctGateRoundoff(state.n + (dt / 6) * (k1n + 2 * k2n + 2 * k3n + k4n), 'n')
	};
	if (!Number.isFinite(nextState.voltageMv)) {
		throw new RangeError('Hodgkin–Huxley model produced a non-finite voltage.');
	}
	const crossing = upwardCrossingTime(
		state.voltageMv,
		nextState.voltageMv,
		parameters.spikeThresholdMv,
		context.tMs,
		dt
	);
	return {
		state: nextState,
		event:
			crossing === null
				? null
				: {
						modelId: 'hodgkin-huxley',
						timeMs: crossing,
						stepIndex: context.stepIndex,
						kind: 'voltage-crossing'
					},
		currents: hodgkinHuxleyCurrents(nextState, parameters)
	};
}

export const HODGKIN_HUXLEY_DEFINITION: Readonly<ModelDefinition<HodgkinHuxleyParameters>> =
	Object.freeze({
		id: 'hodgkin-huxley',
		defaultParameters: DEFAULT_HODGKIN_HUXLEY_PARAMETERS,
		capabilities: Object.freeze({
			physicalVoltage: true,
			continuousState: true,
			explicitLeak: true,
			explicitReset: false,
			explicitRefractory: false,
			recoveryVariable: true,
			ionGates: true,
			ionicCurrents: true,
			biologicalEnergyEstimate: true
		}),
		display: Object.freeze({
			name: 'Hodgkin–Huxley',
			abbreviation: 'HH',
			year: '1952',
			modelClass: 'Conductance-based membrane model',
			stateVariables: Object.freeze(['V', 'm', 'h', 'n']),
			inputUnits: 'µA/cm²',
			primaryOutput: 'membrane voltage V',
			primaryUnits: 'mV',
			keeps: 'voltage-dependent channels, generated spike waveform, ion-current bookkeeping',
			throwsAway:
				'morphology, spatial propagation, channel noise, synapses, and most cellular metabolism',
			equationPlainText: Object.freeze([
				'C_m dV/dt = I_ext - I_Na - I_K - I_L',
				'I_Na = g_Na m^3 h (V-E_Na)',
				'I_K = g_K n^4 (V-E_K)',
				'I_L = g_L (V-E_L)',
				'dx/dt = alpha_x(V)(1-x) - beta_x(V)x for x in {m,h,n}'
			])
		}),
		stateVariableCount: 4,
		derivativeEvaluationsPerStep: 4,
		validateParameters: validateHodgkinHuxleyParameters
	});
