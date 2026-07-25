import { upwardCrossingTime } from '../solvers/threshold';
import type {
	IzhikevichParameters,
	IzhikevichPhenotypeId,
	IzhikevichState,
	ModelDefinition,
	SpikeEvent,
	StepContext
} from '../types';

export const IZHIKEVICH_PHENOTYPES: Readonly<
	Record<IzhikevichPhenotypeId, Readonly<IzhikevichParameters>>
> = Object.freeze({
	'regular-spiking': Object.freeze({ a: 0.02, b: 0.2, c: -65, d: 8, cutoffMv: 30 }),
	'intrinsically-bursting': Object.freeze({ a: 0.02, b: 0.2, c: -55, d: 4, cutoffMv: 30 }),
	chattering: Object.freeze({ a: 0.02, b: 0.2, c: -50, d: 2, cutoffMv: 30 }),
	'fast-spiking': Object.freeze({ a: 0.1, b: 0.2, c: -65, d: 2, cutoffMv: 30 }),
	'low-threshold-spiking': Object.freeze({ a: 0.02, b: 0.25, c: -65, d: 2, cutoffMv: 30 })
});

export const DEFAULT_IZHIKEVICH_PARAMETERS = IZHIKEVICH_PHENOTYPES['regular-spiking'];

export function validateIzhikevichParameters(parameters: IzhikevichParameters): string[] {
	const warnings: string[] = [];
	if (!Number.isFinite(parameters.a) || parameters.a <= 0 || parameters.a > 0.2) {
		warnings.push('Izhikevich a must be within (0, 0.2].');
	}
	if (!Number.isFinite(parameters.b) || parameters.b < 0 || parameters.b > 0.5) {
		warnings.push('Izhikevich b must be within [0, 0.5].');
	}
	if (!Number.isFinite(parameters.c) || parameters.c < -100 || parameters.c > -20) {
		warnings.push('Izhikevich reset c must be within [-100, -20].');
	}
	if (!Number.isFinite(parameters.d) || parameters.d < 0 || parameters.d > 30) {
		warnings.push('Izhikevich recovery increment d must be within [0, 30].');
	}
	if (
		!Number.isFinite(parameters.cutoffMv) ||
		parameters.cutoffMv < 0 ||
		parameters.cutoffMv > 50
	) {
		warnings.push('Izhikevich cutoff must be within [0, 50] mV.');
	}
	return warnings;
}

export function createIzhikevichState(
	parameters: IzhikevichParameters = DEFAULT_IZHIKEVICH_PARAMETERS
): IzhikevichState {
	const voltageMv = -65;
	return { modelId: 'izhikevich', voltageMv, recovery: parameters.b * voltageMv };
}

export function izhikevichDerivatives(
	voltageMv: number,
	recovery: number,
	input: number,
	parameters: IzhikevichParameters = DEFAULT_IZHIKEVICH_PARAMETERS
): readonly [number, number] {
	return [
		0.04 * voltageMv * voltageMv + 5 * voltageMv + 140 - recovery + input,
		parameters.a * (parameters.b * voltageMv - recovery)
	];
}

export interface IzhikevichStep {
	state: IzhikevichState;
	event: SpikeEvent | null;
}

export function stepIzhikevich(
	state: IzhikevichState,
	context: StepContext,
	parameters: IzhikevichParameters = DEFAULT_IZHIKEVICH_PARAMETERS
): IzhikevichStep {
	const { voltageMv: v, recovery: u } = state;
	const dt = context.dtMs;
	const input = context.nativeInput;
	const [k1v, k1u] = izhikevichDerivatives(v, u, input, parameters);
	const [k2v, k2u] = izhikevichDerivatives(
		v + (dt * k1v) / 2,
		u + (dt * k1u) / 2,
		input,
		parameters
	);
	const [k3v, k3u] = izhikevichDerivatives(
		v + (dt * k2v) / 2,
		u + (dt * k2u) / 2,
		input,
		parameters
	);
	const [k4v, k4u] = izhikevichDerivatives(v + dt * k3v, u + dt * k3u, input, parameters);
	const tentativeV = v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
	const tentativeU = u + (dt / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
	if (!Number.isFinite(tentativeV) || !Number.isFinite(tentativeU)) {
		throw new RangeError('Izhikevich model produced a non-finite state.');
	}

	if (tentativeV < parameters.cutoffMv) {
		return {
			state: { modelId: 'izhikevich', voltageMv: tentativeV, recovery: tentativeU },
			event: null
		};
	}
	return {
		state: {
			modelId: 'izhikevich',
			voltageMv: parameters.c,
			recovery: tentativeU + parameters.d
		},
		event: {
			modelId: 'izhikevich',
			timeMs:
				upwardCrossingTime(v, tentativeV, parameters.cutoffMv, context.tMs, dt) ?? context.tMs + dt,
			stepIndex: context.stepIndex,
			kind: 'threshold-reset'
		}
	};
}

export const IZHIKEVICH_DEFINITION: Readonly<ModelDefinition<IzhikevichParameters>> = Object.freeze(
	{
		id: 'izhikevich',
		defaultParameters: DEFAULT_IZHIKEVICH_PARAMETERS,
		capabilities: Object.freeze({
			physicalVoltage: false,
			continuousState: true,
			explicitLeak: false,
			explicitReset: true,
			explicitRefractory: false,
			recoveryVariable: true,
			ionGates: false,
			ionicCurrents: false,
			biologicalEnergyEstimate: false
		}),
		display: Object.freeze({
			name: 'Izhikevich',
			abbreviation: 'IZH',
			year: '2003',
			modelClass: 'Two-variable hybrid spiking model',
			stateVariables: Object.freeze(['v', 'u']),
			inputUnits: 'model input units',
			primaryOutput: 'phenomenological voltage-like variable v',
			primaryUnits: 'conventionally mV',
			keeps: 'spike timing, adaptation, bursting repertoire',
			throwsAway: 'explicit ion channels and physical current accounting',
			equationPlainText: Object.freeze([
				'dv/dt = 0.04v^2 + 5v + 140 - u + I(t)',
				'du/dt = a(bv-u)',
				'if v >= 30 mV: v = c; u = u + d'
			])
		}),
		stateVariableCount: 2,
		derivativeEvaluationsPerStep: 4,
		validateParameters: validateIzhikevichParameters
	}
);
