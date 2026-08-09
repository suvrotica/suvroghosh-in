import type { MutableVec2, Vec2 } from './types';

const EPSILON = 1e-9;
const MIN_BONE_LENGTH = 1e-5;
const MAX_BONE_LENGTH = 100_000;
const MAX_BONES = 32;
const MAX_COORDINATE = 1_000_000;

/**
 * Bend magnitudes are radians relative to the preceding bone. The solver applies
 * their sign through preferredBend, so the same phenotype limit mirrors cleanly.
 */
export type FabrikJointLimit = Readonly<{
	minimum: number;
	maximum: number;
}>;

export type FabrikOptions = Readonly<{
	maxIterations?: number;
	tolerance?: number;
	preferredBend?: -1 | 1;
	jointLimits?: readonly FabrikJointLimit[];
	initialJoints?: readonly Vec2[];
	enforcePreferredBend?: boolean;
}>;

export type FabrikResult = Readonly<{
	joints: MutableVec2[];
	target: Vec2;
	boneLengths: readonly number[];
	reached: boolean;
	unreachable: boolean;
	iterations: number;
	error: number;
	repaired: boolean;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function boundedInteger(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return clamp(Math.round(value), minimum, maximum);
}

function finiteCoordinate(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? clamp(value, -MAX_COORDINATE, MAX_COORDINATE)
		: fallback;
}

function repairPoint(value: Vec2, fallback: Vec2): MutableVec2 {
	return {
		x: finiteCoordinate((value as Partial<Vec2> | null | undefined)?.x, fallback.x),
		y: finiteCoordinate((value as Partial<Vec2> | null | undefined)?.y, fallback.y)
	};
}

function magnitude(x: number, y: number): number {
	return Math.hypot(x, y);
}

function distance(left: Vec2, right: Vec2): number {
	return magnitude(right.x - left.x, right.y - left.y);
}

function direction(from: Vec2, to: Vec2, fallbackX: number, fallbackY: number): MutableVec2 {
	const x = to.x - from.x;
	const y = to.y - from.y;
	const length = magnitude(x, y);
	if (Number.isFinite(length) && length > EPSILON) return { x: x / length, y: y / length };
	const fallbackLength = magnitude(fallbackX, fallbackY);
	return fallbackLength > EPSILON
		? { x: fallbackX / fallbackLength, y: fallbackY / fallbackLength }
		: { x: 1, y: 0 };
}

function wrapAngle(angle: number): number {
	if (!Number.isFinite(angle)) return 0;
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function sanitizedLengths(lengths: readonly number[]): { lengths: number[]; repaired: boolean } {
	const bounded = lengths.slice(0, MAX_BONES);
	let repaired = bounded.length !== lengths.length;
	const result = bounded.map((value) => {
		const next =
			typeof value === 'number' && Number.isFinite(value)
				? clamp(Math.abs(value), MIN_BONE_LENGTH, MAX_BONE_LENGTH)
				: 1;
		if (next !== value) repaired = true;
		return next;
	});
	return { lengths: result, repaired };
}

function initializeJoints(
	root: Vec2,
	target: Vec2,
	lengths: readonly number[],
	preferredBend: -1 | 1,
	initialJoints?: readonly Vec2[]
): { joints: MutableVec2[]; repaired: boolean } {
	const count = lengths.length + 1;
	if (initialJoints?.length === count) {
		const repaired: MutableVec2[] = [repairPoint(initialJoints[0], root)];
		let changed = repaired[0].x !== initialJoints[0].x || repaired[0].y !== initialJoints[0].y;
		repaired[0] = { ...root };
		for (let index = 0; index < lengths.length; index += 1) {
			const candidate = repairPoint(initialJoints[index + 1], repaired[index]);
			const fallbackAngle = preferredBend * (index + 1) * 0.07;
			const unit = direction(
				repaired[index],
				candidate,
				Math.cos(fallbackAngle),
				Math.sin(fallbackAngle)
			);
			repaired.push({
				x: repaired[index].x + unit.x * lengths[index],
				y: repaired[index].y + unit.y * lengths[index]
			});
			if (
				candidate.x !== initialJoints[index + 1].x ||
				candidate.y !== initialJoints[index + 1].y
			) {
				changed = true;
			}
		}
		return { joints: repaired, repaired: changed };
	}

	const rootToTarget = direction(root, target, 1, 0);
	const perpendicular = { x: -rootToTarget.y * preferredBend, y: rootToTarget.x * preferredBend };
	const totalLength = lengths.reduce((sum, value) => sum + value, 0);
	const targetDistance = distance(root, target);
	const arcHeight = Math.min(
		totalLength * 0.28,
		Math.max(
			totalLength * 0.06,
			Math.sqrt(Math.max(0, totalLength ** 2 - targetDistance ** 2)) * 0.35
		)
	);
	const candidates: MutableVec2[] = [];
	for (let index = 0; index < count; index += 1) {
		const fraction = count <= 1 ? 0 : index / (count - 1);
		const along = targetDistance * fraction;
		const lift = index === count - 1 ? 0 : Math.sin(Math.PI * fraction) * arcHeight;
		candidates.push({
			x: root.x + rootToTarget.x * along + perpendicular.x * lift,
			y: root.y + rootToTarget.y * along + perpendicular.y * lift
		});
	}

	// The curve above only chooses a deterministic solution basin. Project it onto
	// the bone-length constraints before measuring target error; otherwise its final
	// candidate already equals the target and FABRIK can incorrectly exit early.
	const joints: MutableVec2[] = [{ ...root }];
	for (let index = 0; index < lengths.length; index += 1) {
		const parent = joints[index];
		const unit = direction(
			parent,
			candidates[index + 1],
			rootToTarget.x,
			rootToTarget.y + preferredBend * 1e-3 * (index + 1)
		);
		joints.push({
			x: parent.x + unit.x * lengths[index],
			y: parent.y + unit.y * lengths[index]
		});
	}
	return { joints, repaired: false };
}

function repairedLimit(limit: FabrikJointLimit | undefined): FabrikJointLimit | null {
	if (!limit) return null;
	const rawMinimum = Number.isFinite(limit.minimum) ? Math.abs(limit.minimum) : 0;
	const rawMaximum = Number.isFinite(limit.maximum) ? Math.abs(limit.maximum) : Math.PI;
	const minimum = clamp(Math.min(rawMinimum, rawMaximum), 0, Math.PI - 1e-5);
	const maximum = clamp(Math.max(rawMinimum, rawMaximum), minimum, Math.PI - 1e-5);
	return { minimum, maximum };
}

function applyJointLimits(
	joints: MutableVec2[],
	lengths: readonly number[],
	preferredBend: -1 | 1,
	limits: readonly FabrikJointLimit[],
	enforcePreferredBend: boolean
): void {
	if (joints.length < 3) return;
	let previousAngle = Math.atan2(joints[1].y - joints[0].y, joints[1].x - joints[0].x);

	for (let jointIndex = 1; jointIndex < joints.length - 1; jointIndex += 1) {
		const current = joints[jointIndex];
		const child = joints[jointIndex + 1];
		const desiredAngle = Math.atan2(child.y - current.y, child.x - current.x);
		const rawBend = wrapAngle(desiredAngle - previousAngle);
		const limit = repairedLimit(limits[jointIndex - 1]);
		let constrainedBend = rawBend;

		if (limit) {
			constrainedBend = preferredBend * clamp(Math.abs(rawBend), limit.minimum, limit.maximum);
		} else if (
			enforcePreferredBend &&
			jointIndex === 1 &&
			Math.abs(rawBend) > 1e-7 &&
			rawBend * preferredBend < 0
		) {
			constrainedBend = -rawBend;
		}

		const nextAngle = previousAngle + constrainedBend;
		const length = lengths[jointIndex];
		joints[jointIndex + 1] = {
			x: current.x + Math.cos(nextAngle) * length,
			y: current.y + Math.sin(nextAngle) * length
		};
		previousAngle = nextAngle;
	}
}

function finiteJoints(joints: readonly Vec2[]): boolean {
	return joints.every((joint) => Number.isFinite(joint.x) && Number.isFinite(joint.y));
}

export function jointBendAngle(joints: readonly Vec2[], jointIndex: number): number {
	if (jointIndex <= 0 || jointIndex >= joints.length - 1) return 0;
	const incoming = {
		x: joints[jointIndex].x - joints[jointIndex - 1].x,
		y: joints[jointIndex].y - joints[jointIndex - 1].y
	};
	const outgoing = {
		x: joints[jointIndex + 1].x - joints[jointIndex].x,
		y: joints[jointIndex + 1].y - joints[jointIndex].y
	};
	return wrapAngle(Math.atan2(outgoing.y, outgoing.x) - Math.atan2(incoming.y, incoming.x));
}

/** Bounded FABRIK with fixed root, exact bone lengths, and mirrored bend limits. */
export function solveFabrik(
	rootInput: Vec2,
	targetInput: Vec2,
	boneLengthsInput: readonly number[],
	options: FabrikOptions = {}
): FabrikResult {
	const root = repairPoint(rootInput, { x: 0, y: 0 });
	const target = repairPoint(targetInput, root);
	const lengthRepair = sanitizedLengths(boneLengthsInput);
	const boneLengths = lengthRepair.lengths;
	const preferredBend = options.preferredBend === -1 ? -1 : 1;
	const tolerance = clamp(
		Number.isFinite(options.tolerance) ? Math.abs(options.tolerance as number) : 1e-4,
		1e-8,
		1
	);
	const maxIterations = boundedInteger(options.maxIterations, 24, 1, 64);
	const totalLength = boneLengths.reduce((sum, value) => sum + value, 0);
	const rootTargetDistance = distance(root, target);
	let repaired =
		lengthRepair.repaired ||
		root.x !== rootInput.x ||
		root.y !== rootInput.y ||
		target.x !== targetInput.x ||
		target.y !== targetInput.y;

	if (boneLengths.length === 0) {
		const error = rootTargetDistance;
		return {
			joints: [{ ...root }],
			target,
			boneLengths,
			reached: error <= tolerance,
			unreachable: error > tolerance,
			iterations: 0,
			error,
			repaired
		};
	}

	const initialized = initializeJoints(
		root,
		target,
		boneLengths,
		preferredBend,
		options.initialJoints
	);
	let joints = initialized.joints;
	repaired ||= initialized.repaired;

	if (rootTargetDistance >= totalLength - tolerance) {
		const unit = direction(root, target, 1, 0);
		joints = [{ ...root }];
		for (let index = 0; index < boneLengths.length; index += 1) {
			const previous = joints[index];
			joints.push({
				x: previous.x + unit.x * boneLengths[index],
				y: previous.y + unit.y * boneLengths[index]
			});
		}
		const error = distance(joints[joints.length - 1], target);
		return {
			joints,
			target,
			boneLengths,
			reached: error <= tolerance,
			unreachable: rootTargetDistance > totalLength + tolerance,
			iterations: 0,
			error,
			repaired
		};
	}

	let error = distance(joints[joints.length - 1], target);
	let iterations = 0;
	const limits = options.jointLimits ?? [];
	const rootDirection = direction(root, target, 1, 0);

	for (let iteration = 0; iteration < maxIterations && error > tolerance; iteration += 1) {
		iterations = iteration + 1;
		joints[joints.length - 1] = { ...target };

		for (let index = joints.length - 2; index >= 0; index -= 1) {
			const child = joints[index + 1];
			const unit = direction(
				child,
				joints[index],
				-rootDirection.x,
				-rootDirection.y + preferredBend * 1e-3 * (index + 1)
			);
			joints[index] = {
				x: child.x + unit.x * boneLengths[index],
				y: child.y + unit.y * boneLengths[index]
			};
		}

		joints[0] = { ...root };
		for (let index = 0; index < boneLengths.length; index += 1) {
			const parent = joints[index];
			const unit = direction(
				parent,
				joints[index + 1],
				rootDirection.x,
				rootDirection.y + preferredBend * 1e-3 * (index + 1)
			);
			joints[index + 1] = {
				x: parent.x + unit.x * boneLengths[index],
				y: parent.y + unit.y * boneLengths[index]
			};
		}

		applyJointLimits(
			joints,
			boneLengths,
			preferredBend,
			limits,
			options.enforcePreferredBend === true
		);
		error = distance(joints[joints.length - 1], target);

		if (!finiteJoints(joints)) {
			const reset = initializeJoints(root, target, boneLengths, preferredBend);
			joints = reset.joints;
			repaired = true;
			error = distance(joints[joints.length - 1], target);
		}
	}

	return {
		joints,
		target,
		boneLengths,
		reached: error <= tolerance,
		unreachable: false,
		iterations,
		error,
		repaired
	};
}
