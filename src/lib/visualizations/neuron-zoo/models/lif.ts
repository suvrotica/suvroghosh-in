import { exponentialThresholdCrossingTime } from '../solvers/threshold';
import type { LifParameters, LifState, ModelDefinition, SpikeEvent, StepContext } from '../types';

export const DEFAULT_LIF_PARAMETERS: Readonly<LifParameters> = Object.freeze({
	capacitancePf: 200,
	leakConductanceNs: 10,
	leakReversalMv: -65,
	thresholdMv: -50,
	resetMv: -65,
	refractoryMs: 2
});

export function validateLifParameters(parameters: LifParameters): string[] {
	const warnings: string[] = [];
	if (
		!Number.isFinite(parameters.capacitancePf) ||
		parameters.capacitancePf < 10 ||
		parameters.capacitancePf > 1_000
	) {
		warnings.push('LIF capacitance must be within [10, 1000] pF.');
	}
	if (
		!Number.isFinite(parameters.leakConductanceNs) ||
		parameters.leakConductanceNs < 0.1 ||
		parameters.leakConductanceNs > 100
	) {
		warnings.push('LIF leak conductance must be within [0.1, 100] nS.');
	}
	for (const [label, value] of [
		['leak reversal', parameters.leakReversalMv],
		['threshold', parameters.thresholdMv],
		['reset', parameters.resetMv]
	] as const) {
		if (!Number.isFinite(value) || value < -120 || value > 50) {
			warnings.push(`LIF ${label} voltage must be within [-120, 50] mV.`);
		}
	}
	if (parameters.thresholdMv <= parameters.resetMv) {
		warnings.push('LIF threshold must be greater than reset voltage.');
	}
	if (
		!Number.isFinite(parameters.refractoryMs) ||
		parameters.refractoryMs < 0 ||
		parameters.refractoryMs > 20
	) {
		warnings.push('LIF refractory interval must be within [0, 20] ms.');
	}
	return warnings;
}

export function createLifState(parameters: LifParameters = DEFAULT_LIF_PARAMETERS): LifState {
	return {
		modelId: 'lif',
		voltageMv: parameters.leakReversalMv,
		refractoryRemainingMs: 0
	};
}

export function lifMembraneTimeConstantMs(parameters: LifParameters): number {
	// pF / nS = ms
	return parameters.capacitancePf / parameters.leakConductanceNs;
}

export function lifSubthresholdUpdate(
	voltageMv: number,
	inputPa: number,
	dtMs: number,
	parameters: LifParameters = DEFAULT_LIF_PARAMETERS
): number {
	const tauMs = lifMembraneTimeConstantMs(parameters);
	const decay = Math.exp(-dtMs / tauMs);
	return (
		parameters.leakReversalMv +
		(voltageMv - parameters.leakReversalMv) * decay +
		(inputPa / parameters.leakConductanceNs) * (1 - decay)
	);
}

export interface LifStep {
	state: LifState;
	event: SpikeEvent | null;
}

export function stepLif(
	state: LifState,
	context: StepContext,
	parameters: LifParameters = DEFAULT_LIF_PARAMETERS
): LifStep {
	let activeDtMs = context.dtMs;
	let activeStartMs = context.tMs;
	if (state.refractoryRemainingMs > 0) {
		if (state.refractoryRemainingMs >= context.dtMs - Number.EPSILON) {
			return {
				state: {
					modelId: 'lif',
					voltageMv: parameters.resetMv,
					refractoryRemainingMs: Math.max(0, state.refractoryRemainingMs - context.dtMs)
				},
				event: null
			};
		}
		activeDtMs -= state.refractoryRemainingMs;
		activeStartMs += state.refractoryRemainingMs;
	}

	const initialVoltage = state.refractoryRemainingMs > 0 ? parameters.resetMv : state.voltageMv;
	const nextVoltage = lifSubthresholdUpdate(
		initialVoltage,
		context.nativeInput,
		activeDtMs,
		parameters
	);
	if (!Number.isFinite(nextVoltage)) throw new RangeError('LIF produced a non-finite voltage.');
	if (nextVoltage < parameters.thresholdMv) {
		return {
			state: { modelId: 'lif', voltageMv: nextVoltage, refractoryRemainingMs: 0 },
			event: null
		};
	}

	const tauMs = lifMembraneTimeConstantMs(parameters);
	const asymptote = parameters.leakReversalMv + context.nativeInput / parameters.leakConductanceNs;
	const crossingAfterActiveStart =
		exponentialThresholdCrossingTime(
			initialVoltage,
			asymptote,
			parameters.thresholdMv,
			tauMs,
			activeDtMs
		) ?? activeDtMs;
	const elapsedAfterSpike = Math.max(0, activeDtMs - crossingAfterActiveStart);
	return {
		state: {
			modelId: 'lif',
			voltageMv: parameters.resetMv,
			refractoryRemainingMs: Math.max(0, parameters.refractoryMs - elapsedAfterSpike)
		},
		event: {
			modelId: 'lif',
			timeMs: activeStartMs + crossingAfterActiveStart,
			stepIndex: context.stepIndex,
			kind: 'threshold-reset'
		}
	};
}

export const LIF_DEFINITION: Readonly<ModelDefinition<LifParameters>> = Object.freeze({
	id: 'lif',
	defaultParameters: DEFAULT_LIF_PARAMETERS,
	capabilities: Object.freeze({
		physicalVoltage: true,
		continuousState: true,
		explicitLeak: true,
		explicitReset: true,
		explicitRefractory: true,
		recoveryVariable: false,
		ionGates: false,
		ionicCurrents: false,
		biologicalEnergyEstimate: false
	}),
	display: Object.freeze({
		name: 'Leaky integrate-and-fire',
		abbreviation: 'LIF',
		year: '1907 lineage',
		modelClass: 'Threshold-and-reset membrane model',
		stateVariables: Object.freeze(['V', 'refractory time remaining']),
		inputUnits: 'pA',
		primaryOutput: 'subthreshold membrane voltage V',
		primaryUnits: 'mV',
		keeps: 'passive membrane, leak, threshold timing',
		throwsAway: 'generated spike waveform, channels, physical ion energetics',
		equationPlainText: Object.freeze([
			'C_m dV/dt = -g_L (V - E_L) + I(t)',
			'V[k+1] = E_L + (V[k]-E_L) exp(-dt/tau_m) + I[k]/g_L (1-exp(-dt/tau_m))'
		])
	}),
	stateVariableCount: 2,
	derivativeEvaluationsPerStep: 0,
	validateParameters: validateLifParameters
});
