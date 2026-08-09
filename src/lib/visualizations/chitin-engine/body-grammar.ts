import { normalizeGenome } from './genome';
import type {
	AppendageSocket,
	BodyGraph,
	BodyGraphEdge,
	BodyGraphNode,
	CreatureGenome
} from './types';

export type BodyGraphValidationResult = Readonly<{
	valid: boolean;
	issues: readonly string[];
}>;

const WING_COMPATIBLE_PLANS = Object.freeze([
	'terrestrial-insect',
	'xeno-bilateral',
	'unclassified'
] as const);

function clampInteger(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function genericBoundaries(segmentCount: number, requestedRegions: number): number[] {
	const regionCount = clampInteger(requestedRegions, 1, segmentCount);
	return Array.from({ length: regionCount + 1 }, (_, index) =>
		index === regionCount ? segmentCount : Math.floor((index * segmentCount) / regionCount)
	);
}

/**
 * Terrestrial discipline fixes the gross tagmata used by the attachment rules.
 * Xeno families retain the authored region count, while still receiving a
 * connected axial partition.
 */
export function bodyRegionBoundaries(genomeInput: CreatureGenome): readonly number[] {
	const genome = normalizeGenome(genomeInput);
	const segmentCount = genome.bodySegments;

	switch (genome.bodyPlan) {
		case 'terrestrial-insect': {
			const headEnd = clampInteger(segmentCount * 0.2, 1, Math.max(1, segmentCount - 2));
			const thoraxEnd = clampInteger(headEnd + 3, headEnd + 1, segmentCount - 1);
			return Object.freeze([0, headEnd, thoraxEnd, segmentCount]);
		}
		case 'terrestrial-arachnid':
			return Object.freeze([
				0,
				clampInteger(segmentCount * 0.38, 1, segmentCount - 1),
				segmentCount
			]);
		case 'myriapod':
			return Object.freeze([0, 1, segmentCount]);
		default:
			return Object.freeze(genericBoundaries(segmentCount, genome.bodyRegions));
	}
}

function regionForSegment(boundaries: readonly number[], segmentIndex: number): number {
	for (let region = 0; region < boundaries.length - 1; region += 1) {
		if (segmentIndex >= boundaries[region] && segmentIndex < boundaries[region + 1]) return region;
	}
	return Math.max(0, boundaries.length - 2);
}

function spreadRoots(count: number, first: number, last: number): readonly number[] {
	if (count <= 0) return [];
	const lower = Math.min(first, last);
	const upper = Math.max(first, last);
	if (count === 1) return [Math.round((lower + upper) * 0.5)];
	return Array.from({ length: count }, (_, index) =>
		Math.round(lower + ((upper - lower) * index) / (count - 1))
	);
}

function walkingRootRange(
	genome: CreatureGenome,
	boundaries: readonly number[]
): readonly [number, number] {
	const lastNonTerminal = Math.max(0, genome.bodySegments - 2);
	switch (genome.bodyPlan) {
		case 'terrestrial-insect':
			return [boundaries[1], Math.max(boundaries[1], boundaries[2] - 1)];
		case 'terrestrial-arachnid':
			return [0, Math.max(0, boundaries[1] - 1)];
		case 'myriapod':
			return [1, Math.max(1, lastNonTerminal)];
		default:
			return [Math.min(1, lastNonTerminal), lastNonTerminal];
	}
}

function appendPairedNodes(
	nodes: BodyGraphNode[],
	edges: BodyGraphEdge[],
	sockets: AppendageSocket[],
	boundaries: readonly number[],
	kind: 'walking' | 'grasping' | 'wing',
	pairRoots: readonly number[]
): void {
	const nodeKind =
		kind === 'walking' ? 'walking-limb' : kind === 'grasping' ? 'grasping-limb' : 'wing';

	for (let pairIndex = 0; pairIndex < pairRoots.length; pairIndex += 1) {
		const root = pairRoots[pairIndex];
		const pairIds: string[] = [];
		for (const side of [-1, 1] as const) {
			const sideName = side < 0 ? 'left' : 'right';
			const id = `${kind}:${pairIndex}:${sideName}`;
			pairIds.push(id);
			nodes.push({
				id,
				kind: nodeKind,
				region: regionForSegment(boundaries, root),
				segmentIndex: root
			});
			edges.push({ from: `segment:${root}`, to: id, kind: 'attachment' });
			sockets.push({ id, segmentIndex: root, side, kind });
		}
		edges.push({ from: pairIds[0], to: pairIds[1], kind: 'paired' });
	}
}

function wingRoots(genome: CreatureGenome, boundaries: readonly number[]): readonly number[] {
	if (
		genome.wingMode === 'none' ||
		!WING_COMPATIBLE_PLANS.includes(genome.bodyPlan as (typeof WING_COMPATIBLE_PLANS)[number])
	) {
		return [];
	}
	if (genome.bodyPlan === 'terrestrial-insect') {
		return spreadRoots(2, boundaries[1], Math.max(boundaries[1], boundaries[2] - 1));
	}
	const root = clampInteger(genome.bodySegments * 0.42, 1, Math.max(1, genome.bodySegments - 2));
	return [root];
}

/** Builds a deterministic, fully connected body-plan and attachment graph. */
export function buildBodyGraph(genomeInput: CreatureGenome): BodyGraph {
	const genome = normalizeGenome(genomeInput);
	const boundaries = bodyRegionBoundaries(genome);
	const nodes: BodyGraphNode[] = [];
	const edges: BodyGraphEdge[] = [];
	const sockets: AppendageSocket[] = [];

	for (let region = 0; region < boundaries.length - 1; region += 1) {
		const representative = boundaries[region];
		nodes.push({
			id: `region:${region}`,
			kind: 'body-region',
			region,
			segmentIndex: representative
		});
		if (region > 0) {
			edges.push({ from: `region:${region - 1}`, to: `region:${region}`, kind: 'axial' });
		}
	}

	for (let segmentIndex = 0; segmentIndex < genome.bodySegments; segmentIndex += 1) {
		const region = regionForSegment(boundaries, segmentIndex);
		nodes.push({ id: `segment:${segmentIndex}`, kind: 'body-segment', region, segmentIndex });
		edges.push({ from: `region:${region}`, to: `segment:${segmentIndex}`, kind: 'attachment' });
		if (segmentIndex > 0) {
			edges.push({
				from: `segment:${segmentIndex - 1}`,
				to: `segment:${segmentIndex}`,
				kind: 'axial'
			});
		}
	}

	const [walkingFirst, walkingLast] = walkingRootRange(genome, boundaries);
	appendPairedNodes(
		nodes,
		edges,
		sockets,
		boundaries,
		'walking',
		spreadRoots(genome.walkingLegPairs, walkingFirst, walkingLast)
	);

	const graspingFirst =
		genome.bodyPlan === 'terrestrial-arachnid' ? 0 : Math.min(1, genome.bodySegments - 1);
	const graspingLast = Math.min(
		Math.max(graspingFirst, boundaries[Math.min(1, boundaries.length - 2)]),
		genome.bodySegments - 1
	);
	appendPairedNodes(
		nodes,
		edges,
		sockets,
		boundaries,
		'grasping',
		spreadRoots(genome.graspingPairs, graspingFirst, graspingLast)
	);

	for (let eyeIndex = 0; eyeIndex < genome.eyeCount; eyeIndex += 1) {
		const segmentIndex =
			genome.eyeLayout === 'annular' ? eyeIndex % Math.min(2, genome.bodySegments) : 0;
		const id = `eye:${eyeIndex}`;
		nodes.push({
			id,
			kind: 'eye',
			region: regionForSegment(boundaries, segmentIndex),
			segmentIndex
		});
		edges.push({ from: `segment:${segmentIndex}`, to: id, kind: 'attachment' });
	}

	for (let antennaIndex = 0; antennaIndex < genome.antennaCount; antennaIndex += 1) {
		const side: -1 | 0 | 1 =
			genome.antennaCount % 2 === 1 && antennaIndex === genome.antennaCount - 1
				? 0
				: antennaIndex % 2 === 0
					? -1
					: 1;
		const id = `antenna:${antennaIndex}`;
		nodes.push({ id, kind: 'antenna', region: 0, segmentIndex: 0 });
		edges.push({ from: 'segment:0', to: id, kind: 'attachment' });
		sockets.push({ id, segmentIndex: 0, side, kind: 'antenna' });
	}

	appendPairedNodes(nodes, edges, sockets, boundaries, 'wing', wingRoots(genome, boundaries));

	if (genome.terminalModule !== 'none') {
		const segmentIndex = genome.bodySegments - 1;
		const id = 'terminal:0';
		nodes.push({
			id,
			kind: 'terminal',
			region: regionForSegment(boundaries, segmentIndex),
			segmentIndex
		});
		edges.push({ from: `segment:${segmentIndex}`, to: id, kind: 'attachment' });
		sockets.push({ id, segmentIndex, side: 0, kind: 'terminal' });
	}

	return Object.freeze({
		nodes: Object.freeze(nodes),
		edges: Object.freeze(edges),
		sockets: Object.freeze(sockets),
		regionBoundaries: boundaries
	});
}

function connectedNodeIds(graph: BodyGraph, nodeIds: ReadonlySet<string>): ReadonlySet<string> {
	const adjacency = new Map<string, string[]>();
	for (const id of nodeIds) adjacency.set(id, []);
	for (const edge of graph.edges) {
		if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
		adjacency.get(edge.from)?.push(edge.to);
		adjacency.get(edge.to)?.push(edge.from);
	}
	const first = graph.nodes[0]?.id;
	if (!first) return new Set();
	const visited = new Set<string>([first]);
	const queue = [first];
	for (let index = 0; index < queue.length; index += 1) {
		for (const neighbor of adjacency.get(queue[index]) ?? []) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				queue.push(neighbor);
			}
		}
	}
	return visited;
}

