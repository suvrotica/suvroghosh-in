import { buildBodyAxis } from './body-axis';
import { buildBodyGraph } from './body-grammar';
import { normalizeGenome } from './genome';
import { getCreaturePreset, getWorldPreset } from './presets';
import { createNamedStream, hashString32 } from './seed';
import { generateSurfaceSamples } from './surface-sampling';
import type {
	AppendageSocket,
	AxisPoint,
	BodyPlate,
	CreatureGenome,
	CreaturePhenotype,
	EyePhenotype,
	FlexibleAppendagePhenotype,
	LimbPhenotype,
	SurfaceSample,
	Vec2,
	WingPhenotype
} from './types';
import { applyWorldTransform, describeWorldTransform } from './world-transforms';

const NAME_PREFIXES = Object.freeze([
	'Glassback',
	'Cobalt',
	'Ash',
	'Mirror',
	'Velvet',
	'Oxide',
	'Ember',
	'Frost',
	'Opal',
	'Smoke',
	'Mercury',
	'Sulphur'
] as const);

const NAME_FORMS = Object.freeze([
	'Knifemite',
	'Scuttler',
	'Hinge Spider',
	'Needlewalker',
	'Cryptomantis',
	'Hull Tick',
	'Lantern Crawler',
	'Razorback',
	'Whisper Beetle',
	'Brine Stalker',
	'Plate Widow'
] as const);

const DESIGNATION_PREFIX = Object.freeze({
	'terrestrial-insect': 'IN',
	'terrestrial-arachnid': 'AR',
	myriapod: 'MY',
	'armoured-crawler': 'CR',
	'xeno-bilateral': 'XN',
	'xeno-radial': 'XR',
	unclassified: 'UF'
} as const);

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(value: number): number {
	const bounded = clamp(value, 0, 1);
	return bounded * bounded * (3 - 2 * bounded);
}

function mix(left: number, right: number, amount: number): number {
	return left + (right - left) * amount;
}

/** A piecewise head/central/terminal shell envelope evaluated in arc-length space. */
export function regionEnvelopeAt(
	genomeInput: CreatureGenome,
	regionBoundaries: readonly number[],
	s: number
): number {
	const genome = normalizeGenome(genomeInput);
	const normalized = clamp(Number.isFinite(s) ? s : 0, 0, 1);
	const segmentDivisor = Math.max(1, genome.bodySegments - 1);
	const firstBoundary = clamp((regionBoundaries[1] ?? 1) / segmentDivisor, 0.05, 0.65);
	const terminalBoundary = clamp(
		(regionBoundaries[Math.max(1, regionBoundaries.length - 2)] ?? genome.bodySegments - 1) /
			segmentDivisor,
		firstBoundary + 0.05,
		0.95
	);

	if (normalized <= firstBoundary) {
		return mix(genome.headScale, genome.centralScale, smoothstep(normalized / firstBoundary));
	}
	return mix(
		genome.centralScale,
		genome.terminalScale,
		smoothstep((normalized - terminalBoundary) / Math.max(0.001, 1 - terminalBoundary))
	);
}

function buildAxisControlPoints(genome: CreatureGenome): readonly Vec2[] {
	const halfLength = genome.bodyLength * 0.5;
	return Object.freeze(
		Array.from({ length: 5 }, (_, index) => {
			const s = index / 4;
			const centred = s * 2 - 1;
			const curve = Math.sin(s * Math.PI) * genome.axisCurvature;
			const bend = genome.lateralBend * centred * centred * centred;
			const asymmetry = genome.asymmetry * genome.bodyWidth * 0.08 * Math.sin(s * Math.PI * 3);
			return Object.freeze({
				x: -halfLength + genome.bodyLength * s,
				y: genome.bodyWidth * (curve + bend) + asymmetry
			});
		})
	);
}

