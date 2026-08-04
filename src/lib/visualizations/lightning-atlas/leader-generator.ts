import { createPhaseEvents, ENGINE_LIMITS, SPEED_OF_SOUND_METRES_PER_SECOND } from './config';
import {
	createChargePockets,
	electricFieldProxy,
	fieldStrengthProxy,
	intraCloudDestination,
	rootForFlash,
	selectFlashType
} from './charge-field';
import { flashHash } from './hash';
import { SeededRandom } from './prng';
import {
	generateTerrain,
	normalizedToWorld,
	sampleTerrainHeight,
	sampleTerrainWetness
} from './terrain';
import { add, clamp, distance, dot, finiteVec3, lerp, normalize, scale, subtract } from './vectors';
import type {
	Attachment,
	AttachmentCandidate,
	AttachmentKind,
	ChargePocket,
	FlashType,
	GenerateFlashInput,
	LightningFlash,
	LightningSegment,
	SerializableAtlasState,
	StrikeScale,
	TerrainData,
	UpwardStreamer,
	Vec3
} from './types';

type ScoredAttachment = {
	candidate: AttachmentCandidate;
	score: number;
	weight: number;
};

type DirectionCandidate = {
	direction: Vec3;
	score: number;
};

type BranchTip = {
	position: Vec3;
	direction: Vec3;
	parentIndex: number;
	depth: number;
	energy: number;
	age: number;
};

type StrikeScaleProfile = {
	activeTipLimit: number;
	attachmentDelaySteps: number;
	branchEnergyBoost: number;
	branchRetentionBoost: number;
	branchSpawnMultiplier: number;
	forkSpawnMultiplier: number;
	lateralExploration: number;
	stepLengthMultiplier: number;
	thicknessMultiplier: number;
	brightnessMultiplier: number;
	intensityBoost: number;
};

const STRIKE_SCALE_PROFILES: Record<StrikeScale, StrikeScaleProfile> = {
	compact: {
		activeTipLimit: 6,
		attachmentDelaySteps: 0,
		branchEnergyBoost: -0.08,
		branchRetentionBoost: -0.05,
		branchSpawnMultiplier: 0.55,
		forkSpawnMultiplier: 0.45,
		lateralExploration: 0.72,
		stepLengthMultiplier: 0.86,
		thicknessMultiplier: 0.82,
		brightnessMultiplier: 0.9,
		intensityBoost: -0.04
	},
	standard: {
		activeTipLimit: ENGINE_LIMITS.maximumActiveTips,
		attachmentDelaySteps: 0,
		branchEnergyBoost: 0,
		branchRetentionBoost: 0,
		branchSpawnMultiplier: 1,
		forkSpawnMultiplier: 1,
		lateralExploration: 1,
		stepLengthMultiplier: 1,
		thicknessMultiplier: 1,
		brightnessMultiplier: 1,
		intensityBoost: 0
	},
	large: {
		activeTipLimit: ENGINE_LIMITS.maximumActiveTips,
		attachmentDelaySteps: 3,
		branchEnergyBoost: 0.06,
		branchRetentionBoost: 0.06,
		branchSpawnMultiplier: 1.45,
		forkSpawnMultiplier: 1.45,
		lateralExploration: 1.28,
		stepLengthMultiplier: 1.08,
		thicknessMultiplier: 1.24,
		brightnessMultiplier: 1.05,
		intensityBoost: 0.06
	},
	heroic: {
		activeTipLimit: ENGINE_LIMITS.maximumActiveTips,
		attachmentDelaySteps: 7,
		branchEnergyBoost: 0.12,
		branchRetentionBoost: 0.11,
		branchSpawnMultiplier: 2.05,
		forkSpawnMultiplier: 2.25,
		lateralExploration: 1.68,
		stepLengthMultiplier: 1.16,
		thicknessMultiplier: 1.62,
		brightnessMultiplier: 1.12,
		intensityBoost: 0.12
	}
};

function strikeScaleProfile(scale: StrikeScale): StrikeScaleProfile {
	return STRIKE_SCALE_PROFILES[scale];
}

function segmentPresentation(
	branchDepth: number,
	isMainChannel: boolean,
	energy: number,
	strikeScale: StrikeScale
): Pick<
	LightningSegment,
	'channelClass' | 'hierarchyDepth' | 'relativeThickness' | 'relativeBrightness' | 'persistence'
> {
	const profile = strikeScaleProfile(strikeScale);
	const hierarchyDepth = isMainChannel ? 0 : clamp(Math.max(1, branchDepth), 1, 3);
	const channelClass = isMainChannel
		? 'main'
		: hierarchyDepth === 1
			? 'primary'
			: hierarchyDepth === 2
				? 'secondary'
				: 'tertiary';
	const thickness = [1, 0.56, 0.32, 0.18][hierarchyDepth];
	const brightness = [1, 0.78, 0.54, 0.34][hierarchyDepth];
	const basePersistence = [1, 0.76, 0.54, 0.34][hierarchyDepth];
	const energyFactor = 0.82 + clamp(energy, 0, 1) * 0.18;
	return {
		channelClass,
		hierarchyDepth,
		relativeThickness: thickness * profile.thicknessMultiplier * energyFactor,
		relativeBrightness: brightness * profile.brightnessMultiplier * (0.88 + energyFactor * 0.12),
		persistence: clamp(
			basePersistence + (strikeScale === 'heroic' && !isMainChannel ? 0.08 : 0) + energy * 0.08,
			0.2,
			1
		)
	};
}

function applySegmentHierarchy(
	segments: LightningSegment[],
	mainPath: readonly number[],
	strikeScale: StrikeScale
) {
	const main = new Set(mainPath);
	for (const [index, segment] of segments.entries()) {
		segment.isMainChannel = main.has(index);
		Object.assign(
			segment,
			segmentPresentation(segment.branchDepth, segment.isMainChannel, segment.energy, strikeScale)
		);
	}
}

const MAXIMUM_ATTACHMENT_SEGMENTS = 32;
const MAXIMUM_CLOSING_SEGMENTS = 96;

const attachmentHeight = (candidate: AttachmentCandidate) =>
	Math.max(0, candidate.absoluteHeight - candidate.baseElevation);

const DIRECTIONAL_ATTACHMENT_KINDS = new Set<AttachmentKind>([
	'wind-turbine',
	'ship',
	'offshore-platform',
	'low-building',
	'high-rise'
]);

function orientationFactor(candidate: AttachmentCandidate, leader: Vec3): number {
	if (!DIRECTIONAL_ATTACHMENT_KINDS.has(candidate.kind) || candidate.rotation === undefined)
		return 1;
	const radians = (candidate.rotation * Math.PI) / 180;
	const approachX = leader.x - candidate.position.x;
	const approachZ = leader.z - candidate.position.z;
	const approachLength = Math.hypot(approachX, approachZ);
	if (approachLength < 1e-6) return 1;
	const alignment = Math.abs(
		(Math.sin(radians) * approachX + Math.cos(radians) * approachZ) / approachLength
	);
	return 0.88 + alignment * 0.24;
}

