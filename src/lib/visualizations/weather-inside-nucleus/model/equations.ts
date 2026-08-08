import { contactPropensity, signalInput } from './parameters';
import type { BinaryState, ModelParameters } from './types';

const ROUND_OFF_TOLERANCE = 1e-12;

export { contactPropensity, signalInput };

export function exactAffineRelaxation(
	value: number,
	activation: number,
	deactivation: number,
	duration: number
): number {
	const totalRate = activation + deactivation;
	if (totalRate === 0 || duration === 0) return value;
	const equilibrium = activation / totalRate;
	return equilibrium + (value - equilibrium) * Math.exp(-totalRate * duration);
}

export function receptorStep(
	value: number,
	input: number,
	parameters: Readonly<ModelParameters>,
	duration: number
): number {
	return exactAffineRelaxation(
		value,
		parameters.receptorActivationRate * (1 - parameters.receptorBlockade) * input,
		parameters.receptorDeactivationRate,
		duration
	);
}

export function downstreamStep(
	value: number,
	receptorActivity: number,
	parameters: Readonly<ModelParameters>,
	duration: number
): number {
	return exactAffineRelaxation(
		value,
		parameters.downstreamActivationRate * receptorActivity,
		parameters.downstreamDeactivationRate,
		duration
	);
}

export function nuclearStep(
	value: number,
	downstreamActivity: number,
	parameters: Readonly<ModelParameters>,
	duration: number
): number {
	return exactAffineRelaxation(
		value,
		parameters.nuclearActivationRate * downstreamActivity,
		parameters.nuclearDeactivationRate,
		duration
	);
}

export function occupancySteadyState(
	nuclearActivity: number,
	parameters: Readonly<ModelParameters>
): number {
	const effectiveActivity = parameters.bindingAffinity * nuclearActivity;
	if (effectiveActivity <= 0) return 0;
	const numerator = effectiveActivity ** parameters.bindingHillCoefficient;
	const denominator =
		parameters.bindingHalfSaturation ** parameters.bindingHillCoefficient + numerator;
	return numerator / denominator;
}

export function occupancyStep(
	value: number,
	nuclearActivity: number,
	parameters: Readonly<ModelParameters>,
	duration: number
): number {
	const target = occupancySteadyState(nuclearActivity, parameters);
	return target + (value - target) * Math.exp(-duration / parameters.occupancyRelaxationTime);
}

export function licensingStep(
	value: number,
	contactState: BinaryState,
	parameters: Readonly<ModelParameters>,
	duration: number
): number {
	return contactState === 1
		? 1 + (value - 1) * Math.exp(-parameters.licensingActivationRate * duration)
		: value * Math.exp(-parameters.licensingDeactivationRate * duration);
}

export function licensingResponse(
	licensing: number,
	parameters: Readonly<ModelParameters>
): number {
	if (licensing <= 0) return 0;
	const numerator = licensing ** parameters.licensingHillCoefficient;
	return (
		numerator /
		(parameters.licensingHalfSaturation ** parameters.licensingHillCoefficient + numerator)
	);
}

export function promoterActivationRate(
	occupancy: number,
	licensing: number,
	parameters: Readonly<ModelParameters>
): number {
	return (
		parameters.basalPromoterActivationRate +
		parameters.occupancyPromoterActivationRate * occupancy +
		parameters.contactPromoterActivationRate * occupancy * licensingResponse(licensing, parameters)
	);
}

export function hazardProbability(rate: number, duration: number): number {
	if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(duration) || duration < 0) {
		throw new RangeError('A hazard probability requires finite, non-negative rate and duration.');
	}
	return -Math.expm1(-rate * duration);
}

export function waitingTimeFromUniform(rate: number, uniform: number): number {
	if (!(rate > 0) || !Number.isFinite(rate)) {
		throw new RangeError('A transition waiting time requires a finite positive rate.');
	}
	if (!Number.isFinite(uniform) || uniform < 0 || uniform >= 1) {
		throw new RangeError('A transition uniform must lie in [0, 1).');
	}
	return -Math.log1p(-uniform) / rate;
}

export function unitRoundoff(value: number, label: string): number {
	if (!Number.isFinite(value)) throw new Error(`${label} became non-finite.`);
	if (value < -ROUND_OFF_TOLERANCE || value > 1 + ROUND_OFF_TOLERANCE) {
		throw new Error(`${label} escaped the normalized interval: ${value}.`);
	}
	return Math.max(0, Math.min(1, value));
}