function buildRadialAxis(genome: CreatureGenome): readonly AxisPoint[] {
	const radiusX = genome.bodyLength * 0.34;
	const radiusY = genome.bodyLength * 0.3 * (1 - genome.compression * 0.24);
	return Object.freeze(
		Array.from({ length: genome.bodySegments }, (_, index) => {
			const s = index / genome.bodySegments;
			const angle = Math.PI + Math.PI * 2 * s;
			const perturbation = 1 + genome.asymmetry * 0.06 * Math.sin(angle * 3);
			const derivative = {
				x: -radiusX * Math.sin(angle),
				y: radiusY * Math.cos(angle)
			};
			const magnitude = Math.max(1e-9, Math.hypot(derivative.x, derivative.y));
			const tangent = Object.freeze({
				x: derivative.x / magnitude,
				y: derivative.y / magnitude
			});
			return Object.freeze({
				s,
				position: Object.freeze({
					x: Math.cos(angle) * radiusX * perturbation,
					y: Math.sin(angle) * radiusY * perturbation
				}),
				tangent,
				normal: Object.freeze({ x: -tangent.y, y: tangent.x }),
				depth: genome.dorsalArch * genome.bodyWidth * Math.cos(angle) * 0.5
			});
		})
	);
}

function buildPlates(
	genome: CreatureGenome,
	graph: CreaturePhenotype['graph'],
	axis: CreaturePhenotype['axis']
): readonly BodyPlate[] {
	const stream = createNamedStream(genome.seed, 'phenotype:plates');
	const segmentPitch = genome.bodyLength / Math.max(1, genome.bodySegments - 1);
	return Object.freeze(
		axis.map((axisPoint, segmentIndex) => {
			const envelope = regionEnvelopeAt(genome, graph.regionBoundaries, axisPoint.s);
			const bodyNode = graph.nodes.find(
				(node) => node.kind === 'body-segment' && node.segmentIndex === segmentIndex
			);
			const asymmetry =
				stream.float(-1, 1) *
				genome.asymmetry *
				genome.bodyWidth *
				(segmentIndex === 0 ? 0.2 : 0.08);
			const center = {
				x: axisPoint.position.x + axisPoint.normal.x * asymmetry,
				y: axisPoint.position.y + axisPoint.normal.y * asymmetry
			};
			const terminalTaper = 1 - genome.taper * smoothstep(axisPoint.s);
			const height = Math.max(
				0.002,
				genome.bodyWidth * envelope * terminalTaper * (1 + genome.lateralFlare * 0.32)
			);
			const width = Math.max(
				0.002,
				segmentPitch * (1 + genome.segmentOverlap) * (1 - genome.compression * 0.2)
			);
			return Object.freeze({
				id: `plate:${segmentIndex}`,
				segmentIndex,
				region: bodyNode?.region ?? 0,
				center: Object.freeze(center),
				tangent: axisPoint.tangent,
				normal: axisPoint.normal,
				width,
				height,
				rotation: Math.atan2(axisPoint.tangent.y, axisPoint.tangent.x),
				depth: axisPoint.depth + stream.float(-0.004, 0.004) * genome.asymmetry,
				exponent: genome.shellExponent,
				lobeAmplitude: genome.serration * 0.16,
				lobeCount: genome.serration <= 0.02 ? 0 : Math.max(3, Math.round(3 + genome.serration * 9)),
				ridge: genome.dorsalRidge * mix(0.7, 1, envelope),
				seed: stream.nextUint32(),
				damage: clamp(genome.corrosion * stream.float(0.45, 1.15), 0, 1)
			});
		})
	);
}

