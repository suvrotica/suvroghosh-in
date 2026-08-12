import { ornamentEnvelope, finiteBandLimit, hashUnit } from './common';
import type { ImperfectionConfiguration, OrnamentContext, OrnamentSignal } from './types';

export function evaluateImperfection(
	configuration: ImperfectionConfiguration,
	context: OrnamentContext
): OrnamentSignal {
	const envelope = ornamentEnvelope(configuration.enabled, configuration.onset, context.age);
	const bandLimit = finiteBandLimit(configuration.bandLimit, context.apertureSamples);
	if (envelope === 0 || configuration.amplitude === 0 || bandLimit === 0) {
		return { normalized: 0, displacement: 0 };
	}
	let field = 0;
	let weight = 0;
	for (let band = 1; band <= bandLimit; band += 1) {
		const amplitude = (hashUnit(context.seed, band * 3) * 2 - 1) / band;
		const phase = hashUnit(context.seed, band * 3 + 1) * Math.PI * 2;
		const timing = (hashUnit(context.seed, band * 3 + 2) * 2 - 1) * configuration.timingJitter;
		field += amplitude * Math.cos(band * context.u + phase + timing * context.theta);
		weight += 1 / band;
	}
	const normalized = weight > 0 ? field / weight : 0;
	return { normalized, displacement: envelope * configuration.amplitude * normalized };
}
