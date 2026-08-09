import {
	CAPSULE_INSTANCE_OFFSET,
	CAPSULE_INSTANCE_STRIDE,
	DEFAULT_MAX_CAPSULE_INSTANCES,
	DEFAULT_MAX_PLATE_INSTANCES,
	HARD_MAX_CAPSULE_INSTANCES,
	HARD_MAX_PLATE_INSTANCES,
	PLATE_INSTANCE_OFFSET,
	PLATE_INSTANCE_STRIDE,
	materialIndex
} from './webgl-renderer';
import type {
	BodyPlate,
	CreaturePhenotype,
	CreaturePose,
	FlexibleAppendagePhenotype,
	LimbPhenotype,
	LimbPose,
	RenderPacket,
	SurfaceSample,
	Vec2,
	ViewMode,
	WingPhenotype
} from './types';

const MAX_COORDINATE = 1_000_000;
const MAX_SURFACE_INSTANCES = 2_048;
const MAX_CLAWS_PER_LIMB = 8;

export const RENDER_LAYER = Object.freeze({
	farWing: -5,
	farAppendage: -4,
	farSurface: -3,
	membrane: -2,
	body: 0,
	nearAppendage: 1,
	foregroundAppendage: 2,
	eye: 3,
	surface: 4,
	overlay: 5
} as const);

export const CAPSULE_KIND = Object.freeze({
	limb: 0,
	flexible: 1,
	surface: 2,
	claw: 3,
	wingVein: 4,
	overlay: 5
} as const);

export type RenderPacketCapacityOptions = Readonly<{
	plateCapacity?: number;
	capsuleCapacity?: number;
	view?: ViewMode;
	selectedSegment?: number;
}>;

export type RenderPacketFillOptions = Readonly<{
	view?: ViewMode;
	selectedSegment?: number;
	includeOverlays?: boolean;
	maxSurfaceInstances?: number;
}>;

export type RenderPacketBuildStats = Readonly<{
	plateCount: number;
	capsuleCount: number;
	requestedPlateCount: number;
	requestedCapsuleCount: number;
	plateCapacity: number;
	capsuleCapacity: number;
	truncated: boolean;
}>;

type PlateRecord = Readonly<{
	centerX: number;
	centerY: number;
	halfWidth: number;
	halfHeight: number;
	rotation: number;
	depth: number;
	exponent: number;
	lobeAmplitude: number;
	lobeCount: number;
	ridge: number;
	seed: number;
	damage: number;
	material: number;
	opacity: number;
	emission: number;
	layer: number;
	segmentIndex: number;
	selected: number;
	region: number;
	membrane: number;
}>;