export function scoreAttachmentCandidates(
	state: SerializableAtlasState,
	terrain: TerrainData,
	pockets: readonly ChargePocket[],
	root: Vec3,
	strikeIndex: number
): ScoredAttachment[] {
	const stormWorld = normalizedToWorld(
		state.stormPosition,
		terrain.widthMetres,
		terrain.depthMetres
	);
	const stormScale = 1_050 + state.storm.chargeStrength * 1_850;
	return terrain.candidates
		.map((candidate) => {
			const horizontalDistance = Math.hypot(
				candidate.position.x - stormWorld.x,
				candidate.position.z - stormWorld.z
			);
			const rootDistance = distance(root, candidate.position);
			const proximity = Math.exp(-horizontalDistance / stormScale);
			const rootOpportunity = Math.exp(-rootDistance / 4_800);
			const field = fieldStrengthProxy(candidate.position, pockets);
			const prominence = 0.48 + candidate.localProminence * 1.25;
			const isolation = 0.68 + candidate.isolation * 0.62;
			const tip = 0.58 + candidate.tipFactor * 0.72;
			const semanticHeight = 0.82 + clamp(attachmentHeight(candidate) / 165, 0, 1) * 0.54;
			const localWetness = sampleTerrainWetness(
				terrain,
				candidate.position.x,
				candidate.position.z
			);
			const conductivity =
				0.78 +
				candidate.conductivityFactor * (0.12 + state.environment.conductivityProxy * 0.32) +
				localWetness * (0.04 + state.environment.surfaceWetness * 0.12);
			const threshold = 1.18 - candidate.streamerThreshold * 0.36;
			const score =
				(0.2 + proximity * 1.45) *
				(0.42 + rootOpportunity) *
				(0.4 + field * 1.2) *
				prominence *
				isolation *
				tip *
				semanticHeight *
				conductivity *
				threshold *
				orientationFactor(candidate, root);
			const chance = new SeededRandom(
				`${state.seed}|attachment|${strikeIndex}|${candidate.id}`
			).nextFloat();
			const stochasticFactor = 0.54 + chance * 0.92;
			return { candidate, score, weight: Math.max(0.0001, score * stochasticFactor) };
		})
		.sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
}

function directionOptions(
	position: Vec3,
	previous: Vec3,
	target: Vec3,
	pockets: readonly ChargePocket[],
	random: SeededRandom,
	type: FlashType,
	persistence: number,
	profile: StrikeScaleProfile,
	count = 7
): DirectionCandidate[] {
	const targetDirection = normalize(subtract(target, position));
	const field = normalize(electricFieldProxy(position, pockets));
	const downward = type === 'intra-cloud' ? targetDirection : { x: 0, y: -1, z: 0 };
	const options: DirectionCandidate[] = [];
	for (let index = 0; index < count; index += 1) {
		const jitterScale =
			(type === 'positive-cg' ? 0.24 : type === 'intra-cloud' ? 0.5 : 0.42) *
			profile.lateralExploration;
		const jitter = {
			x: random.normal(0, jitterScale),
			y: random.normal(0, jitterScale * 0.52),
			z: random.normal(0, jitterScale)
		};
		const direction = normalize(
			add(
				add(
					scale(targetDirection, 1.1 / (1 + (profile.lateralExploration - 1) * 0.34)),
					scale(previous, 0.35 + persistence * 0.8)
				),
				add(scale(field, 0.26), add(scale(downward, 0.28 / profile.lateralExploration), jitter))
			)
		);
		const electricalAdvantage = 0.45 + Math.max(0, dot(direction, field)) * 0.55;
		const directionalContinuity = 0.32 + Math.max(0, dot(direction, previous)) * 0.68;
		const targetAdvantage = 0.4 + Math.max(0, dot(direction, targetDirection)) * 0.85;
		const stochasticVariation = 0.76 + random.nextFloat() * 0.48;
		options.push({
			direction,
			score: electricalAdvantage * directionalContinuity * targetAdvantage * stochasticVariation
		});
	}
	return options.sort((a, b) => b.score - a.score);
}

function articulatedBranchDirection(
	candidate: Vec3,
	mainDirection: Vec3,
	random: SeededRandom,
	profile: StrikeScaleProfile
): Vec3 {
	if (profile.lateralExploration === 1) return candidate;
	const horizontalLength = Math.hypot(mainDirection.x, mainDirection.z);
	const side = random.nextFloat() < 0.5 ? -1 : 1;
	const perpendicular =
		horizontalLength > 1e-6
			? {
					x: (-mainDirection.z / horizontalLength) * side,
					y: 0,
					z: (mainDirection.x / horizontalLength) * side
				}
			: { x: side, y: 0, z: 0 };
	const lateralBoost = (profile.lateralExploration - 1) * 0.72;
	return normalize({
		x: candidate.x + perpendicular.x * lateralBoost,
		y: candidate.y * clamp(1 - lateralBoost * 0.34, 0.62, 1),
		z: candidate.z + perpendicular.z * lateralBoost
	});
}

function tooCloseToExisting(position: Vec3, segments: readonly LightningSegment[]): boolean {
	const start = Math.max(0, segments.length - 48);
	for (let index = start; index < segments.length; index += 1) {
		if (distance(position, segments[index].end) < ENGINE_LIMITS.minimumSegmentMetres * 0.42)
			return true;
	}
	return false;
}

function boundedPoint(point: Vec3, terrain: TerrainData, allowTerrainContact: boolean): Vec3 {
	const x = clamp(point.x, -terrain.widthMetres / 2, terrain.widthMetres / 2);
	const z = clamp(point.z, -terrain.depthMetres / 2, terrain.depthMetres / 2);
	const surface = sampleTerrainHeight(terrain, x, z);
	return {
		x,
		y: allowTerrainContact ? Math.max(surface, point.y) : Math.max(surface + 12, point.y),
		z
	};
}

