import type {
	InitialModelState,
	InterventionId,
	ModelParameterKey,
	ModelParameters,
	ParameterDefinition,
	ScenarioId
} from './types';

export const MODEL_ID = 'weather-inside-nucleus-1.0.0' as const;
export const MODEL_VERSION = MODEL_ID;
export const MODEL_SEMANTIC_VERSION = '1.0.0' as const;
export const DEFAULT_SEED = 1_337;
export const ENSEMBLE_SIZE = 48;

// These are model seeds, not presentation scripts. Their claimed outcomes are
// pinned by pure-model tests and must be recalibrated if MODEL_VERSION changes.
export const HIGH_CONTACT_SILENT_SEED = 3;
export const INTRO_BURST_SEED = 41;

export const PARAMETER_DEFINITIONS: Readonly<Record<ModelParameterKey, ParameterDefinition>> = {
	duration: {
		default: 60,
		minimum: 10,
		maximum: 120,
		unit: 'model min',
		description: 'Total illustrative model time simulated.'
	},
	timestep: {
		default: 0.025,
		minimum: 0.00625,
		maximum: 0.1,
		unit: 'model min',
		description: 'Fixed step used by the hybrid time-stepped stochastic simulation.'
	},
	sampleInterval: {
		default: 0.5,
		minimum: 0.1,
		maximum: 2,
		unit: 'model min',
		description: 'Interval between returned timeline samples; it does not alter scientific events.'
	},
	egfAmplitude: {
		default: 0.85,
		minimum: 0,
		maximum: 1,
		unit: 'normalized',
		description: 'Strength of the rectangular extracellular EGF exposure proxy.'
	},
	egfStart: {
		default: 2,
		minimum: 0,
		maximum: 120,
		unit: 'model min',
		description: 'Start of the rectangular EGF exposure pulse.'
	},
	egfDuration: {
		default: 18,
		minimum: 0,
		maximum: 120,
		unit: 'model min',
		description: 'Duration of the rectangular EGF exposure pulse.'
	},
	receptorBlockade: {
		default: 0,
		minimum: 0,
		maximum: 1,
		unit: 'normalized',
		description: 'Fractional blockade applied only to receptor activation.'
	},
	receptorActivationRate: {
		default: 0.42,
		minimum: 0,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Activation rate of the membrane-receptor activity proxy.'
	},
	receptorDeactivationRate: {
		default: 0.16,
		minimum: 0,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Relaxation rate of the membrane-receptor activity proxy.'
	},
	downstreamActivationRate: {
		default: 0.26,
		minimum: 0,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Activation rate of the lumped intracellular signaling proxy.'
	},
	downstreamDeactivationRate: {
		default: 0.1,
		minimum: 0,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Relaxation rate of the lumped intracellular signaling proxy.'
	},
	nuclearActivationRate: {
		default: 0.18,
		minimum: 0,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Activation rate of the lumped nuclear activity proxy.'
	},
	nuclearDeactivationRate: {
		default: 0.08,
		minimum: 0,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Relaxation rate of the lumped nuclear activity proxy.'
	},
	bindingAffinity: {
		default: 1,
		minimum: 0.01,
		maximum: 1,
		unit: 'normalized',
		description: 'Relative affinity of the one modeled enhancer motif.'
	},
	bindingHillCoefficient: {
		default: 3,
		minimum: 1,
		maximum: 8,
		unit: 'dimensionless',
		description: 'Hill coefficient used by the occupancy-propensity response.'
	},
	bindingHalfSaturation: {
		default: 0.25,
		minimum: 0.01,
		maximum: 1,
		unit: 'normalized',
		description: 'Half-saturation parameter of the occupancy-propensity response.'
	},
	occupancyRelaxationTime: {
		default: 2.5,
		minimum: 0.05,
		maximum: 30,
		unit: 'model min',
		description: 'Relaxation time of occupancy propensity toward its Hill response.'
	},
	geometryBias: {
		default: 0,
		minimum: 0,
		maximum: 1,
		unit: 'normalized',
		description:
			'Independent geometry bias that changes contact propensity, not commanded distance.'
	},
	geometryLogitBaseline: {
		default: -1.4,
		minimum: -8,
		maximum: 0,
		unit: 'dimensionless',
		description: 'Intercept of the logistic stationary near-state propensity.'
	},
	geometryLogitGain: {
		default: 2.2,
		minimum: 0,
		maximum: 6,
		unit: 'dimensionless',
		description: 'Effect of normalized geometry bias on the near-state log odds.'
	},
	contactSwitchingRate: {
		default: 0.28,
		minimum: 0.001,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Overall switching rate of the stochastic far/near contact process.'
	},
	licensingActivationRate: {
		default: 0.18,
		minimum: 0,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Rise rate of the abstract licensing state while contact is near.'
	},
	licensingDeactivationRate: {
		default: 0.12,
		minimum: 0,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Decay rate of the abstract licensing state while contact is far.'
	},
	licensingHillCoefficient: {
		default: 3,
		minimum: 1,
		maximum: 8,
		unit: 'dimensionless',
		description: 'Hill coefficient converting licensing state into regulatory memory.'
	},
	licensingHalfSaturation: {
		default: 0.45,
		minimum: 0.01,
		maximum: 1,
		unit: 'normalized',
		description: 'Half-saturation of the regulatory-memory response.'
	},
	basalPromoterActivationRate: {
		default: 0.0015,
		minimum: 0,
		maximum: 0.2,
		unit: 'model min^-1',
		description: 'Occupancy- and contact-independent promoter activation hazard.'
	},
	occupancyPromoterActivationRate: {
		default: 0.01,
		minimum: 0,
		maximum: 0.5,
		unit: 'model min^-1',
		description: 'Additional promoter activation hazard supplied by occupancy propensity.'
	},
	contactPromoterActivationRate: {
		default: 0.06,
		minimum: 0,
		maximum: 0.5,
		unit: 'model min^-1',
		description: 'Additional activation hazard supplied jointly by occupancy and licensing.'
	},
	promoterDeactivationRate: {
		default: 0.18,
		minimum: 0.001,
		maximum: 2,
		unit: 'model min^-1',
		description: 'Fixed OFF-switching hazard; it controls modeled burst duration.'
	},
	transcriptionInitiationRate: {
		default: 0.65,
		minimum: 0,
		maximum: 5,
		unit: 'model min^-1',
		description: 'Fixed Poisson initiation rate while the promoter is ON.'
	},
	rnaDegradationRate: {
		default: 0.04,
		minimum: 0,
		maximum: 1,
		unit: 'model min^-1',
		description: 'First-order degradation hazard for modeled completed RNA counts.'
	}
};