type CapsuleRecord = Readonly<{
	startX: number;
	startY: number;
	endX: number;
	endY: number;
	radiusStart: number;
	radiusEnd: number;
	depth: number;
	jointEmphasis: number;
	material: number;
	seed: number;
	opacity: number;
	emission: number;
	layer: number;
	kind: number;
	phase: number;
	planted: number;
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

function boundedInteger(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	return clamp(Math.round(finite(value, fallback)), minimum, maximum);
}

function unit(from: Vec2, to: Vec2): Vec2 {
	const x = finite(to.x) - finite(from.x);
	const y = finite(to.y) - finite(from.y);
	const length = Math.hypot(x, y);
	return length > 1e-9 ? { x: x / length, y: y / length } : { x: 1, y: 0 };
}

function localPlatePoint(plate: BodyPlate, pose: CreaturePose, local: Vec2): Vec2 {
	// Phenotype-builder emits eyes and surface samples as plate-local offsets in
	// world units (the plate dimensions were already applied during sampling).
	const x = finite(local.x);
	const y = finite(local.y);
	const cosine = Math.cos(finite(plate.rotation));
	const sine = Math.sin(finite(plate.rotation));
	return {
		x: coordinate(plate.center.x) + pose.bodyOffset.x + x * cosine - y * sine,
		y: coordinate(plate.center.y) + pose.bodyOffset.y + x * sine + y * cosine
	};
}

function surfaceWorldScale(sample: SurfaceSample, plate: BodyPlate): number {
	// SurfaceSample.scale is a dimensionless mark multiplier. Convert it once
	// against the plate's smaller physical dimension, matching Canvas2D.
	const plateScale = Math.max(
		0.0001,
		Math.min(Math.abs(finite(plate.width)), Math.abs(finite(plate.height)))
	);
	return clamp(plateScale * 0.04 * Math.abs(finite(sample.scale, 0.5)), 0.0001, plateScale * 0.3);
}

function writePlate(target: Float32Array, index: number, record: PlateRecord): void {
	const offset = index * PLATE_INSTANCE_STRIDE;
	target.fill(0, offset, offset + PLATE_INSTANCE_STRIDE);
	target[offset + PLATE_INSTANCE_OFFSET.centerX] = coordinate(record.centerX);
	target[offset + PLATE_INSTANCE_OFFSET.centerY] = coordinate(record.centerY);
	target[offset + PLATE_INSTANCE_OFFSET.halfWidth] = clamp(
		Math.abs(finite(record.halfWidth)),
		0.0001,
		MAX_COORDINATE
	);
	target[offset + PLATE_INSTANCE_OFFSET.halfHeight] = clamp(
		Math.abs(finite(record.halfHeight)),
		0.0001,
		MAX_COORDINATE
	);
	target[offset + PLATE_INSTANCE_OFFSET.rotation] = finite(record.rotation);
	target[offset + PLATE_INSTANCE_OFFSET.depth] = clamp(finite(record.depth), -100, 100);
	target[offset + PLATE_INSTANCE_OFFSET.exponent] = clamp(finite(record.exponent, 2), 0.72, 8);
	target[offset + PLATE_INSTANCE_OFFSET.lobeAmplitude] = clamp(
		finite(record.lobeAmplitude),
		-0.24,
		0.24
	);
	target[offset + PLATE_INSTANCE_OFFSET.lobeCount] = clamp(finite(record.lobeCount, 1), 1, 64);
	target[offset + PLATE_INSTANCE_OFFSET.ridge] = clamp(finite(record.ridge), 0, 1);
	target[offset + PLATE_INSTANCE_OFFSET.seed] = finite(record.seed);
	target[offset + PLATE_INSTANCE_OFFSET.damage] = clamp(finite(record.damage), 0, 1);
	target[offset + PLATE_INSTANCE_OFFSET.materialIndex] = finite(record.material);
	target[offset + PLATE_INSTANCE_OFFSET.opacity] = clamp(finite(record.opacity, 1), 0, 1);
	target[offset + PLATE_INSTANCE_OFFSET.emission] = clamp(finite(record.emission), 0, 1);
	target[offset + PLATE_INSTANCE_OFFSET.layer] = finite(record.layer);
	target[offset + PLATE_INSTANCE_OFFSET.segmentIndex] = Math.round(finite(record.segmentIndex, -1));
	target[offset + PLATE_INSTANCE_OFFSET.selected] = clamp(finite(record.selected), 0, 1);
	target[offset + PLATE_INSTANCE_OFFSET.region] = Math.round(finite(record.region));
	target[offset + PLATE_INSTANCE_OFFSET.membrane] = clamp(finite(record.membrane), 0, 1);
}

function writeCapsule(target: Float32Array, index: number, record: CapsuleRecord): void {
	const offset = index * CAPSULE_INSTANCE_STRIDE;
	target.fill(0, offset, offset + CAPSULE_INSTANCE_STRIDE);
	target[offset + CAPSULE_INSTANCE_OFFSET.startX] = coordinate(record.startX);
	target[offset + CAPSULE_INSTANCE_OFFSET.startY] = coordinate(record.startY);
	target[offset + CAPSULE_INSTANCE_OFFSET.endX] = coordinate(record.endX);
	target[offset + CAPSULE_INSTANCE_OFFSET.endY] = coordinate(record.endY);
	target[offset + CAPSULE_INSTANCE_OFFSET.radiusStart] = clamp(
		Math.abs(finite(record.radiusStart)),
		0.0001,
		MAX_COORDINATE
	);
	target[offset + CAPSULE_INSTANCE_OFFSET.radiusEnd] = clamp(
		Math.abs(finite(record.radiusEnd)),
		0.0001,
		MAX_COORDINATE
	);
	target[offset + CAPSULE_INSTANCE_OFFSET.depth] = clamp(finite(record.depth), -100, 100);
	target[offset + CAPSULE_INSTANCE_OFFSET.jointEmphasis] = clamp(
		Math.abs(finite(record.jointEmphasis)),
		0,
		MAX_COORDINATE
	);
	target[offset + CAPSULE_INSTANCE_OFFSET.materialIndex] = finite(record.material);
	target[offset + CAPSULE_INSTANCE_OFFSET.seed] = finite(record.seed);
	target[offset + CAPSULE_INSTANCE_OFFSET.opacity] = clamp(finite(record.opacity, 1), 0, 1);
	target[offset + CAPSULE_INSTANCE_OFFSET.emission] = clamp(finite(record.emission), 0, 1);
	target[offset + CAPSULE_INSTANCE_OFFSET.layer] = finite(record.layer);
	target[offset + CAPSULE_INSTANCE_OFFSET.kind] = finite(record.kind);
	target[offset + CAPSULE_INSTANCE_OFFSET.phase] = finite(record.phase);
	target[offset + CAPSULE_INSTANCE_OFFSET.planted] = clamp(finite(record.planted), 0, 1);
}

/** Allocates fixed backing stores once; fillRenderPacket reuses both arrays. */
export function createRenderPacket(options: RenderPacketCapacityOptions = {}): RenderPacket {
	const plateCapacity = boundedInteger(
		options.plateCapacity,
		DEFAULT_MAX_PLATE_INSTANCES,
		0,
		HARD_MAX_PLATE_INSTANCES
	);
	const capsuleCapacity = boundedInteger(
		options.capsuleCapacity,
		DEFAULT_MAX_CAPSULE_INSTANCES,
		0,
		HARD_MAX_CAPSULE_INSTANCES
	);
	return {
		plates: new Float32Array(plateCapacity * PLATE_INSTANCE_STRIDE),
		plateCount: 0,
		capsules: new Float32Array(capsuleCapacity * CAPSULE_INSTANCE_STRIDE),
		capsuleCount: 0,
		view: options.view ?? 'specimen',
		selectedSegment: boundedInteger(options.selectedSegment, -1, -1, 4_096)
	};
}

function wingBounds(
	wing: WingPhenotype,
	rootPlate: BodyPlate,
	pose: CreaturePose
): PlateRecord | null {
	if (wing.outline.length < 3) return null;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const point of wing.outline.slice(0, 256)) {
		const transformed = localPlatePoint(rootPlate, pose, point);
		const { x, y } = transformed;
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
	return {
		centerX: (minX + maxX) * 0.5,
		centerY: (minY + maxY) * 0.5,
		halfWidth: Math.max((maxX - minX) * 0.5, 0.001),
		halfHeight: Math.max((maxY - minY) * 0.5, 0.001),
		rotation: 0,
		depth: wing.depth,
		exponent: 1.35,
		lobeAmplitude: 0.04,
		lobeCount: 3,
		ridge: 0.08,
		seed: wing.rootSegment * 0.173,
		damage: 0,
		material: 0,
		opacity: 0.22,
		emission: 0.1,
		layer: RENDER_LAYER.farWing,
		segmentIndex: wing.rootSegment,
		selected: 0,
		region: 0,
		membrane: 1
	};
}

function membraneBetween(
	left: BodyPlate,
	right: BodyPlate,
	pose: CreaturePose,
	material: number,
	opacity: number,
	selectedSegment: number
): PlateRecord {
	const leftCenter = {
		x: coordinate(left.center.x) + pose.bodyOffset.x,
		y: coordinate(left.center.y) + pose.bodyOffset.y
	};
	const rightCenter = {
		x: coordinate(right.center.x) + pose.bodyOffset.x,
		y: coordinate(right.center.y) + pose.bodyOffset.y
	};
	const distance = Math.hypot(rightCenter.x - leftCenter.x, rightCenter.y - leftCenter.y);
	return {
		centerX: (leftCenter.x + rightCenter.x) * 0.5,
		centerY: (leftCenter.y + rightCenter.y) * 0.5,
		halfWidth: Math.max(distance * 0.55, Math.min(left.width, right.width) * 0.18),
		halfHeight: Math.max(0.001, Math.min(Math.abs(left.height), Math.abs(right.height)) * 0.3),
		rotation: Math.atan2(rightCenter.y - leftCenter.y, rightCenter.x - leftCenter.x),
		depth: Math.min(left.depth, right.depth) - 0.015,
		exponent: 2,
		lobeAmplitude: 0.025,
		lobeCount: 3,
		ridge: 0,
		seed: (left.seed + right.seed) * 0.5,
		damage: Math.max(left.damage, right.damage) * 0.25,
		material,
		opacity,
		emission: 0.06,
		layer: RENDER_LAYER.membrane,
		segmentIndex: right.segmentIndex,
		selected: right.segmentIndex === selectedSegment ? 1 : 0,
		region: right.region,
		membrane: 1
	};
}

function bodyPlateRecord(
	plate: BodyPlate,
	pose: CreaturePose,
	material: number,
	selectedSegment: number
): PlateRecord {
	return {
		centerX: coordinate(plate.center.x) + pose.bodyOffset.x,
		centerY: coordinate(plate.center.y) + pose.bodyOffset.y,
		halfWidth: Math.abs(finite(plate.width)) * 0.5,
		halfHeight: Math.abs(finite(plate.height)) * 0.5,
		rotation: plate.rotation,
		depth: plate.depth,
		exponent: plate.exponent,
		lobeAmplitude: plate.lobeAmplitude,
		lobeCount: plate.lobeCount,
		ridge: plate.ridge,
		seed: plate.seed,
		damage: plate.damage,
		material,
		opacity: 1,
		emission: plate.ridge,
		layer: RENDER_LAYER.body,
		segmentIndex: plate.segmentIndex,
		selected: plate.selected || plate.segmentIndex === selectedSegment ? 1 : 0,
		region: plate.region,
		membrane: 0
	};
}

function surfacePlateRecord(
	sample: SurfaceSample,
	plate: BodyPlate,
	pose: CreaturePose,
	material: number
): PlateRecord {
	const center = localPlatePoint(plate, pose, sample.local);
	const scale = surfaceWorldScale(sample, plate);
	return {
		centerX: center.x,
		centerY: center.y,
		halfWidth: scale * (sample.kind === 'pit' ? 0.58 : 0.36),
		halfHeight: scale * (sample.kind === 'pit' ? 0.58 : 0.36),
		rotation: sample.angle,
		depth: plate.depth + 0.02,
		exponent: 2,
		lobeAmplitude: 0,
		lobeCount: 1,
		ridge: sample.kind === 'pit' ? 0.2 : 0.6,
		seed: plate.seed + sample.angle,
		damage: sample.kind === 'pit' ? 0.5 : 0,
		material,
		opacity: 0.82,
		emission: sample.kind === 'pore' ? 0.72 : 0.05,
		layer: RENDER_LAYER.surface,
		segmentIndex: plate.segmentIndex,
		selected: 0,
		region: plate.region,
		membrane: 0
	};
}

function emitLimbSegments(
	emit: (record: CapsuleRecord) => void,
	limb: LimbPhenotype,
	limbPose: LimbPose,
	material: number,
	layer: number
): void {
	const segmentCount = Math.min(limbPose.joints.length - 1, limb.boneLengths.length, 32);
	for (let index = 0; index < segmentCount; index += 1) {
		const start = limbPose.joints[index];
		const end = limbPose.joints[index + 1];
		const radiusStart = Math.max(
			0.001,
			Math.abs(finite(limb.thicknesses[index], limb.thicknesses.at(-1) ?? 0.01))
		);
		const radiusEnd = Math.max(
			0.001,
			Math.abs(finite(limb.thicknesses[index + 1], radiusStart * 0.72))
		);
		emit({
			startX: start.x,
			startY: start.y,
			endX: end.x,
			endY: end.y,
			radiusStart,
			radiusEnd,
			depth: limb.depth,
			jointEmphasis: Math.min(radiusStart, radiusEnd) * 0.32,
			material,
			seed: limb.pairIndex * 17 + index * 0.37 + (limb.side > 0 ? 0.13 : 0.71),
			opacity: 1,
			emission: limb.kind === 'grasping' ? 0.16 : 0.02,
			layer,
			kind: CAPSULE_KIND.limb,
			phase: limbPose.phase,
			planted: limbPose.planted ? 1 : 0
		});
	}
}

function emitClaws(
	emit: (record: CapsuleRecord) => void,
	limb: LimbPhenotype,
	limbPose: LimbPose,
	material: number
): void {
	if (limbPose.joints.length < 2) return;
	const end = limbPose.joints[limbPose.joints.length - 1];
	const previous = limbPose.joints[limbPose.joints.length - 2];
	const direction = unit(previous, end);
	const clawCount = boundedInteger(limb.clawCount, 0, 0, MAX_CLAWS_PER_LIMB);
	const baseLength = clamp(Math.abs(finite(limb.boneLengths.at(-1), 0.1)) * 0.18, 0.004, 10);
	const radius = Math.max(0.0005, Math.abs(finite(limb.thicknesses.at(-1), 0.01)) * 0.42);
	for (let claw = 0; claw < clawCount; claw += 1) {
		const spread = clawCount <= 1 ? 0 : (claw / (clawCount - 1) - 0.5) * 0.82;
		const cosine = Math.cos(spread);
		const sine = Math.sin(spread);
		const dx = direction.x * cosine - direction.y * sine * limb.side;
		const dy = direction.x * sine * limb.side + direction.y * cosine;
		emit({
			startX: end.x,
			startY: end.y,
			endX: end.x + dx * baseLength,
			endY: end.y + dy * baseLength,
			radiusStart: radius,
			radiusEnd: radius * 0.08,
			depth: limb.depth + 0.025,
			jointEmphasis: 0,
			material,
			seed: limb.pairIndex * 31 + claw * 0.41,
			opacity: 1,
			emission: limb.kind === 'grasping' ? 0.2 : 0,
			layer: RENDER_LAYER.foregroundAppendage,
			kind: CAPSULE_KIND.claw,
			phase: limbPose.phase,
			planted: limbPose.planted ? 1 : 0
		});
	}
}

function emitFlexible(
	emit: (record: CapsuleRecord) => void,
	appendage: FlexibleAppendagePhenotype,
	pose: CreaturePose,
	material: number,
	layer: number,
	baseRadius: number
): void {
	const state = pose.flexible.get(appendage.id);
	if (!state) return;
	const segmentCount = Math.min(state.count - 1, state.lengths.length, 128);
	for (let index = 0; index < segmentCount; index += 1) {
		const fraction = segmentCount <= 1 ? 0 : index / (segmentCount - 1);
		emit({
			startX: state.positions[index * 2],
			startY: state.positions[index * 2 + 1],
			endX: state.positions[index * 2 + 2],
			endY: state.positions[index * 2 + 3],
			radiusStart: baseRadius * (1 - fraction * 0.65),
			radiusEnd: baseRadius * (1 - Math.min(1, fraction + 1 / Math.max(1, segmentCount)) * 0.65),
			depth: appendage.depth,
			jointEmphasis: baseRadius * 0.08,
			material,
			seed: index * 0.29 + appendage.rootSegment * 7,
			opacity: 0.9,
			emission: appendage.kind === 'lure' ? 0.7 : 0.03,
			layer,
			kind: CAPSULE_KIND.flexible,
			phase: 0,
			planted: 0
		});
	}
}

function emitSurfaceCapsule(
	emit: (record: CapsuleRecord) => void,
	sample: SurfaceSample,
	plate: BodyPlate,
	pose: CreaturePose,
	material: number,
	layer: number
): void {
	const start = localPlatePoint(plate, pose, sample.local);
	const scale = surfaceWorldScale(sample, plate);
	const angle = finite(sample.angle) + finite(plate.rotation);
	const length = scale * (sample.kind === 'spine' ? 2.8 : 1.7);
	emit({
		startX: start.x,
		startY: start.y,
		endX: start.x + Math.cos(angle) * length,
		endY: start.y + Math.sin(angle) * length,
		radiusStart: scale * (sample.kind === 'spine' ? 0.24 : 0.14),
		radiusEnd: scale * 0.025,
		depth: plate.depth + 0.018,
		jointEmphasis: 0,
		material,
		seed: plate.seed + sample.angle,
		opacity: 0.86,
		emission: sample.kind === 'spine' ? 0.05 : 0,
		layer,
		kind: CAPSULE_KIND.surface,
		phase: 0,
		planted: 0
	});
}

/** Fills an existing packet in deterministic layer order without replacing its arrays. */
export function fillRenderPacket(
	packet: RenderPacket,
	phenotype: CreaturePhenotype,
	pose: CreaturePose,
	options: RenderPacketFillOptions = {}
): RenderPacketBuildStats {
	const plateCapacity = Math.min(
		Math.floor(packet.plates.length / PLATE_INSTANCE_STRIDE),
		HARD_MAX_PLATE_INSTANCES
	);
	const capsuleCapacity = Math.min(
		Math.floor(packet.capsules.length / CAPSULE_INSTANCE_STRIDE),
		HARD_MAX_CAPSULE_INSTANCES
	);
	const previousPlateFloats = Math.min(
		packet.plates.length,
		packet.plateCount * PLATE_INSTANCE_STRIDE
	);
	const previousCapsuleFloats = Math.min(
		packet.capsules.length,
		packet.capsuleCount * CAPSULE_INSTANCE_STRIDE
	);
	packet.plates.fill(0, 0, previousPlateFloats);
	packet.capsules.fill(0, 0, previousCapsuleFloats);
	packet.plateCount = 0;
	packet.capsuleCount = 0;
	packet.view = options.view ?? packet.view;
	packet.selectedSegment = boundedInteger(
		options.selectedSegment,
		packet.selectedSegment,
		-1,
		4_096
	);

	let requestedPlateCount = 0;
	let requestedCapsuleCount = 0;
	const emitPlate = (record: PlateRecord): void => {
		if (requestedPlateCount < plateCapacity) writePlate(packet.plates, requestedPlateCount, record);
		requestedPlateCount += 1;
	};
	const emitCapsule = (record: CapsuleRecord): void => {
		if (requestedCapsuleCount < capsuleCapacity) {
			writeCapsule(packet.capsules, requestedCapsuleCount, record);
		}
		requestedCapsuleCount += 1;
	};
	const material = materialIndex(phenotype.genome.material);
	const membraneOpacity = clamp(phenotype.genome.membraneTranslucency, 0.04, 0.9);

	// Plate passes: distant wings -> membranes -> armour -> eyes -> samples -> overlays.
	for (const wing of phenotype.wings.slice(0, 128)) {
		const rootPlate = phenotype.plates.find(
			(candidate) => candidate.segmentIndex === wing.rootSegment
		);
		if (!rootPlate) continue;
		const record = wingBounds(wing, rootPlate, pose);
		if (record) emitPlate({ ...record, material, opacity: membraneOpacity });
	}
	const orderedPlates = phenotype.plates
		.slice(0, HARD_MAX_PLATE_INSTANCES)
		.sort((left, right) => left.segmentIndex - right.segmentIndex || left.depth - right.depth);
	for (let index = 0; index + 1 < orderedPlates.length; index += 1) {
		const left = orderedPlates[index];
		const right = orderedPlates[index + 1];
		if (left.segmentIndex === right.segmentIndex) continue;
		emitPlate(
			membraneBetween(left, right, pose, material, membraneOpacity, packet.selectedSegment)
		);
	}
	for (const plate of orderedPlates.slice().sort((left, right) => left.depth - right.depth)) {
		emitPlate(bodyPlateRecord(plate, pose, material, packet.selectedSegment));
	}
	for (const eye of phenotype.eyes.slice(0, 256)) {
		const plate = orderedPlates.find((candidate) => candidate.segmentIndex === eye.segmentIndex);
		if (!plate) continue;
		const center = localPlatePoint(plate, pose, eye.local);
		emitPlate({
			centerX: center.x,
			centerY: center.y,
			halfWidth: eye.radius,
			halfHeight: eye.radius,
			rotation: 0,
			depth: eye.depth,
			exponent: 2,
			lobeAmplitude: 0,
			lobeCount: 1,
			ridge: 0.3,
			seed: eye.seed,
			damage: 0,
			material,
			opacity: 1,
			emission: phenotype.genome.eyeEmission,
			layer: RENDER_LAYER.eye,
			segmentIndex: eye.segmentIndex,
			selected: eye.segmentIndex === packet.selectedSegment ? 1 : 0,
			region: plate.region,
			membrane: 0
		});
	}

	const maxSurfaceInstances = boundedInteger(
		options.maxSurfaceInstances,
		MAX_SURFACE_INSTANCES,
		0,
		MAX_SURFACE_INSTANCES
	);
	const surfaceSamples = phenotype.surfaceSamples.slice(0, maxSurfaceInstances);
	for (const sample of surfaceSamples) {
		if (sample.kind === 'bristle' || sample.kind === 'spine') continue;
		const plate = phenotype.plates[sample.plateIndex];
		if (plate) emitPlate(surfacePlateRecord(sample, plate, pose, material));
	}
	if (options.includeOverlays !== false && packet.view === 'gait') {
		for (const limbPose of pose.limbs.slice(0, 256)) {
			emitPlate({
				centerX: limbPose.target.x,
				centerY: limbPose.target.y,
				halfWidth: limbPose.planted ? 0.018 : 0.012,
				halfHeight: limbPose.planted ? 0.018 : 0.012,
				rotation: 0,
				depth: 0.12,
				exponent: 2,
				lobeAmplitude: 0,
				lobeCount: 1,
				ridge: 1,
				seed: limbPose.phase,
				damage: 0,
				material,
				opacity: 0.76,
				emission: limbPose.planted ? 0.9 : 0.35,
				layer: RENDER_LAYER.overlay,
				segmentIndex: -1,
				selected: 0,
				region: 0,
				membrane: 0
			});
		}
	}

	// Capsule passes follow the same explicit far-to-near ordering.
	for (const wing of phenotype.wings.slice(0, 128)) {
		const rootPlate = phenotype.plates.find(
			(candidate) => candidate.segmentIndex === wing.rootSegment
		);
		if (!rootPlate) continue;
		for (const vein of wing.veins.slice(0, 128)) {
			const start = localPlatePoint(rootPlate, pose, vein[0]);
			const end = localPlatePoint(rootPlate, pose, vein[1]);
			emitCapsule({
				startX: start.x,
				startY: start.y,
				endX: end.x,
				endY: end.y,
				radiusStart: 0.003,
				radiusEnd: 0.0015,
				depth: wing.depth + 0.005,
				jointEmphasis: 0,
				material,
				seed: wing.rootSegment + vein[0].x,
				opacity: membraneOpacity,
				emission: 0.14,
				layer: RENDER_LAYER.farWing,
				kind: CAPSULE_KIND.wingVein,
				phase: 0,
				planted: 0
			});
		}
	}
	const posedLimbs = phenotype.limbs
		.slice(0, 256)
		.map((limb) => ({ limb, pose: pose.limbs.find((candidate) => candidate.id === limb.id) }))
		.filter((entry): entry is { limb: LimbPhenotype; pose: LimbPose } => entry.pose !== undefined)
		.sort((left, right) => left.limb.depth - right.limb.depth);
	for (const entry of posedLimbs) {
		if (entry.limb.depth >= 0) continue;
		emitLimbSegments(emitCapsule, entry.limb, entry.pose, material, RENDER_LAYER.farAppendage);
	}
	for (const sample of surfaceSamples) {
		if (sample.kind !== 'bristle' && sample.kind !== 'spine') continue;
		const plate = phenotype.plates[sample.plateIndex];
		if (plate && plate.depth < 0) {
			emitSurfaceCapsule(emitCapsule, sample, plate, pose, material, RENDER_LAYER.farSurface);
		}
	}
	const orderedFlexible = phenotype.flexibleAppendages
		.slice(0, 96)
		.sort((left, right) => left.depth - right.depth);
	const flexibleRadius = Math.max(0.001, phenotype.genome.legThickness * 0.24);
	for (const appendage of orderedFlexible) {
		if (appendage.depth >= 0 || appendage.kind === 'palp') continue;
		emitFlexible(emitCapsule, appendage, pose, material, RENDER_LAYER.membrane, flexibleRadius);
	}
	for (const entry of posedLimbs) {
		if (entry.limb.depth < 0) continue;
		emitLimbSegments(emitCapsule, entry.limb, entry.pose, material, RENDER_LAYER.nearAppendage);
	}
	for (const appendage of orderedFlexible) {
		if (appendage.depth < 0 && appendage.kind !== 'palp') continue;
		emitFlexible(
			emitCapsule,
			appendage,
			pose,
			material,
			appendage.kind === 'palp' ? RENDER_LAYER.foregroundAppendage : RENDER_LAYER.nearAppendage,
			flexibleRadius
		);
	}
	for (const entry of posedLimbs) emitClaws(emitCapsule, entry.limb, entry.pose, material);
	for (const sample of surfaceSamples) {
		if (sample.kind !== 'bristle' && sample.kind !== 'spine') continue;
		const plate = phenotype.plates[sample.plateIndex];
		if (plate && plate.depth >= 0) {
			emitSurfaceCapsule(emitCapsule, sample, plate, pose, material, RENDER_LAYER.surface);
		}
	}
	if (options.includeOverlays !== false && packet.view === 'anatomy') {
		for (let index = 0; index + 1 < phenotype.axis.length && index < 1_023; index += 1) {
			const start = phenotype.axis[index];
			const end = phenotype.axis[index + 1];
			emitCapsule({
				startX: start.position.x + pose.bodyOffset.x,
				startY: start.position.y + pose.bodyOffset.y,
				endX: end.position.x + pose.bodyOffset.x,
				endY: end.position.y + pose.bodyOffset.y,
				radiusStart: 0.003,
				radiusEnd: 0.003,
				depth: Math.max(start.depth, end.depth) + 0.04,
				jointEmphasis: 0.002,
				material,
				seed: index * 0.19,
				opacity: 0.8,
				emission: 0.72,
				layer: RENDER_LAYER.overlay,
				kind: CAPSULE_KIND.overlay,
				phase: 0,
				planted: 0
			});
		}
	}

	packet.plateCount = Math.min(requestedPlateCount, plateCapacity);
	packet.capsuleCount = Math.min(requestedCapsuleCount, capsuleCapacity);
	return {
		plateCount: packet.plateCount,
		capsuleCount: packet.capsuleCount,
		requestedPlateCount,
		requestedCapsuleCount,
		plateCapacity,
		capsuleCapacity,
		truncated: requestedPlateCount > plateCapacity || requestedCapsuleCount > capsuleCapacity
	};
}

export function buildRenderPacket(
	phenotype: CreaturePhenotype,
	pose: CreaturePose,
	options: RenderPacketCapacityOptions & RenderPacketFillOptions = {}
): RenderPacket {
	const packet = createRenderPacket(options);
	fillRenderPacket(packet, phenotype, pose, options);
	return packet;
}

/** Clears live counts and stale used records while retaining allocated capacity. */
export function clearRenderPacket(packet: RenderPacket): void {
	packet.plates.fill(
		0,
		0,
		Math.min(packet.plates.length, packet.plateCount * PLATE_INSTANCE_STRIDE)
	);
	packet.capsules.fill(
		0,
		0,
		Math.min(packet.capsules.length, packet.capsuleCount * CAPSULE_INSTANCE_STRIDE)
	);
	packet.plateCount = 0;
	packet.capsuleCount = 0;
}