function growBranch(
	tip: BranchTip,
	segments: LightningSegment[],
	pockets: readonly ChargePocket[],
	terrain: TerrainData,
	random: SeededRandom,
	birthStep: number,
	type: FlashType,
	profile: StrikeScaleProfile
): BranchTip | null {
	if (
		tip.energy < 0.13 ||
		tip.depth > ENGINE_LIMITS.maximumBranchDepth ||
		segments.length >= ENGINE_LIMITS.maximumSegments
	)
		return null;

	const field = normalize(electricFieldProxy(tip.position, pockets));
	const downwardBias = type === 'intra-cloud' ? 0 : -0.22 / profile.lateralExploration;
	const direction = normalize({
		x:
			tip.direction.x * 0.72 + field.x * 0.18 + random.normal(0, 0.32 * profile.lateralExploration),
		y: tip.direction.y * 0.72 + field.y * 0.18 + downwardBias + random.normal(0, 0.14),
		z: tip.direction.z * 0.72 + field.z * 0.18 + random.normal(0, 0.32 * profile.lateralExploration)
	});
	const step = Math.min(
		ENGINE_LIMITS.maximumSegmentMetres,
		(48 + random.nextFloat() * (92 + tip.energy * 36)) * profile.stepLengthMultiplier
	);
	let end = add(tip.position, scale(direction, step));
	end = boundedPoint(end, terrain, false);
	if (!finiteVec3(end) || tooCloseToExisting(end, segments)) return null;
	const segmentLength = distance(tip.position, end);
	if (
		segmentLength < ENGINE_LIMITS.minimumSegmentMetres ||
		segmentLength > ENGINE_LIMITS.maximumSegmentMetres
	)
		return null;
	if (connectionSegmentClipsTerrain(tip.position, end, terrain)) return null;
	const terrainClearance = end.y - sampleTerrainHeight(terrain, end.x, end.z);
	if (type !== 'intra-cloud' && terrainClearance < 22) return null;

	const index = segments.length;
	segments.push({
		start: { ...tip.position },
		end,
		parentIndex: tip.parentIndex,
		branchDepth: tip.depth,
		birthStep,
		energy: tip.energy,
		isMainChannel: false,
		...segmentPresentation(tip.depth, false, tip.energy, 'standard')
	});
	return {
		position: end,
		direction,
		parentIndex: index,
		depth: tip.depth,
		energy: tip.energy * (0.71 + profile.branchRetentionBoost + random.nextFloat() * 0.12),
		age: tip.age + 1
	};
}

function appendStraightConnection(
	segments: LightningSegment[],
	mainPath: number[],
	start: Vec3,
	end: Vec3,
	parentIndex: number,
	birthStep: number,
	terrain: TerrainData
): number {
	const directDistance = distance(start, end);
	if (directDistance < ENGINE_LIMITS.minimumSegmentMetres && parentIndex >= 0) {
		const previous = segments[parentIndex];
		const mergedDistance = previous ? distance(previous.start, end) : 0;
		if (
			previous?.isMainChannel &&
			mergedDistance >= ENGINE_LIMITS.minimumSegmentMetres &&
			mergedDistance <= ENGINE_LIMITS.maximumSegmentMetres &&
			!connectionSegmentClipsTerrain(previous.start, end, terrain)
		) {
			previous.end = { ...end };
			return parentIndex;
		}
		if (
			previous?.isMainChannel &&
			mergedDistance >= ENGINE_LIMITS.minimumSegmentMetres * 2 &&
			mergedDistance <= ENGINE_LIMITS.maximumSegmentMetres * 2 &&
			segments.length < ENGINE_LIMITS.maximumSegments &&
			!connectionSegmentClipsTerrain(previous.start, end, terrain)
		) {
			const midpoint = lerp(previous.start, end, 0.5);
			previous.end = midpoint;
			const segmentIndex = segments.length;
			segments.push({
				start: { ...midpoint },
				end: { ...end },
				parentIndex,
				branchDepth: 0,
				birthStep,
				energy: 1,
				isMainChannel: true,
				...segmentPresentation(0, true, 1, 'standard')
			});
			mainPath.push(segmentIndex);
			return segmentIndex;
		}
	}
	const availableSegments = ENGINE_LIMITS.maximumSegments - segments.length;
	const points = terrainSafeConnectionPoints(
		start,
		end,
		terrain,
		availableSegments,
		72,
		ENGINE_LIMITS.minimumSegmentMetres
	);
	let previousIndex = parentIndex;
	for (let index = 1; index < points.length; index += 1) {
		const segmentLength = distance(points[index - 1].point, points[index].point);
		if (segmentLength < ENGINE_LIMITS.minimumSegmentMetres - 0.001) {
			throw new Error(
				`The bounded lightning channel produced a ${segmentLength.toFixed(3)} m closing segment below its minimum length at ${index}/${points.length - 1} (${points[index - 1].t.toFixed(4)}-${points[index].t.toFixed(4)}).`
			);
		}
		const segmentIndex = segments.length;
		segments.push({
			start: { ...points[index - 1].point },
			end: { ...points[index].point },
			parentIndex: previousIndex,
			branchDepth: 0,
			birthStep,
			energy: 1,
			isMainChannel: true,
			...segmentPresentation(0, true, 1, 'standard')
		});
		mainPath.push(segmentIndex);
		previousIndex = segmentIndex;
	}
	return previousIndex;
}

