import { hashString32, normalizeSeed } from './seed';
import type { GaitFamily, LimbPhenotype, Vec2 } from './types';

const TAU = Math.PI * 2;
const EPSILON = 1e-9;

export type GaitLimb = Pick<
	LimbPhenotype,
	'id' | 'pairIndex' | 'side' | 'rootSegment' | 'phaseOffset'
>;

export type GaitProfile = Readonly<{
	stanceRatio: number;
	strideMultiplier: number;
	swingMultiplier: number;
	bodyBobMultiplier: number;
}>;

export type FootTrajectoryOptions = Readonly<{
	stanceRatio: number;
	strideLength: number;
	swingHeight: number;
	travelDirection?: Vec2;
	liftDirection?: Vec2;
}>;

export type GaitSampleOptions = Readonly<{
	family: GaitFamily;
	time: number;
	cadence: number;
	stanceRatio?: number;
	strideLength: number;
	swingHeight: number;
	restTarget: Vec2;
	totalPairs: number;
	seed?: string;
	travelDirection?: Vec2;
	liftDirection?: Vec2;
}>;

export type GaitFootSample = Readonly<{
	phase: number;
	phaseRadians: number;
	phaseOffset: number;
	planted: boolean;
	stanceProgress: number;
	swingProgress: number;
	target: Vec2;
}>;

export const GAIT_PROFILES: Readonly<Record<GaitFamily, GaitProfile>> = Object.freeze({
	tripod: { stanceRatio: 0.64, strideMultiplier: 1, swingMultiplier: 1, bodyBobMultiplier: 0.8 },
	'arachnoid-scuttle': {
		stanceRatio: 0.7,
		strideMultiplier: 0.82,
		swingMultiplier: 0.78,
		bodyBobMultiplier: 0.45
	},
	wave: {
		stanceRatio: 0.82,
		strideMultiplier: 0.62,
		swingMultiplier: 0.58,
		bodyBobMultiplier: 0.3
	},
	stalk: {
		stanceRatio: 0.76,
		strideMultiplier: 0.72,
		swingMultiplier: 1.3,
		bodyBobMultiplier: 0.55
	},
	skitter: {
		stanceRatio: 0.54,
		strideMultiplier: 1.15,
		swingMultiplier: 0.7,
		bodyBobMultiplier: 1.15
	},
	'clamp-crawl': {
		stanceRatio: 0.84,
		strideMultiplier: 0.5,
		swingMultiplier: 0.5,
		bodyBobMultiplier: 0.2
	},
	dormant: { stanceRatio: 1, strideMultiplier: 0, swingMultiplier: 0, bodyBobMultiplier: 0 }
});

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function wrapPhase(value: number): number {
	const finiteValue = finite(value, 0);
	return ((finiteValue % 1) + 1) % 1;
}

function unit(value: Vec2 | undefined, fallback: Vec2): Vec2 {
	const x = finite(value?.x, fallback.x);
	const y = finite(value?.y, fallback.y);
	const length = Math.hypot(x, y);
	return length > EPSILON ? { x: x / length, y: y / length } : fallback;
}

function deterministicJitter(seed: string, family: GaitFamily, limb: GaitLimb): number {
	const hash = hashString32(
		`chitin:v1::${normalizeSeed(seed)}::gait:${family}:${limb.id}:${limb.pairIndex}:${limb.side}`
	);
	return (hash / 0x1_0000_0000 - 0.5) * 0.06;
}

/** Stable oscillator offsets; call order cannot change the answer. */
export function phaseOffsetForLimb(
	family: GaitFamily,
	limb: GaitLimb,
	totalPairs: number,
	seed = 'glassback-1847'
): number {
	const pairCount = clamp(Math.round(finite(totalPairs, 1)), 1, 64);
	const pairIndex = clamp(Math.round(finite(limb.pairIndex, 0)), 0, pairCount - 1);
	const sideBit = limb.side === 1 ? 1 : 0;
	let familyOffset = 0;

	switch (family) {
		case 'tripod':
			familyOffset = ((pairIndex + sideBit) & 1) * 0.5;
			break;
		case 'arachnoid-scuttle':
			familyOffset = ((pairIndex * 3 + sideBit * 2) % 4) / 4;
			break;
		case 'wave':
			familyOffset = pairIndex / pairCount + sideBit * 0.5;
			break;
		case 'stalk':
			familyOffset = ((pairIndex + sideBit) & 1) * 0.5 + pairIndex * 0.045;
			break;
		case 'skitter':
			familyOffset = ((pairIndex + sideBit * 2) % 4) / 4 + deterministicJitter(seed, family, limb);
			break;
		case 'clamp-crawl':
			familyOffset = sideBit * 0.5 + (pairIndex % 2) * 0.125;
			break;
		case 'dormant':
			familyOffset = 0;
			break;
	}

	return wrapPhase(familyOffset + finite(limb.phaseOffset, 0));
}

