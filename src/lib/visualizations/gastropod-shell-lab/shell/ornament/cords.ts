import { finiteBandLimit, ornamentEnvelope, sharpenedCosine } from './common';
import type { CordsConfiguration, OrnamentContext, OrnamentSignal } from './types';

export function evaluateCords(
	configuration: CordsConfiguration,
	context: OrnamentContext
): OrnamentSignal {
	const envelope = ornamentEnvelope(configuration.enabled, configuration.onset, context.age);
	const count = finiteBandLimit(configuration.count, context.apertureSamples);
	if (envelope === 0 || configuration.amplitude === 0 || count === 0) {
		return { normalized: 0, displacement: 0 };
	}
	const normalized = sharpenedCosine(
		count * context.u + configuration.phase,
		configuration.sharpness
	);
	return { normalized, displacement: envelope * configuration.amplitude * normalized };
}