/** Checks topology as well as the terrestrial attachment disciplines. */
export function validateBodyGraph(
	graph: BodyGraph,
	genomeInput: CreatureGenome
): BodyGraphValidationResult {
	const genome = normalizeGenome(genomeInput);
	const issues: string[] = [];
	const nodeIds = new Set<string>();
	for (const node of graph.nodes) {
		if (nodeIds.has(node.id)) issues.push(`Duplicate node id: ${node.id}.`);
		nodeIds.add(node.id);
		if (node.segmentIndex < 0 || node.segmentIndex >= genome.bodySegments) {
			issues.push(`Node ${node.id} has an invalid segment index.`);
		}
	}

	for (const edge of graph.edges) {
		if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
			issues.push(`Edge ${edge.from} -> ${edge.to} references a missing node.`);
		}
		if (edge.from === edge.to) issues.push(`Node ${edge.from} has a self edge.`);
	}
	for (const node of graph.nodes) {
		if (node.kind === 'body-region' || node.kind === 'body-segment') continue;
		const rootAttachments = graph.edges.filter(
			(edge) =>
				edge.kind === 'attachment' &&
				((edge.from === `segment:${node.segmentIndex}` && edge.to === node.id) ||
					(edge.to === `segment:${node.segmentIndex}` && edge.from === node.id))
		);
		if (rootAttachments.length !== 1) {
			issues.push(`Appendage node ${node.id} must have exactly one declared root attachment.`);
		}
		if (node.kind !== 'eye' && !graph.sockets.some((socket) => socket.id === node.id)) {
			issues.push(`Appendage node ${node.id} has no declared socket.`);
		}
	}

	const boundaries = graph.regionBoundaries;
	if (boundaries[0] !== 0 || boundaries[boundaries.length - 1] !== genome.bodySegments) {
		issues.push('Region boundaries must span the complete axial segment range.');
	}
	for (let index = 1; index < boundaries.length; index += 1) {
		if (boundaries[index] <= boundaries[index - 1]) {
			issues.push('Region boundaries must be strictly increasing.');
			break;
		}
	}

	for (let segmentIndex = 0; segmentIndex < genome.bodySegments; segmentIndex += 1) {
		const matches = graph.nodes.filter(
			(node) => node.kind === 'body-segment' && node.segmentIndex === segmentIndex
		);
		if (matches.length !== 1) issues.push(`Expected one body node for segment ${segmentIndex}.`);
	}
	for (const node of graph.nodes) {
		const expectedRegion = regionForSegment(boundaries, node.segmentIndex);
		if (node.region !== expectedRegion) {
			issues.push(`Node ${node.id} is assigned to the wrong body region.`);
		}
	}

	if (connectedNodeIds(graph, nodeIds).size !== nodeIds.size) {
		issues.push('The body graph is not connected.');
	}

	const socketIds = new Set<string>();
	for (const socket of graph.sockets) {
		if (socketIds.has(socket.id)) issues.push(`Duplicate socket id: ${socket.id}.`);
		socketIds.add(socket.id);
		const node = graph.nodes.find((candidate) => candidate.id === socket.id);
		if (!node) {
			issues.push(`Socket ${socket.id} has no appendage node.`);
			continue;
		}
		if (node.segmentIndex !== socket.segmentIndex) {
			issues.push(`Socket ${socket.id} disagrees with its node root.`);
		}
		if (
			(socket.kind === 'terminal' && socket.side !== 0) ||
			(['walking', 'grasping', 'wing'].includes(socket.kind) && socket.side === 0)
		) {
			issues.push(`Socket ${socket.id} has an invalid attachment side.`);
		}
		const expectedNodeKind = {
			walking: 'walking-limb',
			grasping: 'grasping-limb',
			antenna: 'antenna',
			wing: 'wing',
			terminal: 'terminal'
		} as const;
		if (node.kind !== expectedNodeKind[socket.kind]) {
			issues.push(`Socket ${socket.id} disagrees with its appendage kind.`);
		}
		const attached = graph.edges.some(
			(edge) =>
				edge.kind === 'attachment' &&
				((edge.from === `segment:${socket.segmentIndex}` && edge.to === socket.id) ||
					(edge.to === `segment:${socket.segmentIndex}` && edge.from === socket.id))
		);
		if (!attached) issues.push(`Socket ${socket.id} is not attached to its root segment.`);
	}

	const countSockets = (kind: AppendageSocket['kind']) =>
		graph.sockets.filter((socket) => socket.kind === kind);
	const walking = countSockets('walking');
	const grasping = countSockets('grasping');
	const antennae = countSockets('antenna');
	const wings = countSockets('wing');
	const terminals = countSockets('terminal');
	const eyes = graph.nodes.filter((node) => node.kind === 'eye');

	if (walking.length !== genome.walkingLegPairs * 2) {
		issues.push('Walking appendage count does not match the normalized genome.');
	}
	if (grasping.length !== genome.graspingPairs * 2) {
		issues.push('Grasping appendage count does not match the normalized genome.');
	}
	if (antennae.length !== genome.antennaCount) {
		issues.push('Antenna count does not match the normalized genome.');
	}
	if (eyes.length !== genome.eyeCount) {
		issues.push('Eye count does not match the normalized genome.');
	}
	const expectedTerminalCount = genome.terminalModule === 'none' ? 0 : 1;
	if (terminals.length !== expectedTerminalCount) {
		issues.push('Terminal attachment count does not match the normalized genome.');
	}
	const expectedWingCount =
		genome.wingMode === 'none'
			? 0
			: genome.bodyPlan === 'terrestrial-insect'
				? 4
				: ['xeno-bilateral', 'unclassified'].includes(genome.bodyPlan)
					? 2
					: 0;
	if (wings.length !== expectedWingCount) {
		issues.push('Wing attachment count does not match the compatible normalized genome.');
	}
	if (
		wings.length > 0 &&
		!WING_COMPATIBLE_PLANS.includes(genome.bodyPlan as (typeof WING_COMPATIBLE_PLANS)[number])
	) {
		issues.push('Wing roots are incompatible with this body-plan family.');
	}
	for (const socket of [...walking, ...grasping, ...wings]) {
		const counterparts = graph.sockets.filter(
			(candidate) =>
				candidate.kind === socket.kind &&
				candidate.segmentIndex === socket.segmentIndex &&
				candidate.side === -socket.side &&
				graph.edges.some(
					(edge) =>
						edge.kind === 'paired' &&
						((edge.from === socket.id && edge.to === candidate.id) ||
							(edge.to === socket.id && edge.from === candidate.id))
				)
		);
		if (counterparts.length !== 1) {
			issues.push(`Paired socket ${socket.id} has no unique mirrored counterpart.`);
		}
	}

	if (genome.bodyPlan === 'terrestrial-insect') {
		if (walking.length !== 6) issues.push('Terrestrial insects require three walking-leg pairs.');
		if (antennae.length !== 2) issues.push('Terrestrial insects require one antenna pair.');
		const thoraxStart = boundaries[1];
		const thoraxEnd = boundaries[2];
		if (
			[...walking, ...wings].some(
				(socket) => socket.segmentIndex < thoraxStart || socket.segmentIndex >= thoraxEnd
			)
		) {
			issues.push('Insect legs and wings must root on the thoracic region.');
		}
	} else if (genome.bodyPlan === 'terrestrial-arachnid') {
		if (walking.length !== 8) issues.push('Terrestrial arachnids require four walking-leg pairs.');
		if (antennae.length > 0 || wings.length > 0)
			issues.push('Arachnids cannot have ordinary antenna or wing roots.');
		if (walking.some((socket) => socket.segmentIndex >= boundaries[1])) {
			issues.push('Arachnid walking limbs must root on the anterior tagma.');
		}
	} else if (genome.bodyPlan === 'myriapod') {
		if (walking.length < 16) issues.push('Myriapod grammar requires at least eight walking pairs.');
		if (wings.length > 0) issues.push('Myriapod grammar has no compatible wing root.');
		if (walking.some((socket) => socket.segmentIndex < 1)) {
			issues.push('Myriapod walking limbs must root on repeated trunk segments.');
		}
	} else if (genome.bodyPlan === 'armoured-crawler') {
		if (walking.length < 12)
			issues.push('Armoured crawler grammar requires at least six walking pairs.');
		if (wings.length > 0) issues.push('Armoured crawler grammar has no compatible wing root.');
	}

	return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}
