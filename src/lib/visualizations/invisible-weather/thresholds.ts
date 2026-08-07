import type { ThresholdSettings } from './types';

export type ThresholdBand =
	| 'field'
	| 'river'
	| 'island-low'
	| 'island-high'
	| 'delta-river'
	| 'delta-tail';

export type ThresholdClassification = Readonly<{
	selected: boolean;
	band: ThresholdBand;
	weight: number;
}>;

function clamp(value: number, minimum = 0, maximum = 1): number {
	return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const t = clamp((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

export function normalizeThresholdSettings(settings: ThresholdSettings): ThresholdSettings {
	return {
		mode: ['off', 'river', 'islands', 'delta'].includes(settings.mode) ? settings.mode : 'off',
		centre: clamp(settings.centre, 0.1, 0.9),
		width: clamp(settings.width, 0.005, 0.35),
		tail: clamp(settings.tail, 0.02, 0.45)
	};
}

export function classifyThreshold(
	value: number,
	settings: ThresholdSettings,
	nearbyValue?: number
): ThresholdClassification {
	const scalar = clamp(value, 0, 1);
	const normalized = normalizeThresholdSettings(settings);
	if (normalized.mode === 'off') return { selected: false, band: 'field', weight: 0 };

	const distance = Math.abs(scalar - normalized.centre);
	const riverSelected = distance <= normalized.width;
	const riverWeight = riverSelected ? 1 - smoothstep(0, normalized.width, distance) : 0;
	const lowTail = scalar <= normalized.tail;
	const highTail = scalar >= 1 - normalized.tail;
	const tailWeight = lowTail
		? smoothstep(normalized.tail, 0, scalar)
		: highTail
			? smoothstep(1 - normalized.tail, 1, scalar)
			: 0;

	if (normalized.mode === 'river') {
		return { selected: riverSelected, band: 'river', weight: riverWeight };
	}
	if (normalized.mode === 'islands') {
		return {
			selected: lowTail || highTail,
			band: lowTail ? 'island-low' : 'island-high',
			weight: tailWeight
		};
	}
	const neighbour = Number.isFinite(nearbyValue) ? clamp(nearbyValue as number, 0, 1) : scalar;
	const difference = Math.abs(scalar - neighbour);
	const lowerDifference = Math.max(0.001, normalized.width * 0.16);
	const upperDifference = Math.max(lowerDifference + 0.001, normalized.width);
	const selected = difference >= lowerDifference && difference <= upperDifference;
	const midpoint = (lowerDifference + upperDifference) / 2;
	const halfRange = Math.max(1e-6, (upperDifference - lowerDifference) / 2);
	const deltaWeight = selected ? clamp(1 - Math.abs(difference - midpoint) / halfRange) : 0;
	return {
		selected,
		band: selected ? 'delta-river' : 'delta-tail',
		weight: deltaWeight
	};
}

export function thresholdWeight(
	value: number,
	settings: ThresholdSettings,
	nearbyValue?: number
): number {
	return classifyThreshold(value, settings, nearbyValue).weight;
}
