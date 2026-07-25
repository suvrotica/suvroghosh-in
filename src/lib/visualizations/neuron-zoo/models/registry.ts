import type { ModelDefinition, ModelId, ModelParametersById } from '../types';
import { FITZHUGH_NAGUMO_DEFINITION, DEFAULT_FITZHUGH_NAGUMO_PARAMETERS } from './fitzhughNagumo';
import { HODGKIN_HUXLEY_DEFINITION, DEFAULT_HODGKIN_HUXLEY_PARAMETERS } from './hodgkinHuxley';
import { IZHIKEVICH_DEFINITION, DEFAULT_IZHIKEVICH_PARAMETERS } from './izhikevich';
import { LIF_DEFINITION, DEFAULT_LIF_PARAMETERS } from './lif';
import { MCCULLOCH_PITTS_DEFINITION, DEFAULT_MCCULLOCH_PITTS_PARAMETERS } from './mccullochPitts';

export const MODEL_DEFINITIONS = Object.freeze({
	'mcculloch-pitts': MCCULLOCH_PITTS_DEFINITION,
	lif: LIF_DEFINITION,
	izhikevich: IZHIKEVICH_DEFINITION,
	'fitzhugh-nagumo': FITZHUGH_NAGUMO_DEFINITION,
	'hodgkin-huxley': HODGKIN_HUXLEY_DEFINITION
}) satisfies Readonly<{
	[Id in ModelId]: ModelDefinition<ModelParametersById[Id]>;
}>;

export const DEFAULT_MODEL_PARAMETERS: Readonly<ModelParametersById> = Object.freeze({
	'mcculloch-pitts': DEFAULT_MCCULLOCH_PITTS_PARAMETERS,
	lif: DEFAULT_LIF_PARAMETERS,
	izhikevich: DEFAULT_IZHIKEVICH_PARAMETERS,
	'fitzhugh-nagumo': DEFAULT_FITZHUGH_NAGUMO_PARAMETERS,
	'hodgkin-huxley': DEFAULT_HODGKIN_HUXLEY_PARAMETERS
});

export function getModelDefinition<Id extends ModelId>(
	modelId: Id
): (typeof MODEL_DEFINITIONS)[Id] {
	return MODEL_DEFINITIONS[modelId];
}

export function resolveModelParameters(
	overrides: Partial<ModelParametersById> = {}
): ModelParametersById {
	return {
		'mcculloch-pitts': {
			...DEFAULT_MCCULLOCH_PITTS_PARAMETERS,
			...overrides['mcculloch-pitts']
		},
		lif: { ...DEFAULT_LIF_PARAMETERS, ...overrides.lif },
		izhikevich: { ...DEFAULT_IZHIKEVICH_PARAMETERS, ...overrides.izhikevich },
		'fitzhugh-nagumo': {
			...DEFAULT_FITZHUGH_NAGUMO_PARAMETERS,
			...overrides['fitzhugh-nagumo']
		},
		'hodgkin-huxley': {
			...DEFAULT_HODGKIN_HUXLEY_PARAMETERS,
			...overrides['hodgkin-huxley']
		}
	};
}
