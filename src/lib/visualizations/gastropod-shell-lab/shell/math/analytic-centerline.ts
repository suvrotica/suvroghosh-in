import {
	archimedeanRadius,
	archimedeanRadiusDerivative,
	expansionRateFromWhorl,
	logarithmicRadius,
	logarithmicRadiusDerivative,
	TAU
} from './logarithmic-spiral';
import type { Vec3 } from './vector';

export type AxialMode = 'planispiral' | 'lecture-lift' | 'cone-similar' | 'keyframed';
export type SpiralFamily = 'logarithmic' | 'archimedean';

export interface AxialKeyframe {
	age: number;
	value: number;
	/** Slope with respect to normalized age. Optional slopes are monotone-derived. */
	slope?: number;
}

export interface AnalyticCenterlineParameters {
	spiralFamily: SpiralFamily;
	thetaStart: number;
	thetaEnd: number;
	adultRadius: number;
	minimumRadius?: number;
	whorlExpansion: number;
	archimedeanSpacing: number;
	handedness: -1 | 1;
	axialMode: AxialMode;
	risePerTurn: number;
	coneSpireRatio: number;
	zOffset?: number;
	axialKeyframes?: readonly AxialKeyframe[];
	meanderAmplitude?: number;
	meanderFrequency?: number;
	meanderPhase?: number;
}

export interface CenterlineEvaluation {
	point: Vec3;
	derivative: Vec3;
	radius: number;
	radiusDerivative: number;
	z: number;
	zDerivative: number;
	age: number;
}

function sortedKeyframes(keyframes: readonly AxialKeyframe[]): AxialKeyframe[] {
	return [...keyframes]
		.filter((frame) => Number.isFinite(frame.age) && Number.isFinite(frame.value))
		.sort((a, b) => a.age - b.age);
}

function keyframeValueAndDerivative(
	keyframes: readonly AxialKeyframe[],
	age: number
): { value: number; derivative: number } {
	const frames = sortedKeyframes(keyframes);
	if (frames.length === 0) return { value: 0, derivative: 0 };
	if (frames.length === 1 || age <= frames[0].age) {
		return { value: frames[0].value, derivative: frames[0].slope ?? 0 };
	}
	const last = frames[frames.length - 1];
	if (age >= last.age) return { value: last.value, derivative: last.slope ?? 0 };

	let rightIndex = 1;
	while (rightIndex < frames.length && age > frames[rightIndex].age) rightIndex += 1;
	const left = frames[rightIndex - 1];
	const right = frames[rightIndex];
	const duration = Math.max(1e-12, right.age - left.age);
	const amount = (age - left.age) / duration;
	const secant = (right.value - left.value) / duration;
	const previous = frames[rightIndex - 2];
	const next = frames[rightIndex + 1];
	const leftSlope =
		left.slope ??
		(previous
			? (right.value - previous.value) / Math.max(1e-12, right.age - previous.age)
			: secant);
	const rightSlope =
		right.slope ??
		(next ? (next.value - left.value) / Math.max(1e-12, next.age - left.age) : secant);
	// Clamp authored/derived tangents to prevent gross cubic overshoot.
	const tangentLimit = Math.abs(secant) * 3;
	const m0 = tangentLimit === 0 ? 0 : Math.max(-tangentLimit, Math.min(tangentLimit, leftSlope));
	const m1 = tangentLimit === 0 ? 0 : Math.max(-tangentLimit, Math.min(tangentLimit, rightSlope));
	const t2 = amount * amount;
	const t3 = t2 * amount;
	const value =
		(2 * t3 - 3 * t2 + 1) * left.value +
		(t3 - 2 * t2 + amount) * duration * m0 +
		(-2 * t3 + 3 * t2) * right.value +
		(t3 - t2) * duration * m1;
	const derivative =
		((6 * t2 - 6 * amount) * left.value +
			(3 * t2 - 4 * amount + 1) * duration * m0 +
			(-6 * t2 + 6 * amount) * right.value +
			(3 * t2 - 2 * amount) * duration * m1) /
		duration;
	return { value, derivative };
}

