import { finiteGrowthFrequency, ornamentEnvelope, sharpenedCosine } from './common';
import type { OrnamentContext, OrnamentSignal, RibsConfiguration } from './types';

export function evaluateRibs(
	configuration: RibsConfiguration,
	context: OrnamentContext
): OrnamentSignal {
	const envelope = ornamentEnvelope(configuration.enabled, configuration.onset, context.age);
	const frequency = finiteGrowthFrequency(
		configuration.countPerTurn,
		context.totalTurns,
		context.growthSamples
	);
	if (envelope === 0 || configuration.amplitude === 0 || frequency === 0) {
		return { normalized: 0, displacement: 0 };
	}
	const normalized = sharpenedCosine(
		context.theta * frequency + configuration.phase,
		configuration.sharpness
	);
	return { normalized, displacement: envelope * configuration.amplitude * normalized };
}
