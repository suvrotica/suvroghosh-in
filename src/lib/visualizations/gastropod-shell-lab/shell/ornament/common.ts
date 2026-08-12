import type { GrowthLaw } from '../model/growth-law';
import { evaluateGrowthLaw } from '../model/growth-law';
import { clamp, smoothstep, wrapAngle } from '../math/vector';

export function ornamentEnvelope(enabled: boolean, onset: GrowthLaw, age: number): number {
	if (!enabled) return 0;
	return smoothstep(0, 1, clamp(evaluateGrowthLaw(onset, age), 0, 1));
}

/** Signed distance to the nearest period centre, measured in cycles [-0.5, 0.5). */
export function periodicCycleDistance(cycles: number): number {
	return ((((cycles + 0.5) % 1) + 1) % 1) - 0.5;
}

export function gaussianPulse(distance: number, width: number): number {
	const sigma = Math.max(1e-5, width);
	const normalized = distance / sigma;
	return Math.exp(-0.5 * normalized * normalized);
}

export function periodicGaussian(cycles: number, width: number): number {
	return gaussianPulse(periodicCycleDistance(cycles), width);
}

export function sharpenedCosine(argument: number, sharpness: number): number {
	const wave = 0.5 + 0.5 * Math.cos(argument);
	return Math.pow(Math.max(0, wave), Math.max(0.01, sharpness));
}

/** A stable integer mixer used for order-independent seeded ornament coefficients. */
export function hashUnit(seed: number, channel: number): number {
	let value = (seed ^ Math.imul(channel + 1, 0x9e3779b9)) >>> 0;
	value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
	value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
	value = (value ^ (value >>> 15)) >>> 0;
	return value / 0x1_0000_0000;
}

export function finiteBandLimit(requested: number, apertureSamples: number): number {
	return Math.max(0, Math.min(Math.floor(requested), Math.floor(apertureSamples / 2) - 1));
}

export function finiteGrowthFrequency(
	requestedPerTurn: number,
	totalTurns: number,
	growthSamples: number
): number {
	const maximumCycles = Math.max(0, Math.floor(growthSamples / 2) - 1);
	return Math.max(0, Math.min(requestedPerTurn, maximumCycles / Math.max(1e-8, totalTurns)));
}

/** Smoothly bounds inward displacement more tightly than outward ornament. */
export function boundRadialDisplacement(value: number): number {
	if (!Number.isFinite(value) || value === 0) return 0;
	return value >= 0 ? 8 * Math.tanh(value / 8) : 0.72 * Math.tanh(value / 0.72);
}

export function periodicAngleDistance(a: number, b: number): number {
	const difference = wrapAngle(a - b);
	return difference > Math.PI ? difference - Math.PI * 2 : difference;
}