export function evaluateAnalyticCenterline(
	theta: number,
	parameters: AnalyticCenterlineParameters
): CenterlineEvaluation {
	const span = Math.max(1e-12, parameters.thetaEnd - parameters.thetaStart);
	const age = Math.max(0, Math.min(1, (theta - parameters.thetaStart) / span));
	const minimumRadius = Math.max(parameters.minimumRadius ?? parameters.adultRadius * 1e-6, 1e-9);
	const logParameters = {
		expansionRate: expansionRateFromWhorl(parameters.whorlExpansion),
		adultTheta: parameters.thetaEnd,
		adultRadius: parameters.adultRadius,
		minimumRadius
	};
	const initialRadius = Math.max(
		minimumRadius,
		parameters.adultRadius - parameters.archimedeanSpacing * span
	);
	const archimedeanParameters = {
		initialTheta: parameters.thetaStart,
		initialRadius,
		spacingPerRadian: parameters.archimedeanSpacing,
		minimumRadius
	};
	const radius =
		parameters.spiralFamily === 'logarithmic'
			? logarithmicRadius(theta, logParameters)
			: archimedeanRadius(theta, archimedeanParameters);
	const radiusDerivative =
		parameters.spiralFamily === 'logarithmic'
			? logarithmicRadiusDerivative(theta, logParameters)
			: archimedeanRadiusDerivative(theta, archimedeanParameters);
	const zOffset = parameters.zOffset ?? 0;
	let z = zOffset;
	let zDerivative = 0;
	if (parameters.axialMode === 'lecture-lift') {
		z = zOffset + (parameters.risePerTurn / TAU) * (theta - parameters.thetaStart);
		zDerivative = parameters.risePerTurn / TAU;
	} else if (parameters.axialMode === 'cone-similar') {
		const initialLogRadius =
			parameters.spiralFamily === 'logarithmic'
				? logarithmicRadius(parameters.thetaStart, logParameters)
				: archimedeanRadius(parameters.thetaStart, archimedeanParameters);
		z = zOffset + parameters.coneSpireRatio * (radius - initialLogRadius);
		zDerivative = parameters.coneSpireRatio * radiusDerivative;
	} else if (parameters.axialMode === 'keyframed') {
		const evaluated = keyframeValueAndDerivative(parameters.axialKeyframes ?? [], age);
		z = zOffset + evaluated.value;
		zDerivative = evaluated.derivative / span;
	}

	const handedTheta = parameters.handedness * theta;
	const cosine = Math.cos(handedTheta);
	const sine = Math.sin(handedTheta);
	const meanderAmplitude = parameters.meanderAmplitude ?? 0;
	const meanderFrequency = parameters.meanderFrequency ?? 0;
	const meanderPhase = parameters.meanderPhase ?? 0;
	const meanderArgument = meanderFrequency * theta + meanderPhase;
	const meander = meanderAmplitude * radius * Math.sin(meanderArgument);
	const meanderDerivative =
		meanderAmplitude *
		(radiusDerivative * Math.sin(meanderArgument) +
			radius * meanderFrequency * Math.cos(meanderArgument));

	return {
		point: {
			x: radius * cosine,
			y: radius * sine,
			z: z + meander
		},
		derivative: {
			x: radiusDerivative * cosine - parameters.handedness * radius * sine,
			y: radiusDerivative * sine + parameters.handedness * radius * cosine,
			z: zDerivative + meanderDerivative
		},
		radius,
		radiusDerivative,
		z,
		zDerivative,
		age
	};
}

export function sampleAnalyticCenterline(
	parameters: AnalyticCenterlineParameters,
	count: number
): CenterlineEvaluation[] {
	if (!Number.isInteger(count) || count < 2) {
		throw new RangeError('A centerline needs at least two samples.');
	}
	const output: CenterlineEvaluation[] = [];
	for (let index = 0; index < count; index += 1) {
		const age = index / (count - 1);
		const theta = parameters.thetaStart + (parameters.thetaEnd - parameters.thetaStart) * age;
		output.push(evaluateAnalyticCenterline(theta, parameters));
	}
	return output;
}
