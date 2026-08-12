import { finiteGrowthFrequency, ornamentEnvelope, periodicGaussian } from './common';
import type { OrnamentContext, OrnamentSignal, VaricesConfiguration } from './types';

export function varixCycle(configuration: VaricesConfiguration, context: OrnamentContext): number {
	const frequency = finiteGrowthFrequency(
		configuration.countPerTurn,
		context.totalTurns,
		context.growthSamples
	);
	return (context.theta * frequency + configuration.phase) / (Math.PI * 2);
}

export function nearestVarixIndex(
	configuration: VaricesConfiguration,
	context: OrnamentContext
): number {
	return Math.round(varixCycle(configuration, context));
}

export function evaluateVarices(
	configuration: VaricesConfiguration,
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
	const normalized = periodicGaussian(varixCycle(configuration, context), configuration.width);
	return { normalized, displacement: envelope * configuration.amplitude * normalized };
}
