import { ornamentEnvelope } from './common';
import type { NodulesConfiguration, OrnamentContext, OrnamentSignal } from './types';

export function evaluateNodules(
	configuration: NodulesConfiguration,
	context: OrnamentContext,
	ribSignal: number,
	cordSignal: number
): OrnamentSignal {
	const envelope = ornamentEnvelope(configuration.enabled, configuration.onset, context.age);
	if (envelope === 0 || configuration.amplitude === 0) {
		return { normalized: 0, displacement: 0 };
	}
	const interaction = Math.max(0, ribSignal) * Math.max(0, cordSignal);
	const normalized = Math.pow(interaction, configuration.interactionPower);
	return { normalized, displacement: envelope * configuration.amplitude * normalized };
}