export function buildGaitPhaseOffsets(
	family: GaitFamily,
	limbs: readonly GaitLimb[],
	totalPairs: number,
	seed?: string
): readonly number[] {
	return limbs.map((limb) => phaseOffsetForLimb(family, limb, totalPairs, seed));
}

function smoothstep(value: number): number {
	const bounded = clamp(value, 0, 1);
	return bounded * bounded * (3 - 2 * bounded);
}

/**
 * During stance, the target moves backwards relative to the advancing body.
 * During swing, it returns on a smooth lifted arc rather than sliding linearly.
 */
export function sampleFootTrajectory(
	phaseInput: number,
	restTargetInput: Vec2,
	options: FootTrajectoryOptions
): Omit<GaitFootSample, 'phaseOffset' | 'phaseRadians'> {
	const phase = wrapPhase(phaseInput);
	const stanceRatio = clamp(finite(options.stanceRatio, 0.7), 0.2, 0.98);
	const strideLength = clamp(Math.abs(finite(options.strideLength, 0)), 0, 100_000);
	const swingHeight = clamp(Math.abs(finite(options.swingHeight, 0)), 0, 100_000);
	const travel = unit(options.travelDirection, { x: 1, y: 0 });
	const lift = unit(options.liftDirection, { x: 0, y: -1 });
	const restTarget = {
		x: clamp(finite(restTargetInput.x, 0), -1_000_000, 1_000_000),
		y: clamp(finite(restTargetInput.y, 0), -1_000_000, 1_000_000)
	};

	if (phase < stanceRatio) {
		const progress = phase / stanceRatio;
		const travelDistance = strideLength * (0.5 - progress);
		return {
			phase,
			planted: true,
			stanceProgress: progress,
			swingProgress: 0,
			target: {
				x: restTarget.x + travel.x * travelDistance,
				y: restTarget.y + travel.y * travelDistance
			}
		};
	}

	const progress = (phase - stanceRatio) / (1 - stanceRatio);
	const eased = smoothstep(progress);
	const travelDistance = strideLength * (-0.5 + eased);
	const elevation = swingHeight * Math.sin(Math.PI * progress);
	return {
		phase,
		planted: false,
		stanceProgress: 1,
		swingProgress: progress,
		target: {
			x: restTarget.x + travel.x * travelDistance + lift.x * elevation,
			y: restTarget.y + travel.y * travelDistance + lift.y * elevation
		}
	};
}

export function sampleGaitTarget(limb: GaitLimb, options: GaitSampleOptions): GaitFootSample {
	const profile = GAIT_PROFILES[options.family];
	const offset = phaseOffsetForLimb(options.family, limb, options.totalPairs, options.seed);
	if (options.family === 'dormant') {
		return {
			phase: 0,
			phaseRadians: 0,
			phaseOffset: offset,
			planted: true,
			stanceProgress: 0,
			swingProgress: 0,
			target: {
				x: finite(options.restTarget.x, 0),
				y: finite(options.restTarget.y, 0)
			}
		};
	}

	const cadence = clamp(Math.abs(finite(options.cadence, 0)), 0, 20);
	const phase = wrapPhase(finite(options.time, 0) * cadence + offset);
	const trajectory = sampleFootTrajectory(phase, options.restTarget, {
		stanceRatio:
			options.stanceRatio === undefined
				? profile.stanceRatio
				: clamp(finite(options.stanceRatio, profile.stanceRatio), 0.2, 0.98),
		strideLength: Math.abs(finite(options.strideLength, 0)) * profile.strideMultiplier,
		swingHeight: Math.abs(finite(options.swingHeight, 0)) * profile.swingMultiplier,
		travelDirection: options.travelDirection,
		liftDirection: options.liftDirection
	});
	return {
		...trajectory,
		phaseRadians: trajectory.phase * TAU,
		phaseOffset: offset
	};
}

export function bodyBobAtPhase(family: GaitFamily, phase: number, amplitude: number): number {
	const profile = GAIT_PROFILES[family];
	if (family === 'dormant') return 0;
	return (
		Math.sin(wrapPhase(phase) * TAU * 2) *
		clamp(Math.abs(finite(amplitude, 0)), 0, 100_000) *
		profile.bodyBobMultiplier
	);
}