function generateChannel(
	root: Vec3,
	target: Vec3,
	type: FlashType,
	state: SerializableAtlasState,
	terrain: TerrainData,
	pockets: readonly ChargePocket[],
	random: SeededRandom
): { segments: LightningSegment[]; mainPath: number[] } {
	const profile = strikeScaleProfile(state.strikeScale);
	const segments: LightningSegment[] = [];
	const mainPath: number[] = [];
	let point = { ...root };
	let previous = normalize(subtract(target, root));
	let previousMainIndex = -1;
	let branches: BranchTip[] = [];
	const straightDistance = Math.max(1, distance(root, target));
	const estimatedSteps = Math.max(8, Math.ceil(straightDistance / 125));
	const growthLimit = ENGINE_LIMITS.maximumSegments - MAXIMUM_CLOSING_SEGMENTS;

	for (let stepIndex = 0; stepIndex < ENGINE_LIMITS.maximumIterations; stepIndex += 1) {
		if (segments.length >= growthLimit) break;
		const remaining = distance(point, target);
		const remainingSteps = Math.max(1, estimatedSteps - stepIndex);
		const stepLength = clamp(
			(remaining / remainingSteps) * (0.82 + random.nextFloat() * 0.36),
			ENGINE_LIMITS.minimumSegmentMetres,
			ENGINE_LIMITS.maximumSegmentMetres
		);
		if (remaining <= stepLength * 1.28 || stepIndex >= estimatedSteps + 10) {
			appendStraightConnection(
				segments,
				mainPath,
				point,
				target,
				previousMainIndex,
				stepIndex,
				terrain
			);
			break;
		}

		const options = directionOptions(
			point,
			previous,
			target,
			pockets,
			random.fork(`directions-${stepIndex}`),
			type,
			state.storm.leaderPersistence,
			profile
		);
		const selectedPool = options.slice(0, 4);
		const selectedIndex = random
			.fork(`selection-${stepIndex}`)
			.weightedIndex(selectedPool.map((candidate) => Math.pow(candidate.score, 2.1)));
		const selected = selectedPool[Math.max(0, selectedIndex)] ?? options[0];
		const progress = clamp((stepIndex + 1) / estimatedSteps, 0, 0.98);
		const intended = add(point, scale(selected.direction, stepLength));
		const guide = lerp(root, target, progress);
		let end = lerp(
			intended,
			guide,
			(type === 'positive-cg' ? 0.34 : 0.22) / profile.lateralExploration
		);
		end = boundedPoint(end, terrain, false);
		if (tooCloseToExisting(end, segments)) end = lerp(end, guide, 0.55);
		const candidateLength = distance(point, end);
		if (
			candidateLength < ENGINE_LIMITS.minimumSegmentMetres ||
			candidateLength > ENGINE_LIMITS.maximumSegmentMetres
		)
			continue;
		if (connectionSegmentClipsTerrain(point, end, terrain)) continue;

		const mainIndex = segments.length;
		segments.push({
			start: { ...point },
			end,
			parentIndex: previousMainIndex,
			branchDepth: 0,
			birthStep: stepIndex,
			energy: 1,
			isMainChannel: true,
			...segmentPresentation(0, true, 1, 'standard')
		});
		mainPath.push(mainIndex);
		previousMainIndex = mainIndex;
		previous = normalize(subtract(end, point));
		point = end;

		const branching =
			state.storm.branching * (type === 'positive-cg' ? 0.28 : type === 'intra-cloud' ? 0.82 : 1);
		const runnerUp = options.find((candidate) => candidate !== selected) ?? options[1];
		const ambiguity = runnerUp ? runnerUp.score / Math.max(0.001, selected.score) : 0;
		if (
			runnerUp &&
			branches.length < profile.activeTipLimit &&
			stepIndex > 1 &&
			random.fork(`branch-${stepIndex}`).nextFloat() <
				branching * (0.12 + ambiguity * 0.3) * profile.branchSpawnMultiplier
		) {
			branches.push({
				position: { ...segments[mainIndex].start },
				direction: articulatedBranchDirection(
					runnerUp.direction,
					selected.direction,
					random.fork(`branch-direction-${stepIndex}`),
					profile
				),
				parentIndex: segments[mainIndex].parentIndex,
				depth: 1,
				energy: clamp(0.48 + branching * 0.38 + profile.branchEnergyBoost, 0, 1),
				age: 0
			});
		}

		const nextBranches: BranchTip[] = [];
		for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
			if (segments.length >= growthLimit) break;
			const branchRandom = random.fork(
				`grow-${stepIndex}-${branchIndex}-${branches[branchIndex].parentIndex}`
			);
			const grown = growBranch(
				branches[branchIndex],
				segments,
				pockets,
				terrain,
				branchRandom,
				stepIndex,
				type,
				profile
			);
			if (!grown) continue;
			nextBranches.push(grown);
			if (
				grown.depth < ENGINE_LIMITS.maximumBranchDepth &&
				grown.age > 1 &&
				branchRandom.nextFloat() < branching * 0.075 * profile.forkSpawnMultiplier
			) {
				nextBranches.push({
					...grown,
					direction: normalize({
						x: grown.direction.z + branchRandom.normal(0, 0.22),
						y: grown.direction.y + branchRandom.normal(-0.08, 0.12),
						z: -grown.direction.x + branchRandom.normal(0, 0.22)
					}),
					depth: grown.depth + 1,
					energy: grown.energy * 0.63,
					age: 0
				});
			}
		}
		branches = nextBranches.slice(0, profile.activeTipLimit);
	}

	if (
		mainPath.length === 0 ||
		distance(segments[mainPath[mainPath.length - 1]]?.end ?? root, target) > 1
	) {
		const start = mainPath.length ? segments[mainPath[mainPath.length - 1]].end : root;
		appendStraightConnection(
			segments,
			mainPath,
			start,
			target,
			mainPath.length ? mainPath[mainPath.length - 1] : -1,
			ENGINE_LIMITS.maximumIterations,
			terrain
		);
	}
	return { segments, mainPath };
}

type GroundConnection = {
	tip: BranchTip;
	entry: ScoredAttachment;
	scored: ScoredAttachment[];
	weight: number;
};

function terrainContactCandidate(terrain: TerrainData, tip: BranchTip): AttachmentCandidate {
	const x = clamp(tip.position.x, -terrain.widthMetres / 2, terrain.widthMetres / 2);
	const z = clamp(tip.position.z, -terrain.depthMetres / 2, terrain.depthMetres / 2);
	const y = sampleTerrainHeight(terrain, x, z);
	return {
		id: `terrain-contact-${Math.round(x)}-${Math.round(z)}`,
		kind: terrain.preset === 'open-ocean' ? 'ocean-surface' : 'terrain',
		label:
			terrain.preset === 'open-ocean'
				? 'Open water beneath the developing leader'
				: 'Terrain beneath the developing leader',
		position: { x, y, z },
		baseElevation: y,
		absoluteHeight: y,
		localProminence: 0.24,
		isolation: 0.28,
		tipFactor: 0.18,
		conductivityFactor: terrain.preset === 'open-ocean' ? 0.72 : 0.42,
		streamerThreshold: 0.7
	};
}

function attachmentReach(candidate: AttachmentCandidate, state: SerializableAtlasState): number {
	return (
		520 +
		candidate.tipFactor * 250 +
		clamp(attachmentHeight(candidate), 0, 240) * 0.6 +
		state.storm.chargeStrength * 180
	);
}

function possibleGroundConnections(
	tips: readonly BranchTip[],
	state: SerializableAtlasState,
	terrain: TerrainData,
	pockets: readonly ChargePocket[],
	strikeIndex: number
): GroundConnection[] {
	const connections: GroundConnection[] = [];
	for (const tip of tips) {
		const surface = sampleTerrainHeight(terrain, tip.position.x, tip.position.z);
		const clearance = tip.position.y - surface;
		if (clearance > 760) continue;

		const scored = scoreAttachmentCandidates(state, terrain, pockets, tip.position, strikeIndex);
		for (const entry of scored.slice(0, 28)) {
			const candidateTriggerHeight =
				390 +
				clamp(attachmentHeight(entry.candidate), 0, 240) * 0.8 +
				entry.candidate.tipFactor * 130 +
				state.storm.chargeStrength * 100;
			if (clearance > candidateTriggerHeight) continue;
			const separation = distance(tip.position, entry.candidate.position);
			const reach = attachmentReach(entry.candidate, state);
			if (separation > reach) continue;
			const connectionFactor = Math.exp(-separation / Math.max(120, reach * 0.58));
			const branchEnergy = 0.62 + tip.energy * 0.38;
			connections.push({
				tip,
				entry,
				scored,
				weight: entry.weight * connectionFactor * branchEnergy
			});
		}

		if (clearance <= 480) {
			const candidate = terrainContactCandidate(terrain, tip);
			const localWetness = sampleTerrainWetness(
				terrain,
				candidate.position.x,
				candidate.position.z
			);
			const score =
				0.2 +
				state.storm.chargeStrength * 0.2 +
				state.environment.conductivityProxy * candidate.conductivityFactor * 0.14 +
				localWetness * 0.08;
			const entry = { candidate, score, weight: score * (0.72 + tip.energy * 0.28) };
			connections.push({ tip, entry, scored: [entry, ...scored], weight: entry.weight });
		}
	}
	return connections;
}

