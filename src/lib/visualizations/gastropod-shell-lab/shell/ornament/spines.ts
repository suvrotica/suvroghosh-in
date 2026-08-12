import {
	finiteBandLimit,
	gaussianPulse,
	ornamentEnvelope,
	periodicAngleDistance,
	periodicCycleDistance
} from './common';
import { nearestVarixIndex, varixCycle } from './varices';
import type {
	OrnamentContext,
	OrnamentSignal,
	SpinesConfiguration,
	VaricesConfiguration
} from './types';

export function evaluateSpines(
	configuration: SpinesConfiguration,
	varices: VaricesConfiguration,
	context: OrnamentContext
): OrnamentSignal {
	const envelope = ornamentEnvelope(configuration.enabled, configuration.onset, context.age);
	const count = finiteBandLimit(configuration.countAroundAperture, context.apertureSamples);
	if (envelope === 0 || configuration.length === 0 || count === 0 || varices.countPerTurn === 0) {
		return { normalized: 0, displacement: 0 };
	}
	const nearestIndex = nearestVarixIndex(varices, context);
	if (
		configuration.selectedVarices.length > 0 &&
		!configuration.selectedVarices.includes(Math.abs(nearestIndex))
	) {
		return { normalized: 0, displacement: 0 };
	}
	const growthDistance = periodicCycleDistance(varixCycle(varices, context));
	const growthKernel = gaussianPulse(growthDistance, configuration.width);
	const recurvedU = context.u + configuration.recurvature * growthDistance;
	let apertureKernel = 0;
	for (let index = 0; index < count; index += 1) {
		const center = configuration.phase + (index / count) * Math.PI * 2;
		const distance = periodicAngleDistance(recurvedU, center) / (Math.PI * 2);
		apertureKernel = Math.max(apertureKernel, gaussianPulse(distance, configuration.width));
	}
	const tapered = Math.pow(apertureKernel, 1 + configuration.taper * 4);
	const normalized = growthKernel * tapered;
	return { normalized, displacement: envelope * configuration.length * normalized };
}
