import type {
	McCullochPittsParameters,
	McCullochPittsState,
	ModelDefinition,
	SpikeEvent,
	StepContext
} from '../types';

export const DEFAULT_MCCULLOCH_PITTS_PARAMETERS: Readonly<McCullochPittsParameters> = Object.freeze(
	{
		bias: 0,
		threshold: 0.5
	}
);

export function validateMcCullochPittsParameters(parameters: McCullochPittsParameters): string[] {
	const warnings: string[] = [];
	if (!Number.isFinite(parameters.bias) || parameters.bias < -2 || parameters.bias > 2) {
		warnings.push('Bias must be finite and within [-2, 2].');
	}
	if (
		!Number.isFinite(parameters.threshold) ||
		parameters.threshold < -2 ||
		parameters.threshold > 2
	) {
		warnings.push('Threshold must be finite and within [-2, 2].');
	}
	return warnings;
}

export function createMcCullochPittsState(): McCullochPittsState {
	return { modelId: 'mcculloch-pitts', output: 0 };
}

export interface McCullochPittsStep {
	state: McCullochPittsState;
	event: SpikeEvent | null;
	thresholdDrive: number;
}

export function stepMcCullochPitts(
	state: McCullochPittsState,
	context: StepContext,
	parameters: McCullochPittsParameters = DEFAULT_MCCULLOCH_PITTS_PARAMETERS
): McCullochPittsStep {
	const thresholdDrive = context.nativeInput + parameters.bias;
	const output: 0 | 1 = thresholdDrive - parameters.threshold >= 0 ? 1 : 0;
	return {
		state: { modelId: 'mcculloch-pitts', output },
		event:
			state.output === 0 && output === 1
				? {
						modelId: 'mcculloch-pitts',
						timeMs: context.tMs + context.dtMs,
						stepIndex: context.stepIndex,
						kind: 'binary-rise'
					}
				: null,
		thresholdDrive
	};
}

export const MCCULLOCH_PITTS_DEFINITION: Readonly<ModelDefinition<McCullochPittsParameters>> =
	Object.freeze({
		id: 'mcculloch-pitts',
		defaultParameters: DEFAULT_MCCULLOCH_PITTS_PARAMETERS,
		capabilities: Object.freeze({
			physicalVoltage: false,
			continuousState: false,
			explicitLeak: false,
			explicitReset: false,
			explicitRefractory: false,
			recoveryVariable: false,
			ionGates: false,
			ionicCurrents: false,
			biologicalEnergyEstimate: false
		}),
		display: Object.freeze({
			name: 'McCulloch–Pitts',
			abbreviation: 'MP',
			year: '1943',
			modelClass: 'Binary threshold logic',
			stateVariables: Object.freeze(['y']),
			inputUnits: 'unitless threshold drive',
			primaryOutput: 'binary output y',
			primaryUnits: 'unitless (0 or 1)',
			keeps: 'threshold logic and all-or-none output',
			throwsAway: 'membrane, time-continuous recovery, channels, energetics',
			equationPlainText: Object.freeze([
				'y[k+1] = H(u[k] + b - theta)',
				'H(x) = 1 if x >= 0; otherwise 0'
			])
		}),
		stateVariableCount: 1,
		derivativeEvaluationsPerStep: 0,
		validateParameters: validateMcCullochPittsParameters
	});