type ConnectionPoint = { t: number; point: Vec3 };

function safeAttachmentCurvePoint(
	start: Vec3,
	end: Vec3,
	t: number,
	terrain: TerrainData,
	controlHeight: number
): Vec3 {
	if (t <= 0) return { ...start };
	if (t >= 1) return { ...end };
	const point = lerp(start, end, t);
	const inverse = 1 - t;
	const curveHeight = inverse * inverse * start.y + 2 * inverse * t * controlHeight + t * t * end.y;
	point.y = Math.max(curveHeight, sampleTerrainHeight(terrain, point.x, point.z) + 18);
	return point;
}

function connectionSegmentClipsTerrain(start: Vec3, end: Vec3, terrain: TerrainData): boolean {
	for (let sampleIndex = 1; sampleIndex < 16; sampleIndex += 1) {
		const fraction = sampleIndex / 16;
		const point = lerp(start, end, fraction);
		if (point.y < sampleTerrainHeight(terrain, point.x, point.z) - 0.001) return true;
	}
	return false;
}

function terrainSafeConnectionPoints(
	start: Vec3,
	end: Vec3,
	terrain: TerrainData,
	availableSegments: number,
	minimumCurveClearance = 18,
	minimumSegmentLength = 0
): ConnectionPoint[] {
	if (availableSegments < 1) {
		throw new Error('The bounded lightning channel exhausted its closing-segment reserve.');
	}

	let controlHeight = Math.max(start.y, end.y) + 36;
	for (let index = 1; index < 48; index += 1) {
		const t = index / 48;
		const inverse = 1 - t;
		const point = lerp(start, end, t);
		const requiredHeight = sampleTerrainHeight(terrain, point.x, point.z) + minimumCurveClearance;
		const requiredControlHeight =
			(requiredHeight - inverse * inverse * start.y - t * t * end.y) / (2 * inverse * t);
		controlHeight = Math.max(controlHeight, requiredControlHeight);
	}

	let points: ConnectionPoint[] = [
		{ t: 0, point: { ...start } },
		{ t: 1, point: { ...end } }
	];
	while (points.length - 1 < availableSegments) {
		const refined: ConnectionPoint[] = [points[0]];
		let changed = false;
		for (let index = 0; index < points.length - 1; index += 1) {
			const left = points[index];
			const right = points[index + 1];
			const needsSplit =
				distance(left.point, right.point) > ENGINE_LIMITS.maximumSegmentMetres ||
				connectionSegmentClipsTerrain(left.point, right.point, terrain);
			if (needsSplit && refined.length + (points.length - index) <= availableSegments + 1) {
				const t = (left.t + right.t) / 2;
				refined.push({
					t,
					point: safeAttachmentCurvePoint(start, end, t, terrain, controlHeight)
				});
				changed = true;
			}
			refined.push(right);
		}
		points = refined;
		if (!changed) break;
	}

	if (
		minimumSegmentLength > 0 &&
		points.length === 2 &&
		distance(points[0].point, points[1].point) < minimumSegmentLength &&
		availableSegments >= 2
	) {
		points.splice(1, 0, {
			t: 0.5,
			point: safeAttachmentCurvePoint(start, end, 0.5, terrain, controlHeight)
		});
	}

	for (let pass = 0; pass < points.length * 2 && minimumSegmentLength > 0; pass += 1) {
		const shortIndex = points.findIndex(
			(point, index) =>
				index > 0 && distance(points[index - 1].point, point.point) < minimumSegmentLength
		);
		if (shortIndex < 0) break;
		const movingIndex = shortIndex === points.length - 1 ? shortIndex - 1 : shortIndex;
		if (movingIndex <= 0 || movingIndex >= points.length - 1) break;
		const left = points[movingIndex - 1];
		const current = points[movingIndex];
		const right = points[movingIndex + 1];
		let best: ConnectionPoint | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;
		let bestMargin = Number.NEGATIVE_INFINITY;
		for (let candidateIndex = 1; candidateIndex < 128; candidateIndex += 1) {
			const t = left.t + ((right.t - left.t) * candidateIndex) / 128;
			const point = safeAttachmentCurvePoint(start, end, t, terrain, controlHeight);
			const leftLength = distance(left.point, point);
			const rightLength = distance(point, right.point);
			if (
				leftLength < minimumSegmentLength ||
				rightLength < minimumSegmentLength ||
				leftLength > ENGINE_LIMITS.maximumSegmentMetres ||
				rightLength > ENGINE_LIMITS.maximumSegmentMetres ||
				connectionSegmentClipsTerrain(left.point, point, terrain) ||
				connectionSegmentClipsTerrain(point, right.point, terrain)
			)
				continue;
			const candidateDistance = Math.abs(t - current.t);
			const margin = Math.min(
				leftLength - minimumSegmentLength,
				rightLength - minimumSegmentLength
			);
			if (
				candidateDistance < bestDistance - 1e-9 ||
				(Math.abs(candidateDistance - bestDistance) <= 1e-9 && margin > bestMargin)
			) {
				best = { t, point };
				bestDistance = candidateDistance;
				bestMargin = margin;
			}
		}
		if (!best) break;
		points[movingIndex] = best;
	}

	if (
		points.some(
			(point, index) =>
				index > 0 &&
				(distance(points[index - 1].point, point.point) >
					ENGINE_LIMITS.maximumSegmentMetres + 0.001 ||
					connectionSegmentClipsTerrain(points[index - 1].point, point.point, terrain))
		)
	) {
		throw new Error('The bounded lightning channel exhausted its terrain-safe closing reserve.');
	}
	return points;
}

function appendAttachmentConnection(
	segments: LightningSegment[],
	tip: BranchTip,
	candidate: AttachmentCandidate,
	terrain: TerrainData,
	birthStep: number
): number {
	const start = tip.position;
	const end = candidate.position;
	const availableSegments = Math.min(
		MAXIMUM_ATTACHMENT_SEGMENTS,
		ENGINE_LIMITS.maximumSegments - segments.length
	);
	const points = terrainSafeConnectionPoints(start, end, terrain, availableSegments);

	let parentIndex = tip.parentIndex;
	for (let index = 1; index < points.length; index += 1) {
		const segmentIndex = segments.length;
		segments.push({
			start: { ...points[index - 1].point },
			end: { ...points[index].point },
			parentIndex,
			branchDepth: tip.depth,
			birthStep,
			energy: 1,
			isMainChannel: false,
			...segmentPresentation(tip.depth, false, 1, 'standard'),
			isAttachmentConnection: true
		});
		parentIndex = segmentIndex;
	}
	return parentIndex;
}