export const MODEL_DEFINITION = Object.freeze({
	version: MODEL_VERSION,
	method: 'hybrid time-stepped stochastic simulation' as const,
	parameters: PARAMETER_DEFINITIONS
});

export const DEFAULT_MODEL_PARAMETERS: Readonly<ModelParameters> = Object.freeze(
	Object.fromEntries(
		Object.entries(PARAMETER_DEFINITIONS).map(([key, definition]) => [key, definition.default])
	) as unknown as ModelParameters
);

export const DEFAULT_INITIAL_STATE: Readonly<InitialModelState> = Object.freeze({
	receptorActivity: 0,
	downstreamActivity: 0,
	nuclearActivity: 0,
	occupancy: 0,
	licensing: 0,
	promoterState: 0,
	rnaCount: 0
});

export function createModelParameters(
	overrides: Partial<ModelParameters> = {}
): Readonly<ModelParameters> {
	const parameters = { ...DEFAULT_MODEL_PARAMETERS, ...overrides };
	validateModelParameters(parameters);
	return Object.freeze(parameters);
}

export function validateModelParameters(parameters: Readonly<ModelParameters>): void {
	for (const key of Object.keys(PARAMETER_DEFINITIONS) as ModelParameterKey[]) {
		const value = parameters[key];
		const definition = PARAMETER_DEFINITIONS[key];
		if (!Number.isFinite(value) || value < definition.minimum || value > definition.maximum) {
			throw new RangeError(
				`${key} must be finite and within [${definition.minimum}, ${definition.maximum}].`
			);
		}
	}
	const steps = parameters.duration / parameters.timestep;
	const sampleSteps = parameters.sampleInterval / parameters.timestep;
	const samples = parameters.duration / parameters.sampleInterval;
	if (!nearlyInteger(steps) || !nearlyInteger(sampleSteps) || !nearlyInteger(samples)) {
		throw new RangeError(
			'duration and sampleInterval must be exact integer multiples of timestep, and duration must be an integer multiple of sampleInterval.'
		);
	}
	if (Math.round(steps) > 20_000) {
		throw new RangeError('The parameter combination exceeds the 20,000-step browser work budget.');
	}
	const maximumContactPropensity = contactPropensity(parameters.geometryBias, parameters);
	if (!(maximumContactPropensity > 0 && maximumContactPropensity < 1)) {
		throw new RangeError('Contact propensity must remain strictly between zero and one.');
	}
}

export function parametersForScenario(scenario: ScenarioId): Readonly<ModelParameters> {
	switch (scenario) {
		case 'baseline':
			return createModelParameters();
		case 'blocked':
			return createModelParameters({ receptorBlockade: 1 });
		case 'mutated':
			return createModelParameters({ bindingAffinity: 0.28 });
		case 'contact':
			return createModelParameters({ geometryBias: 1 });
	}
}

export function applyIntervention(
	parameters: Readonly<ModelParameters>,
	intervention: InterventionId
): Readonly<ModelParameters> {
	switch (intervention) {
		case 'release-signal':
			return createModelParameters({ ...parameters, egfAmplitude: 0.85 });
		case 'lengthen-signal':
			return createModelParameters({ ...parameters, egfDuration: 36 });
		case 'block-receptor':
			return createModelParameters({ ...parameters, receptorBlockade: 1 });
		case 'weaken-binding-site':
			return createModelParameters({ ...parameters, bindingAffinity: 0.28 });
		case 'raise-contact-propensity':
			return createModelParameters({ ...parameters, geometryBias: 1 });
		case 'lower-contact-propensity':
			return createModelParameters({ ...parameters, geometryBias: 0 });
	}
}

export function signalInput(time: number, parameters: Readonly<ModelParameters>): number {
	return time >= parameters.egfStart && time < parameters.egfStart + parameters.egfDuration
		? parameters.egfAmplitude
		: 0;
}

export function contactPropensity(
	geometryBias: number,
	parameters: Pick<ModelParameters, 'geometryLogitBaseline' | 'geometryLogitGain'>
): number {
	const logit = parameters.geometryLogitBaseline + parameters.geometryLogitGain * geometryBias;
	return 1 / (1 + Math.exp(-logit));
}

function nearlyInteger(value: number): boolean {
	return Number.isFinite(value) && Math.abs(value - Math.round(value)) <= 1e-9;
}