function pairIndexFromSocket(socket: AppendageSocket): number {
	const parsed = Number(socket.id.split(':')[1]);
	return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function limbPhase(genome: CreatureGenome, pairIndex: number, side: -1 | 1): number {
	if (genome.gait === 'tripod') return (pairIndex + (side > 0 ? 1 : 0)) % 2 === 0 ? 0 : 0.5;
	if (genome.gait === 'wave') {
		return (pairIndex / Math.max(1, genome.walkingLegPairs) + (side > 0 ? 0.5 : 0)) % 1;
	}
	if (genome.gait === 'arachnoid-scuttle') {
		return ((pairIndex % 2) * 0.5 + (side > 0 ? 0.25 : 0)) % 1;
	}
	return (pairIndex / Math.max(1, genome.walkingLegPairs) + (side > 0 ? 0.37 : 0)) % 1;
}

function limbKind(genome: CreatureGenome, socket: AppendageSocket): LimbPhenotype['kind'] {
	if (socket.kind === 'grasping') return 'grasping';
	if (genome.bodyPlan === 'myriapod' && genome.world === 'brine-under-ice') return 'paddle';
	if (genome.bodyPlan === 'xeno-radial' || genome.world === 'orbital-ruin') return 'clamp';
	if (genome.bodyPlan === 'armoured-crawler') return 'ventral';
	return 'walking';
}

function buildLimbs(
	genome: CreatureGenome,
	graph: CreaturePhenotype['graph'],
	plates: readonly BodyPlate[]
): readonly LimbPhenotype[] {
	const stream = createNamedStream(genome.seed, 'phenotype:limbs');
	const sockets = graph.sockets.filter(
		(socket): socket is AppendageSocket & { side: -1 | 1 } =>
			(socket.kind === 'walking' || socket.kind === 'grasping') && socket.side !== 0
	);
	return Object.freeze(
		sockets.map((socket) => {
			const pairIndex = pairIndexFromSocket(socket);
			const boneCount =
				socket.kind === 'grasping' ? Math.max(2, genome.legBones - 1) : genome.legBones;
			const totalLength = Math.max(
				0.01,
				genome.bodyLength * genome.legLength * (socket.kind === 'grasping' ? 0.72 : 1)
			);
			const weights = Array.from({ length: boneCount }, (_, index) =>
				Math.max(0.35, 1 - index * 0.13 + stream.float(-0.025, 0.025))
			);
			const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
			const boneLengths = Object.freeze(
				weights.map((weight) => (totalLength * weight) / weightSum)
			);
			const proximalThickness = Math.max(0.002, genome.bodyWidth * genome.legThickness * 0.62);
			const thicknesses = Object.freeze(
				Array.from({ length: boneCount }, (_, index) =>
					Math.max(0.001, proximalThickness * (1 - (index / Math.max(1, boneCount)) * 0.58))
				)
			);
			const rootPlate = plates[socket.segmentIndex];
			return Object.freeze({
				id: socket.id,
				kind: limbKind(genome, socket),
				rootSegment: socket.segmentIndex,
				side: socket.side,
				pairIndex,
				rootOffset: (rootPlate?.height ?? genome.bodyWidth) * 0.42,
				boneLengths,
				thicknesses,
				preferredBend: (socket.side < 0 ? -1 : 1) as -1 | 1,
				phaseOffset: limbPhase(genome, pairIndex, socket.side),
				clawCount: socket.kind === 'grasping' ? Math.max(1, genome.clawCount) : genome.clawCount,
				depth: (rootPlate?.depth ?? 0) + (socket.side < 0 ? -0.012 : 0.012)
			});
		})
	);
}

function buildEyes(
	genome: CreatureGenome,
	graph: CreaturePhenotype['graph'],
	plates: readonly BodyPlate[]
): readonly EyePhenotype[] {
	const stream = createNamedStream(genome.seed, 'phenotype:eyes');
	const eyeNodes = graph.nodes.filter((node) => node.kind === 'eye');
	return Object.freeze(
		eyeNodes.map((node, eyeIndex) => {
			const plate = plates[node.segmentIndex] ?? plates[0];
			const count = Math.max(1, eyeNodes.length);
			let angle = (eyeIndex / count) * Math.PI * 2;
			if (genome.eyeLayout === 'frontal-pair' || genome.eyeLayout === 'lateral-compound') {
				angle = eyeIndex % 2 === 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
			} else if (genome.eyeLayout === 'dorsal-ocelli') {
				angle = mix(-Math.PI * 0.8, -Math.PI * 0.2, count === 1 ? 0.5 : eyeIndex / (count - 1));
			} else if (genome.eyeLayout !== 'annular') {
				angle = stream.float(-Math.PI * 0.95, Math.PI * 0.95);
			}
			const radial = (plate?.height ?? genome.bodyWidth) * stream.float(0.24, 0.42);
			const asymmetry = 1 + stream.float(-genome.eyeAsymmetry, genome.eyeAsymmetry);
			return Object.freeze({
				id: node.id,
				segmentIndex: node.segmentIndex,
				local: Object.freeze({
					x: Math.cos(angle) * (plate?.width ?? genome.bodyWidth) * 0.24,
					y: Math.sin(angle) * radial
				}),
				radius: Math.max(0.001, genome.bodyWidth * genome.eyeScale * 0.16 * asymmetry),
				depth: (plate?.depth ?? 0) + stream.float(0.006, 0.018),
				seed: stream.nextUint32()
			});
		})
	);
}

function chainLengths(totalLength: number, count: number): readonly number[] {
	const boundedCount = Math.max(2, Math.round(count));
	const weightSum = (boundedCount * (boundedCount + 1)) / 2;
	return Object.freeze(
		Array.from({ length: boundedCount }, (_, index) =>
			Math.max(0.0001, (totalLength * (boundedCount - index)) / weightSum)
		)
	);
}

function buildFlexibleAppendages(
	genome: CreatureGenome,
	graph: CreaturePhenotype['graph']
): readonly FlexibleAppendagePhenotype[] {
	const appendages: FlexibleAppendagePhenotype[] = [];
	for (const socket of graph.sockets.filter((candidate) => candidate.kind === 'antenna')) {
		appendages.push(
			Object.freeze({
				id: socket.id,
				kind: 'antenna',
				rootSegment: socket.segmentIndex,
				side: socket.side,
				lengths: chainLengths(genome.bodyLength * genome.antennaLength, 5),
				depth: socket.side * 0.014
			})
		);
	}

	if (genome.palpLength > 0) {
		for (const socket of graph.sockets.filter((candidate) => candidate.kind === 'grasping')) {
			appendages.push(
				Object.freeze({
					id: `palp:${socket.id}`,
					kind: 'palp',
					rootSegment: socket.segmentIndex,
					side: socket.side,
					lengths: chainLengths(genome.bodyLength * genome.palpLength, 4),
					depth: socket.side * 0.01
				})
			);
		}
	}

	const terminal = graph.sockets.find((socket) => socket.kind === 'terminal');
	if (terminal) {
		const totalLength = genome.bodyLength * mix(0.22, 0.55, genome.terminalScale / 1.4);
		if (genome.terminalModule === 'split-cerci' || genome.terminalModule === 'fan') {
			for (const side of [-1, 1] as const) {
				appendages.push(
					Object.freeze({
						id: `terminal:cercus:${side}`,
						kind: 'cercus',
						rootSegment: terminal.segmentIndex,
						side,
						lengths: chainLengths(totalLength, 4),
						depth: side * 0.01
					})
				);
			}
		} else {
			appendages.push(
				Object.freeze({
					id: `terminal:${genome.terminalModule}`,
					kind: genome.terminalModule === 'lure' ? 'lure' : 'tail',
					rootSegment: terminal.segmentIndex,
					side: 0,
					lengths: chainLengths(totalLength, 6),
					depth: 0
				})
			);
		}
	}

	return Object.freeze(appendages);
}

function buildWings(
	genome: CreatureGenome,
	graph: CreaturePhenotype['graph']
): readonly WingPhenotype[] {
	const stream = createNamedStream(genome.seed, 'phenotype:wings');
	const posture = {
		folded: { length: 0.34, width: 0.2, sweep: 0.22, depth: -0.004 },
		'half-open': { length: 0.46, width: 0.56, sweep: 0.54, depth: 0.004 },
		display: { length: 0.58, width: 0.92, sweep: 0.82, depth: 0.014 },
		dormant: { length: 0.3, width: 0.14, sweep: 0.12, depth: -0.008 },
		none: { length: 0, width: 0, sweep: 0, depth: 0 }
	}[genome.wingMode];
	return Object.freeze(
		graph.sockets
			.filter(
				(socket): socket is AppendageSocket & { side: -1 | 1 } =>
					socket.kind === 'wing' && socket.side !== 0
			)
			.map((socket) => {
				const pairIndex = pairIndexFromSocket(socket);
				const length = genome.bodyLength * (posture.length + pairIndex * 0.035);
				const width = genome.bodyWidth * posture.width * (1 + stream.float(-0.04, 0.04));
				const side = socket.side;
				const outline: readonly Vec2[] = Object.freeze([
					Object.freeze({ x: 0, y: 0 }),
					Object.freeze({ x: length * 0.28, y: side * width * 0.46 * posture.sweep }),
					Object.freeze({ x: length, y: side * width * 0.25 * posture.sweep }),
					Object.freeze({ x: length * 0.72, y: side * width * 0.06 * posture.sweep })
				]);
				const root = outline[0];
				const veins: readonly (readonly [Vec2, Vec2])[] = Object.freeze([
					Object.freeze([root, outline[1]] as const),
					Object.freeze([root, outline[2]] as const),
					Object.freeze([outline[1], outline[2]] as const)
				]);
				return Object.freeze({
					id: socket.id,
					rootSegment: socket.segmentIndex,
					side,
					outline,
					veins,
					depth: side * 0.018 + posture.depth - pairIndex * 0.003
				});
			})
	);
}

function sampleKind(
	genome: CreatureGenome,
	plate: BodyPlate,
	kind: SurfaceSample['kind'],
	density: number,
	maximum: number
): readonly SurfaceSample[] {
	const count = Math.round(clamp(density, 0, 1) * maximum);
	if (count === 0) return [];
	const radiusX = plate.width * 0.47;
	const radiusY = plate.height * 0.47;
	const areaScale = Math.sqrt((radiusX * radiusY) / Math.max(1, count));
	return generateSurfaceSamples({
		seed: genome.seed,
		namespace: `phenotype:surface:${plate.segmentIndex}:${kind}`,
		plateIndex: plate.segmentIndex,
		kind,
		count,
		minimumDistance: Math.max(0.0005, areaScale * 0.5),
		mask: {
			radiusX,
			radiusY,
			exponent: plate.exponent,
			lobeAmplitude: plate.lobeAmplitude,
			lobeCount: plate.lobeCount
		},
		edgePadding: Math.min(radiusX, radiusY) * 0.08,
		minimumScale: kind === 'spine' ? 0.72 : 0.35,
		maximumScale: kind === 'spine' ? 1.25 : 0.9,
		radialAngle: kind === 'bristle' || kind === 'spine'
	});
}

function buildSurfaceSamples(
	genome: CreatureGenome,
	plates: readonly BodyPlate[]
): readonly SurfaceSample[] {
	const samples: SurfaceSample[] = [];
	for (const plate of plates) {
		samples.push(...sampleKind(genome, plate, 'pore', genome.poreDensity, 12));
		samples.push(...sampleKind(genome, plate, 'bristle', genome.bristleDensity, 9));
		samples.push(...sampleKind(genome, plate, 'spine', genome.spineDensity, 7));
		samples.push(...sampleKind(genome, plate, 'pit', genome.corrosion, 5));
	}
	return Object.freeze(samples);
}

function isUnmodifiedPreset(genome: CreatureGenome): boolean {
	const preset = getCreaturePreset(genome.preset);
	return (
		genome.seed === preset.genome.seed && JSON.stringify(genome) === JSON.stringify(preset.genome)
	);
}

function archiveDesignation(genome: CreatureGenome): string {
	if (isUnmodifiedPreset(genome)) return getCreaturePreset(genome.preset).designation;
	const prefix = DESIGNATION_PREFIX[genome.bodyPlan];
	return `${prefix}-${String(hashString32(`designation:${genome.seed}`) % 10_000).padStart(4, '0')}`;
}

function informalName(genome: CreatureGenome): string {
	if (isUnmodifiedPreset(genome)) return getCreaturePreset(genome.preset).name;
	const stream = createNamedStream(genome.seed, 'phenotype:name');
	return `${stream.pick(NAME_PREFIXES)} ${stream.pick(NAME_FORMS)}`;
}

function phenotypeFingerprint(
	genome: CreatureGenome,
	graph: CreaturePhenotype['graph'],
	plates: readonly BodyPlate[],
	limbs: readonly LimbPhenotype[]
): string {
	const identity = JSON.stringify({
		genome,
		boundaries: graph.regionBoundaries,
		nodes: graph.nodes.map((node) => [node.id, node.segmentIndex]),
		plates: plates.map((plate) => [plate.width, plate.height, plate.seed]),
		limbs: limbs.map((limb) => [limb.id, limb.boneLengths])
	});
	const first = hashString32(`phenotype:v1:${identity}`).toString(16).padStart(8, '0');
	const second = hashString32(`phenotype:v1:tail:${identity}`).toString(16).padStart(8, '0');
	return `ce1-${first}${second}`;
}

/**
 * Builds the immutable phenotype from a stored genome. The `genome` member is
 * world-derived; `baseGenome` remains the serializable source of truth.
 */
export function buildCreaturePhenotype(genomeInput: CreatureGenome): CreaturePhenotype {
	const baseGenome = normalizeGenome(genomeInput);
	const genome = applyWorldTransform(baseGenome);
	const graph = buildBodyGraph(genome);
	const axis = Object.freeze(
		genome.bodyPlan === 'xeno-radial'
			? buildRadialAxis(genome)
			: buildBodyAxis(buildAxisControlPoints(genome), genome.bodySegments, {
					samplesPerSegment: 48,
					depth: (s) => genome.dorsalArch * genome.bodyWidth * Math.sin(s * Math.PI)
				})
	);
	const plates = buildPlates(genome, graph, axis);
	const limbs = buildLimbs(genome, graph, plates);
	const eyes = buildEyes(genome, graph, plates);
	const flexibleAppendages = buildFlexibleAppendages(genome, graph);
	const wings = buildWings(genome, graph);
	const surfaceSamples = buildSurfaceSamples(genome, plates);
	const world = getWorldPreset(baseGenome.world);
	const mechanisms = describeWorldTransform(baseGenome);
	const designation = archiveDesignation(baseGenome);
	const name = informalName(baseGenome);
	const proceduralSummary = `${plates.length} plates, ${limbs.length} articulated appendages, ${eyes.length} visible sensory nodes, and ${wings.length} wing membranes were assembled from a connected ${baseGenome.bodyPlan} body-plan grammar. ${mechanisms.join('; ')}.`;

	return Object.freeze({
		genome,
		baseGenome,
		graph,
		axis,
		plates,
		limbs,
		eyes,
		flexibleAppendages,
		wings,
		surfaceSamples,
		archiveDesignation: designation,
		informalName: name,
		habitatNote: `Fictional archive habitat — ${world.fiction}`,
		proceduralSummary,
		fingerprint: phenotypeFingerprint(genome, graph, plates, limbs)
	});
}

export const buildPhenotype = buildCreaturePhenotype;
