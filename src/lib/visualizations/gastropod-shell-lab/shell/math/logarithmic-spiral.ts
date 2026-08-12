import { clamp } from './vector';

export const TAU = Math.PI * 2;

export interface LogarithmicSpiralParameters {
	expansionRate: number;
	adultTheta: number;
	adultRadius: number;
	minimumRadius?: number;
}

export interface ArchimedeanSpiralParameters {
	initialTheta: number;
	initialRadius: number;
	spacingPerRadian: number;
	minimumRadius?: number;
}

export function expansionRateFromWhorl(whorlExpansion: number): number {
	if (!(whorlExpansion > 0) || !Number.isFinite(whorlExpansion)) {
		throw new RangeError('Whorl expansion must be a finite positive number.');
	}
	return Math.log(whorlExpansion) / TAU;
}

export function whorlExpansionFromRate(expansionRate: number): number {
	if (!Number.isFinite(expansionRate)) {
		throw new RangeError('Expansion rate must be finite.');
	}
	return Math.exp(TAU * expansionRate);
}

/** Evaluated relative to the adult end to avoid uncontrolled exponentials. */
export function logarithmicRadius(theta: number, parameters: LogarithmicSpiralParameters): number {
	const { expansionRate, adultTheta, adultRadius } = parameters;
	if (![theta, expansionRate, adultTheta, adultRadius].every(Number.isFinite) || adultRadius <= 0) {
		throw new RangeError('Logarithmic spiral parameters must be finite and adultRadius positive.');
	}
	const exponent = clamp(expansionRate * (theta - adultTheta), -700, 700);
	const radius = adultRadius * Math.exp(exponent);
	return Math.max(parameters.minimumRadius ?? 0, radius);
}

export function logarithmicRadiusDerivative(
	theta: number,
	parameters: LogarithmicSpiralParameters
): number {
	const radius = logarithmicRadius(theta, parameters);
	if (parameters.minimumRadius !== undefined && radius <= parameters.minimumRadius) return 0;
	return parameters.expansionRate * radius;
}

export function archimedeanRadius(theta: number, parameters: ArchimedeanSpiralParameters): number {
	const { initialTheta, initialRadius, spacingPerRadian } = parameters;
	if (![theta, initialTheta, initialRadius, spacingPerRadian].every(Number.isFinite)) {
		throw new RangeError('Archimedean spiral parameters must be finite.');
	}
	return Math.max(
		parameters.minimumRadius ?? 0,
		initialRadius + spacingPerRadian * (theta - initialTheta)
	);
}

export function archimedeanRadiusDerivative(
	theta: number,
	parameters: ArchimedeanSpiralParameters
): number {
	const unclamped =
		parameters.initialRadius + parameters.spacingPerRadian * (theta - parameters.initialTheta);
	if (parameters.minimumRadius !== undefined && unclamped <= parameters.minimumRadius) return 0;
	return parameters.spacingPerRadian;
}

/** Angle between the logarithmic-spiral tangent and its outward radial direction. */
export function logarithmicTangentRadialAngle(expansionRate: number): number {
	return Math.atan2(1, expansionRate);
}

export function classifySimilarity(
	radialExpansionRate: number,
	apertureExpansionRate: number,
	tolerance = 1e-12
): 'exact-geometric-similarity' | 'allometric' {
	return Math.abs(radialExpansionRate - apertureExpansionRate) <= tolerance
		? 'exact-geometric-similarity'
		: 'allometric';
}