function markWinningPath(segments: LightningSegment[], finalIndex: number): number[] {
	const path: number[] = [];
	const visited = new Set<number>();
	let index = finalIndex;
	while (index >= 0 && index < segments.length && !visited.has(index)) {
		visited.add(index);
		path.push(index);
		index = segments[index].parentIndex;
	}
	path.reverse();
	for (const segment of segments) segment.isMainChannel = false;
	for (const pathIndex of path) segments[pathIndex].isMainChannel = true;
	return path;
}

function generateGroundChannel(
	root: Vec3,
	type: Exclude<FlashType, 'intra-cloud'>,
	state: SerializableAtlasState,
	terrain: TerrainData,
	pockets: readonly ChargePocket[],
	strikeIndex: number,
	random: SeededRandom
): {
	segments: LightningSegment[];
	mainPath: number[];
	attachment: Attachment;
	scored: ScoredAttachment[];
} {
	const profile = strikeScaleProfile(state.strikeScale);
	const segments: LightningSegment[] = [];
	let primary: BranchTip = {
		position: { ...root },
		direction: normalize(add(electricFieldProxy(root, pockets), { x: 0, y: -1.25, z: 0 })),
		parentIndex: -1,
		depth: 0,
		energy: 1,
		age: 0
	};
	let branches: BranchTip[] = [];
	let winningConnection: GroundConnection | null = null;
	let finalIndex = -1;
	const branching = state.storm.branching * (type === 'positive-cg' ? 0.28 : 1);
	const growthLimit = ENGINE_LIMITS.maximumSegments - MAXIMUM_ATTACHMENT_SEGMENTS;
	const canopyAngle = random.fork('ground-canopy-direction').nextFloat() * Math.PI * 2;
	const canopyDirection = { x: Math.cos(canopyAngle), z: Math.sin(canopyAngle) };

	for (let stepIndex = 0; stepIndex < ENGINE_LIMITS.maximumIterations; stepIndex += 1) {
		if (segments.length >= growthLimit) break;
		const surface = sampleTerrainHeight(terrain, primary.position.x, primary.position.z);
		const canopyInfluence = clamp(
			(profile.attachmentDelaySteps - stepIndex) / Math.max(1, profile.attachmentDelaySteps),
			0,
			1
		);
		const downwardTarget = {
			x: primary.position.x + canopyDirection.x * 900 * canopyInfluence,
			y: surface + Math.max(0, primary.position.y - surface) * canopyInfluence * 0.42,
			z: primary.position.z + canopyDirection.z * 900 * canopyInfluence
		};
		const options = directionOptions(
			primary.position,
			primary.direction,
			downwardTarget,
			pockets,
			random.fork(`ground-directions-${stepIndex}`),
			type,
			state.storm.leaderPersistence,
			profile
		);
		const selectedPool = options.slice(0, 4);
		const selectedIndex = random
			.fork(`ground-selection-${stepIndex}`)
			.weightedIndex(selectedPool.map((candidate) => Math.pow(candidate.score, 2.1)));
		const selected = selectedPool[Math.max(0, selectedIndex)] ?? options[0];
		const clearance = Math.max(12, primary.position.y - surface);
		const stepLength = clamp(
			(70 + random.fork(`ground-step-${stepIndex}`).nextFloat() * 105) *
				(type === 'positive-cg' ? 1.12 : 1),
			ENGINE_LIMITS.minimumSegmentMetres,
			Math.min(ENGINE_LIMITS.maximumSegmentMetres, Math.max(36, clearance * 0.72))
		);
		let end = boundedPoint(
			add(primary.position, scale(selected.direction, stepLength)),
			terrain,
			false
		);
		if (tooCloseToExisting(end, segments)) {
			end = boundedPoint(
				add(
					primary.position,
					scale(normalize(add(selected.direction, { x: 0, y: -0.35, z: 0 })), stepLength)
				),
				terrain,
				false
			);
		}
		const candidateLength = distance(primary.position, end);
		if (
			candidateLength < ENGINE_LIMITS.minimumSegmentMetres ||
			candidateLength > ENGINE_LIMITS.maximumSegmentMetres
		)
			continue;
		if (connectionSegmentClipsTerrain(primary.position, end, terrain)) continue;
		const mainIndex = segments.length;
		segments.push({
			start: { ...primary.position },
			end,
			parentIndex: primary.parentIndex,
			branchDepth: 0,
			birthStep: stepIndex,
			energy: 1,
			isMainChannel: false,
			...segmentPresentation(0, false, 1, 'standard')
		});
		primary = {
			position: end,
			direction: normalize(subtract(end, segments[mainIndex].start)),
			parentIndex: mainIndex,
			depth: 0,
			energy: 1,
			age: primary.age + 1
		};

		const runnerUp = options.find((candidate) => candidate !== selected) ?? options[1];
		const ambiguity = runnerUp ? runnerUp.score / Math.max(0.001, selected.score) : 0;
		if (
			runnerUp &&
			branches.length < profile.activeTipLimit &&
			stepIndex > 1 &&
			random.fork(`ground-branch-${stepIndex}`).nextFloat() <
				branching * (0.14 + ambiguity * 0.34) * profile.branchSpawnMultiplier
		) {
			branches.push({
				position: { ...segments[mainIndex].start },
				direction: articulatedBranchDirection(
					runnerUp.direction,
					selected.direction,
					random.fork(`ground-branch-direction-${stepIndex}`),
					profile
				),
				parentIndex: segments[mainIndex].parentIndex,
				depth: 1,
				energy: clamp(0.52 + branching * 0.4 + profile.branchEnergyBoost, 0, 1),
				age: 0
			});
		}

		const nextBranches: BranchTip[] = [];
		for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
			if (segments.length >= growthLimit) break;
			const branchRandom = random.fork(
				`ground-grow-${stepIndex}-${branchIndex}-${branches[branchIndex].parentIndex}`
			);
			const grown = growBranch(
				branches[branchIndex],
				segments,
				pockets,
				terrain,
				branchRandom,
				stepIndex,
				type,
				profile
			);
			if (!grown) continue;
			nextBranches.push(grown);
			if (
				grown.depth < ENGINE_LIMITS.maximumBranchDepth &&
				grown.age > 1 &&
				branchRandom.nextFloat() < branching * 0.08 * profile.forkSpawnMultiplier
			) {
				nextBranches.push({
					...grown,
					direction: normalize({
						x: grown.direction.z + branchRandom.normal(0, 0.22),
						y: grown.direction.y + branchRandom.normal(-0.08, 0.12),
						z: -grown.direction.x + branchRandom.normal(0, 0.22)
					}),
					depth: grown.depth + 1,
					energy: grown.energy * 0.63,
					age: 0
				});
			}
		}
		branches = nextBranches.slice(0, profile.activeTipLimit);

		const connections = possibleGroundConnections(
			[primary, ...branches],
			state,
			terrain,
			pockets,
			strikeIndex
		).sort(
			(a, b) =>
				b.weight - a.weight ||
				a.entry.candidate.id.localeCompare(b.entry.candidate.id) ||
				a.tip.parentIndex - b.tip.parentIndex
		);
		const attachmentGate = random.fork(`ground-attachment-gate-${stepIndex}`).nextFloat();
		if (
			stepIndex >= profile.attachmentDelaySteps &&
			connections.length &&
			attachmentGate < 0.64 + state.storm.chargeStrength * 0.18
		) {
			const pool = connections.slice(0, 18);
			const connectionIndex = random
				.fork(`ground-attachment-${stepIndex}`)
				.weightedIndex(pool.map((connection) => connection.weight));
			winningConnection = pool[Math.max(0, connectionIndex)] ?? pool[0];
			finalIndex = appendAttachmentConnection(
				segments,
				winningConnection.tip,
				winningConnection.entry.candidate,
				terrain,
				stepIndex + 1
			);
			break;
		}
	}

	if (!winningConnection) {
		const candidate = terrainContactCandidate(terrain, primary);
		const entry: ScoredAttachment = { candidate, score: 0.1, weight: 0.1 };
		winningConnection = { tip: primary, entry, scored: [entry], weight: entry.weight };
		finalIndex = appendAttachmentConnection(
			segments,
			primary,
			candidate,
			terrain,
			ENGINE_LIMITS.maximumIterations
		);
	}

	const mainPath = markWinningPath(segments, finalIndex);
	const selected = winningConnection.entry;
	return {
		segments,
		mainPath,
		attachment: {
			candidateId: selected.candidate.id,
			kind: selected.candidate.kind,
			label: selected.candidate.label,
			position: { ...selected.candidate.position },
			elevationMetres: selected.candidate.position.y,
			modelScore: selected.score
		},
		scored: winningConnection.scored
	};
}

