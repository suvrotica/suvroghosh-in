import { createConstraintChain, stepConstraintChain } from './constraint-chain';
import { bodyBobAtPhase, sampleGaitTarget, wrapPhase } from './gait';
import { solveFabrik } from './ik';
import { hashString32 } from './seed';
import type {
	AxisPoint,
	ConstraintChainState,
	CreaturePhenotype,
	CreaturePose,
	FlexibleAppendagePhenotype,
	LimbPhenotype,
	LimbPose,
	MutableVec2,
	Vec2
} from './types';

const TAU = Math.PI * 2;
const MAX_DELTA_TIME = 0.05;
const MAX_LIMBS = 256;
const MAX_FLEXIBLE_APPENDAGES = 96;
const MAX_COORDINATE = 1_000_000;

export type ChitinLimbPose = LimbPose & {
	swingOrigin: MutableVec2;
};

/** Runtime-only clocks and transition targets; still structurally a CreaturePose. */
export type ChitinPose = CreaturePose & {
	genomeTime: number;
	gaitTime: number;
	idleTime: number;
	paused: boolean;
	threatTarget: number;
};

export type CreateCreaturePoseOptions = Readonly<{
	genomeTime?: number;
	gaitTime?: number;
	idleTime?: number;
	paused?: boolean;
	threat?: number;
	startle?: number;
}>;

export type UpdateCreaturePoseOptions = Readonly<{
	deltaTime: number;
	paused?: boolean;
	singleStep?: boolean;
	fixedStep?: number;
	maxDeltaTime?: number;
	reducedMotion?: boolean;
	threat?: boolean | number;
	startle?: boolean | number;
}>;