function safeLosingStreamerEnd(
	start: Vec3,
	leaderPoint: Vec3,
	terrain: TerrainData,
	random: SeededRandom
): Vec3 {
	const towardLeader = subtract(leaderPoint, start);
	const horizontalLength = Math.hypot(towardLeader.x, towardLeader.z);
	const directionX = horizontalLength > 1e-6 ? towardLeader.x / horizontalLength : 0;
	const directionZ = horizontalLength > 1e-6 ? towardLeader.z / horizontalLength : 0;
	const initialHorizontalReach = 20 + random.nextFloat() * 22;
	const desiredVerticalReach = 112 + random.nextFloat() * 40;

	for (let attempt = 0; attempt < 9; attempt += 1) {
		const horizontalReach = initialHorizontalReach * Math.pow(0.5, attempt);
		const endX = start.x + directionX * horizontalReach;
		const endZ = start.z + directionZ * horizontalReach;
		let requiredVerticalReach = desiredVerticalReach;
		for (let sampleIndex = 1; sampleIndex <= 12; sampleIndex += 1) {
			const fraction = sampleIndex / 12;
			const x = start.x + (endX - start.x) * fraction;
			const z = start.z + (endZ - start.z) * fraction;
			const requiredHeight = sampleTerrainHeight(terrain, x, z) + 10;
			requiredVerticalReach = Math.max(
				requiredVerticalReach,
				(requiredHeight - start.y) / fraction
			);
		}
		const maximumVerticalReach = Math.sqrt(
			Math.max(0, ENGINE_LIMITS.maximumSegmentMetres ** 2 - horizontalReach * horizontalReach)
		);
		if (requiredVerticalReach <= maximumVerticalReach) {
			return {
				x: endX,
				y: start.y + Math.max(0, requiredVerticalReach),
				z: endZ
			};
		}
	}

	return {
		x: start.x,
		y: start.y + Math.min(150, ENGINE_LIMITS.maximumSegmentMetres - 1),
		z: start.z
	};
}

function makeStreamers(
	attachment: Attachment,
	scored: readonly ScoredAttachment[],
	segments: readonly LightningSegment[],
	terrain: TerrainData,
	type: FlashType,
	random: SeededRandom
): UpwardStreamer[] {
	const mainSegments = segments.filter((segment) => segment.isMainChannel);
	const connectionSegments = mainSegments.filter((segment) => segment.isAttachmentConnection);
	const finalConnectionSegment = connectionSegments.at(-1);
	const leaderPoint = finalConnectionSegment?.start ?? attachment.position;
	const attachmentStep = finalConnectionSegment?.birthStep ?? mainSegments.length;
	const plausible = scored
		.filter((entry) => distance(entry.candidate.position, attachment.position) < 2_800)
		.slice(0, type === 'positive-cg' ? 3 : 5);
	const winner = scored.find((entry) => entry.candidate.id === attachment.candidateId);
	const existingWinnerIndex = plausible.findIndex(
		(entry) => entry.candidate.id === attachment.candidateId
	);
	if (existingWinnerIndex >= 0) plausible.splice(existingWinnerIndex, 1);
	if (winner) plausible.unshift(winner);
	if (plausible.length < 2) {
		const supplementary = terrain.candidates
			.filter(
				(candidate) =>
					candidate.id !== attachment.candidateId &&
					!plausible.some((entry) => entry.candidate.id === candidate.id)
			)
			.sort(
				(a, b) =>
					distance(a.position, attachment.position) - distance(b.position, attachment.position) ||
					a.id.localeCompare(b.id)
			)[0];
		if (supplementary) plausible.push({ candidate: supplementary, score: 0, weight: 0 });
	}

	return plausible.slice(0, type === 'positive-cg' ? 2 : 4).map((entry, index) => {
		const won = entry.candidate.id === attachment.candidateId;
		const start = { ...entry.candidate.position };
		const streamerRandom = random.fork(`streamer-${index}`);
		return {
			id: `streamer-${index}-${entry.candidate.id}`,
			candidateId: entry.candidate.id,
			candidateLabel: entry.candidate.label,
			start,
			end: won
				? { ...leaderPoint }
				: safeLosingStreamerEnd(start, leaderPoint, terrain, streamerRandom),
			startedAtStep: Math.max(0, attachmentStep - 2 - index),
			won
		};
	});
}

function observerPosition(state: SerializableAtlasState, terrain: TerrainData): Vec3 {
	const ground = normalizedToWorld(state.observer, terrain.widthMetres, terrain.depthMetres);
	return { x: ground.x, y: sampleTerrainHeight(terrain, ground.x, ground.z) + 1.7, z: ground.z };
}

function distanceToSegment(point: Vec3, start: Vec3, end: Vec3): number {
	const segment = subtract(end, start);
	const lengthSquared = dot(segment, segment);
	if (lengthSquared <= 1e-9) return distance(point, start);
	const projection = clamp(dot(subtract(point, start), segment) / lengthSquared, 0, 1);
	return distance(point, add(start, scale(segment, projection)));
}

function distanceToChannel(observer: Vec3, segments: readonly LightningSegment[]): number {
	let closest = Number.POSITIVE_INFINITY;
	for (const segment of segments) {
		closest = Math.min(closest, distanceToSegment(observer, segment.start, segment.end));
	}
	return Number.isFinite(closest) ? closest : 0;
}

function totalLength(segments: readonly LightningSegment[], onlyMain = false): number {
	return segments.reduce(
		(total, segment) =>
			total + (onlyMain && !segment.isMainChannel ? 0 : distance(segment.start, segment.end)),
		0
	);
}

function narrativeFor(
	type: FlashType,
	attachment: Attachment | undefined,
	branchCount: number,
	streamers: readonly UpwardStreamer[],
	thunderDelay: number
): string {
	if (type === 'intra-cloud') {
		return `An intra-cloud flash crossed between oppositely charged parts of the storm and produced ${branchCount} visible branches. It did not attach to the ground. Simulated thunder reaches the observer after ${thunderDelay.toFixed(1)} seconds.`;
	}
	const typeLabel =
		type === 'positive-cg' ? 'positive cloud-to-ground' : 'negative cloud-to-ground';
	const attempted = streamers.length;
	return `A ${typeLabel} flash developed ${branchCount} visible branches. ${attempted} upward streamer${attempted === 1 ? '' : 's'} formed, and ${attachment?.label ?? 'a terrain point'} connected first. The return stroke travelled upward through the established channel. Simulated thunder reaches the observer after ${thunderDelay.toFixed(1)} seconds.`;
}

export function generateLightningFlash(input: GenerateFlashInput): {
	flash: LightningFlash;
	terrain: TerrainData;
} {
	const { state, strikeIndex } = input;
	const terrain =
		input.terrain ??
		generateTerrain(
			state.terrain,
			state.seed,
			state.placedFeatures,
			65,
			state.environment.surfaceWetness
		);
	const random = new SeededRandom(`${state.seed}|leader-propagation|${strikeIndex}`);
	const type = selectFlashType(state, strikeIndex);
	const pockets = createChargePockets(state, terrain);
	const rawRoot = rootForFlash(type, pockets, random.fork('root'));
	const root = {
		...rawRoot,
		x: clamp(rawRoot.x, -terrain.widthMetres / 2, terrain.widthMetres / 2),
		z: clamp(rawRoot.z, -terrain.depthMetres / 2, terrain.depthMetres / 2)
	};
	let attachment: Attachment | undefined;
	let scored: ScoredAttachment[] = [];
	let segments: LightningSegment[];
	let mainPath: number[];
	if (type === 'intra-cloud') {
		const rawTarget = intraCloudDestination(pockets, root, random.fork('intra-cloud-destination'));
		const target = {
			...rawTarget,
			x: clamp(rawTarget.x, -terrain.widthMetres / 2, terrain.widthMetres / 2),
			z: clamp(rawTarget.z, -terrain.depthMetres / 2, terrain.depthMetres / 2)
		};
		({ segments, mainPath } = generateChannel(
			root,
			target,
			type,
			state,
			terrain,
			pockets,
			random.fork('channel')
		));
	} else {
		const result = generateGroundChannel(
			root,
			type,
			state,
			terrain,
			pockets,
			strikeIndex,
			random.fork('channel')
		);
		segments = result.segments;
		mainPath = result.mainPath;
		attachment = result.attachment;
		scored = result.scored;
	}
	applySegmentHierarchy(segments, mainPath, state.strikeScale);
	const streamers = attachment
		? makeStreamers(attachment, scored, segments, terrain, type, random.fork('streamers'))
		: [];
	const observer = observerPosition(state, terrain);
	const observerDistanceMetres = distanceToChannel(observer, segments);
	const thunderDelaySeconds = observerDistanceMetres / SPEED_OF_SOUND_METRES_PER_SECOND;
	const branchCount = segments.filter(
		(segment) =>
			!segment.isAttachmentConnection &&
			segment.parentIndex >= 0 &&
			segments[segment.parentIndex]?.branchDepth < segment.branchDepth
	).length;
	const maximumBranchDepth = segments.reduce(
		(maximum, segment) => Math.max(maximum, segment.branchDepth),
		0
	);
	const hasSubsequentStroke =
		type === 'negative-cg' && random.fork('subsequent-stroke').nextFloat() < 0.38;
	const leaderSegmentCount = segments.filter((segment) => !segment.isAttachmentConnection).length;
	const phaseEvents = createPhaseEvents(
		type,
		hasSubsequentStroke,
		thunderDelaySeconds,
		leaderSegmentCount
	);
	const dischargeEvent = phaseEvents.find(
		(event) => event.phase === 'return-stroke' || event.phase === 'in-cloud-pulse'
	);
	const thunderArrivalTime = (dischargeEvent?.startTime ?? 0) + thunderDelaySeconds;
	const channelLengthMetres = totalLength(segments);
	const mainChannelLengthMetres = totalLength(segments, true);
	const relativeIntensity = clamp(
		0.36 +
			state.storm.chargeStrength * 0.46 +
			(type === 'positive-cg' ? 0.16 : 0) +
			strikeScaleProfile(state.strikeScale).intensityBoost +
			random.fork('relative-intensity').normal(0, 0.045),
		0.18,
		1
	);
	const flash: LightningFlash = {
		id: `${state.seed}-${strikeIndex}-${type}`,
		seed: state.seed,
		strikeIndex,
		type,
		strikeScale: state.strikeScale,
		startedAt: 0,
		segments,
		streamers,
		attachment,
		mainPath,
		phaseEvents,
		relativeIntensity,
		channelLengthMetres,
		mainChannelLengthMetres,
		branchCount,
		maximumBranchDepth,
		thunderDelaySeconds,
		thunderArrivalTime,
		observerDistanceMetres,
		hasSubsequentStroke,
		narrative: narrativeFor(type, attachment, branchCount, streamers, thunderDelaySeconds),
		channelHash: '',
		modelState: {
			...state,
			stormPosition: { ...state.stormPosition },
			storm: { ...state.storm },
			environment: { ...state.environment },
			observer: { ...state.observer },
			visibleLayers: [...state.visibleLayers],
			placedFeatures: state.placedFeatures.map((feature) => ({ ...feature })),
			selectedStrikeIndex: strikeIndex
		}
	};
	flash.channelHash = flashHash(flash);
	return { flash, terrain };
}

export function flashDuration(flash: LightningFlash): number {
	return flash.phaseEvents.at(-1)?.endTime ?? 0;
}

export function phaseAtTime(flash: LightningFlash, time: number) {
	const bounded = clamp(time, 0, flashDuration(flash));
	return (
		flash.phaseEvents.find((event) => bounded >= event.startTime && bounded < event.endTime) ??
		flash.phaseEvents.at(-1)
	);
}