export type PoseUpdateResult = Readonly<{
	pose: ChitinPose;
	deltaTime: number;
	advanced: boolean;
	rebuiltLimbs: number;
	rebuiltChains: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coordinate(value: unknown, fallback = 0): number {
	return clamp(finite(value, fallback), -MAX_COORDINATE, MAX_COORDINATE);
}

function smoothstep(value: number): number {
	const bounded = clamp(value, 0, 1);
	return bounded * bounded * (3 - 2 * bounded);
}

function transition(current: number, target: number, deltaTime: number, response: number): number {
	if (deltaTime <= 0) return current;
	const mix = 1 - Math.exp(-response * deltaTime);
	return current + (target - current) * mix;
}

function axisFrame(phenotype: CreaturePhenotype, segmentInput: number): AxisPoint {
	if (phenotype.axis.length === 0) {
		return {
			s: 0,
			position: { x: 0, y: 0 },
			tangent: { x: 1, y: 0 },
			normal: { x: 0, y: 1 },
			depth: 0
		};
	}
	const segment = clamp(Math.round(finite(segmentInput)), 0, phenotype.axis.length - 1);
	return phenotype.axis[segment];
}

function unit(value: Vec2, fallback: Vec2): Vec2 {
	const x = finite(value.x, fallback.x);
	const y = finite(value.y, fallback.y);
	const length = Math.hypot(x, y);
	if (length <= 1e-9) return fallback;
	return { x: x / length, y: y / length };
}

function rootForLimb(
	phenotype: CreaturePhenotype,
	pose: Pick<CreaturePose, 'bodyOffset'>,
	limb: LimbPhenotype
): MutableVec2 {
	const frame = axisFrame(phenotype, limb.rootSegment);
	const normal = unit(frame.normal, { x: 0, y: 1 });
	const offset = coordinate(limb.rootOffset) * limb.side;
	return {
		x: coordinate(frame.position.x) + pose.bodyOffset.x + normal.x * offset,
		y: coordinate(frame.position.y) + pose.bodyOffset.y + normal.y * offset
	};
}

function limbReach(limb: LimbPhenotype): number {
	return limb.boneLengths
		.slice(0, 32)
		.reduce((total, length) => total + clamp(Math.abs(finite(length, 1)), 1e-5, 100_000), 0);
}

function restTargetForLimb(
	phenotype: CreaturePhenotype,
	pose: Pick<CreaturePose, 'bodyOffset' | 'threat'>,
	limb: LimbPhenotype
): MutableVec2 {
	const frame = axisFrame(phenotype, limb.rootSegment);
	const root = rootForLimb(phenotype, pose, limb);
	const normal = unit(frame.normal, { x: 0, y: 1 });
	const tangent = unit(frame.tangent, { x: 1, y: 0 });
	const reach = limbReach(limb);
	const stance = Math.max(
		Math.abs(finite(phenotype.genome.stanceWidth, reach * 0.55)),
		reach * 0.42
	);
	const pairBias = (finite(limb.pairIndex) - (phenotype.genome.walkingLegPairs - 1) * 0.5) * 0.012;
	const graspingLift = limb.kind === 'grasping' ? pose.threat * reach * 0.28 : 0;
	const graspingFold = limb.kind === 'grasping' ? pose.threat * reach * 0.2 : 0;
	return {
		x:
			root.x +
			normal.x * limb.side * (stance + graspingLift) +
			tangent.x * (pairBias - graspingFold),
		y:
			root.y +
			normal.y * limb.side * (stance + graspingLift) +
			tangent.y * (pairBias - graspingFold)
	};
}

function sampleLimb(
	phenotype: CreaturePhenotype,
	pose: ChitinPose,
	limb: LimbPhenotype,
	previous?: ChitinLimbPose
): ChitinLimbPose {
	const frame = axisFrame(phenotype, limb.rootSegment);
	const root = rootForLimb(phenotype, pose, limb);
	const restTarget = restTargetForLimb(phenotype, pose, limb);
	const totalPairs = Math.max(1, phenotype.genome.walkingLegPairs + phenotype.genome.graspingPairs);
	const trajectory = sampleGaitTarget(limb, {
		family: phenotype.genome.gait,
		time: pose.gaitTime,
		cadence: phenotype.genome.cadence,
		stanceRatio: phenotype.genome.stanceRatio,
		strideLength: phenotype.genome.legLength * 0.24,
		swingHeight: phenotype.genome.swingHeight,
		restTarget,
		totalPairs,
		seed: phenotype.genome.seed,
		travelDirection: frame.tangent,
		liftDirection: {
			x: frame.normal.x * limb.side,
			y: frame.normal.y * limb.side
		}
	});

	let target: MutableVec2;
	let swingOrigin: MutableVec2;
	if (trajectory.planted && previous?.planted) {
		target = { ...previous.target };
		swingOrigin = { ...previous.swingOrigin };
	} else if (!trajectory.planted && previous?.planted) {
		swingOrigin = { ...previous.target };
		const mix = smoothstep(trajectory.swingProgress);
		target = {
			x: swingOrigin.x + (trajectory.target.x - swingOrigin.x) * mix,
			y: swingOrigin.y + (trajectory.target.y - swingOrigin.y) * mix
		};
	} else if (!trajectory.planted && previous) {
		swingOrigin = { ...previous.swingOrigin };
		const mix = smoothstep(trajectory.swingProgress);
		target = {
			x: swingOrigin.x + (trajectory.target.x - swingOrigin.x) * mix,
			y: swingOrigin.y + (trajectory.target.y - swingOrigin.y) * mix
		};
	} else {
		target = { ...trajectory.target };
		swingOrigin = { ...trajectory.target };
	}

	const solved = solveFabrik(root, target, limb.boneLengths, {
		initialJoints: previous?.joints,
		preferredBend: limb.preferredBend,
		maxIterations: 24,
		tolerance: 1e-4
	});
	return {
		id: limb.id,
		joints: solved.joints,
		target,
		phase: trajectory.phase,
		planted: trajectory.planted,
		swingOrigin
	};
}

function appendageDirection(appendage: FlexibleAppendagePhenotype, frame: AxisPoint): Vec2 {
	const tangent = unit(frame.tangent, { x: 1, y: 0 });
	const normal = unit(frame.normal, { x: 0, y: 1 });
	if (appendage.kind === 'tail' || appendage.kind === 'cercus') {
		return { x: tangent.x, y: tangent.y };
	}
	if (appendage.kind === 'antenna' || appendage.kind === 'lure') {
		return {
			x: -tangent.x + normal.x * appendage.side * 0.35,
			y: -tangent.y + normal.y * appendage.side * 0.35
		};
	}
	return {
		x: normal.x * (appendage.side || 1) - tangent.x * 0.25,
		y: normal.y * (appendage.side || 1) - tangent.y * 0.25
	};
}

function rootForAppendage(
	phenotype: CreaturePhenotype,
	pose: Pick<CreaturePose, 'bodyOffset'>,
	appendage: FlexibleAppendagePhenotype
): MutableVec2 {
	const frame = axisFrame(phenotype, appendage.rootSegment);
	const normal = unit(frame.normal, { x: 0, y: 1 });
	const lateral = phenotype.genome.bodyWidth * 0.16 * appendage.side;
	return {
		x: coordinate(frame.position.x) + pose.bodyOffset.x + normal.x * lateral,
		y: coordinate(frame.position.y) + pose.bodyOffset.y + normal.y * lateral
	};
}

function chainMatches(
	state: ConstraintChainState | undefined,
	lengths: readonly number[]
): boolean {
	const expectedLinks = Math.min(lengths.length, 128);
	return (
		state !== undefined &&
		state.count === expectedLinks + 1 &&
		state.positions.length === state.count * 2 &&
		state.previous.length === state.count * 2 &&
		state.lengths.length === expectedLinks
	);
}

function synchronizeTopology(
	phenotype: CreaturePhenotype,
	pose: ChitinPose
): {
	rebuiltLimbs: number;
	rebuiltChains: number;
} {
	let rebuiltLimbs = 0;
	let rebuiltChains = 0;
	const nextLimbs: ChitinLimbPose[] = [];
	for (const limb of phenotype.limbs.slice(0, MAX_LIMBS)) {
		const previous = pose.limbs.find((candidate) => candidate.id === limb.id) as
			| ChitinLimbPose
			| undefined;
		if (!previous || previous.joints.length !== Math.min(limb.boneLengths.length, 32) + 1) {
			rebuiltLimbs += 1;
			nextLimbs.push(sampleLimb(phenotype, pose, limb));
		} else {
			nextLimbs.push(previous);
		}
	}
	pose.limbs = nextLimbs;

	const validIds = new Set(
		phenotype.flexibleAppendages.slice(0, MAX_FLEXIBLE_APPENDAGES).map((appendage) => appendage.id)
	);
	for (const id of pose.flexible.keys()) {
		if (!validIds.has(id)) pose.flexible.delete(id);
	}
	for (const appendage of phenotype.flexibleAppendages.slice(0, MAX_FLEXIBLE_APPENDAGES)) {
		const existing = pose.flexible.get(appendage.id);
		if (chainMatches(existing, appendage.lengths)) continue;
		const frame = axisFrame(phenotype, appendage.rootSegment);
		pose.flexible.set(
			appendage.id,
			createConstraintChain(rootForAppendage(phenotype, pose, appendage), appendage.lengths, {
				direction: appendageDirection(appendage, frame),
				initialCurve: appendage.side * 0.35
			})
		);
		rebuiltChains += 1;
	}
	return { rebuiltLimbs, rebuiltChains };
}

function updateBodyOffset(phenotype: CreaturePhenotype, pose: ChitinPose): void {
	const cadence = clamp(Math.abs(finite(phenotype.genome.cadence)), 0, 20);
	const gaitPhase = wrapPhase(pose.gaitTime * cadence);
	const bob = bodyBobAtPhase(
		phenotype.genome.gait,
		gaitPhase,
		phenotype.genome.bodyBob * phenotype.genome.bodyWidth * 0.08
	);
	const idle = Math.sin(pose.idleTime * TAU * 0.17) * phenotype.genome.idleMotion;
	pose.bodyOffset.x = coordinate(idle * phenotype.genome.bodyLength * 0.002);
	pose.bodyOffset.y = coordinate(
		bob +
			idle * phenotype.genome.bodyWidth * 0.008 +
			pose.startle * phenotype.genome.bodyWidth * 0.035 -
			pose.threat * phenotype.genome.bodyWidth * 0.025
	);
}

function updateFlexible(phenotype: CreaturePhenotype, pose: ChitinPose, deltaTime: number): void {
	for (const appendage of phenotype.flexibleAppendages.slice(0, MAX_FLEXIBLE_APPENDAGES)) {
		const state = pose.flexible.get(appendage.id);
		if (!state) continue;
		const frame = axisFrame(phenotype, appendage.rootSegment);
		const normal = unit(frame.normal, { x: 0, y: 1 });
		const phase = (hashString32(appendage.id) / 0x1_0000_0000) * TAU;
		const sway =
			Math.sin(pose.idleTime * (1.1 + phenotype.genome.appendageLag * 0.7) + phase) *
			phenotype.genome.idleMotion;
		stepConstraintChain(state, rootForAppendage(phenotype, pose, appendage), {
			deltaTime,
			maxDeltaTime: MAX_DELTA_TIME,
			acceleration: {
				x: normal.x * sway * 0.8,
				y: normal.y * sway * 0.8 + phenotype.genome.appendageLag * 0.04
			},
			damping: clamp(0.99 - phenotype.genome.appendageLag * 0.08, 0.82, 0.99),
			iterations: 8,
			maxVelocity: Math.max(0.1, phenotype.genome.bodyLength * 1.5)
		});
	}
}

/** Creates one bounded pose snapshot; the phenotype and genome remain untouched. */
export function createCreaturePose(
	phenotype: CreaturePhenotype,
	options: CreateCreaturePoseOptions = {}
): ChitinPose {
	const threat = clamp(finite(options.threat), 0, 1);
	const pose: ChitinPose = {
		time: Math.max(0, finite(options.genomeTime)),
		genomeTime: Math.max(0, finite(options.genomeTime)),
		gaitTime: Math.max(0, finite(options.gaitTime)),
		idleTime: Math.max(0, finite(options.idleTime)),
		limbs: [],
		flexible: new Map(),
		bodyOffset: { x: 0, y: 0 },
		threat,
		threatTarget: threat,
		startle: clamp(finite(options.startle), 0, 1),
		paused: options.paused === true
	};
	updateBodyOffset(phenotype, pose);
	synchronizeTopology(phenotype, pose);
	return pose;
}

/**
 * Advances a pose in place. Work, dt, limbs and chains are all hard-capped;
 * paused frames do not advance clocks, easing, IK, or Verlet state.
 */
export function updateCreaturePose(
	pose: ChitinPose,
	phenotype: CreaturePhenotype,
	options: UpdateCreaturePoseOptions
): PoseUpdateResult {
	pose.paused = options.paused ?? pose.paused;
	if (options.threat !== undefined) {
		pose.threatTarget = clamp(
			typeof options.threat === 'boolean' ? (options.threat ? 1 : 0) : finite(options.threat),
			0,
			1
		);
	}
	if (options.startle) {
		const requested =
			typeof options.startle === 'boolean' ? 1 : clamp(finite(options.startle), 0, 1);
		pose.startle = Math.max(
			pose.startle,
			requested * clamp(finite(phenotype.genome.startle, 1), 0, 1)
		);
	}

	const topology = synchronizeTopology(phenotype, pose);
	const maxDeltaTime = clamp(
		Math.abs(finite(options.maxDeltaTime, MAX_DELTA_TIME)),
		1 / 1_000,
		0.1
	);
	const fixedStep = clamp(Math.abs(finite(options.fixedStep, 1 / 30)), 1 / 240, maxDeltaTime);
	const requestedDelta = clamp(Math.abs(finite(options.deltaTime)), 0, maxDeltaTime);
	const deltaTime = options.singleStep
		? fixedStep
		: pose.paused || options.reducedMotion
			? 0
			: requestedDelta;
	if (deltaTime <= 0) {
		return { pose, deltaTime: 0, advanced: false, ...topology };
	}

	pose.genomeTime = Math.max(0, pose.genomeTime + deltaTime);
	pose.gaitTime = Math.max(0, pose.gaitTime + deltaTime);
	pose.idleTime = Math.max(0, pose.idleTime + deltaTime);
	pose.time = pose.genomeTime;
	const quickTransition = options.reducedMotion === true;
	pose.threat = quickTransition
		? pose.threatTarget
		: transition(pose.threat, pose.threatTarget, deltaTime, 7.5);
	pose.startle = quickTransition ? 0 : transition(pose.startle, 0, deltaTime, 9.5);
	updateBodyOffset(phenotype, pose);

	const nextLimbs: ChitinLimbPose[] = [];
	for (const limb of phenotype.limbs.slice(0, MAX_LIMBS)) {
		const previous = pose.limbs.find((candidate) => candidate.id === limb.id) as
			| ChitinLimbPose
			| undefined;
		nextLimbs.push(sampleLimb(phenotype, pose, limb, previous));
	}
	pose.limbs = nextLimbs;
	updateFlexible(phenotype, pose, deltaTime);
	return { pose, deltaTime, advanced: true, ...topology };
}
